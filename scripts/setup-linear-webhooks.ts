/**
 * Linear Webhook 一括作成スクリプト
 *
 * 使い方:
 * 1. .env.local に LINEAR_API_KEY を設定
 * 2. WEBHOOK_URL を自分の環境に合わせて変更
 * 3. npm run setup-webhooks または ts-node scripts/setup-linear-webhooks.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// .env.local を読み込み
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const LINEAR_API_KEY = process.env.LINEAR_API_KEY
const LINEAR_WEBHOOK_SECRET = process.env.LINEAR_WEBHOOK_SECRET

// あなたのWebhook URL（本番環境のURLに変更してください）
const WEBHOOK_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/linear`
  : 'https://your-domain.com/api/webhooks/linear'

// 購読するリソースタイプ
const RESOURCE_TYPES = [
  'Issue',
  'Project',
  'IssueLabel',
  // 'Comment', // 必要に応じて追加
  // 'Cycle', // 必要に応じて追加
]

interface Team {
  id: string
  name: string
  key: string
}

interface Webhook {
  id: string
  url: string
  enabled: boolean
  resourceTypes: string[]
  team?: { id: string; name: string }
}

async function fetchLinearGraphQL(query: string, variables?: Record<string, unknown>) {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': LINEAR_API_KEY || '',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
  }

  const json = await response.json()

  if (json.errors) {
    console.error('GraphQL Errors:', JSON.stringify(json.errors, null, 2))
    throw new Error(`GraphQL error: ${json.errors[0].message}`)
  }

  return json.data
}

async function getAllTeams(): Promise<Team[]> {
  console.log('📋 チーム一覧を取得中...')

  const query = `
    query {
      teams {
        nodes {
          id
          name
          key
        }
      }
    }
  `

  const data = await fetchLinearGraphQL(query)
  const teams: Team[] = data.teams.nodes

  console.log(`✅ ${teams.length}個のチームを取得しました`)
  teams.forEach(team => {
    console.log(`   - ${team.name} (${team.key})`)
  })

  return teams
}

async function getExistingWebhooks(): Promise<Webhook[]> {
  console.log('\n🔍 既存のWebhookを確認中...')

  const query = `
    query {
      webhooks {
        nodes {
          id
          url
          enabled
          resourceTypes
          team {
            id
            name
          }
        }
      }
    }
  `

  try {
    const data = await fetchLinearGraphQL(query)
    const webhooks: Webhook[] = data.webhooks.nodes

    console.log(`✅ ${webhooks.length}個の既存Webhookを発見`)

    return webhooks
  } catch (error: any) {
    if (error.message.includes('admin required')) {
      console.log('⚠️  既存Webhookの取得には管理者権限が必要です（スキップ）')
      return []
    }
    throw error
  }
}

async function createWebhook(teamId: string, teamName: string): Promise<void> {
  console.log(`\n🔧 ${teamName} のWebhookを作成中...`)

  const mutation = `
    mutation WebhookCreate($input: WebhookCreateInput!) {
      webhookCreate(input: $input) {
        success
        webhook {
          id
          url
          enabled
          resourceTypes
        }
      }
    }
  `

  const variables = {
    input: {
      url: WEBHOOK_URL,
      teamId: teamId,
      resourceTypes: RESOURCE_TYPES,
      secret: LINEAR_WEBHOOK_SECRET || undefined,
      enabled: true,
    }
  }

  try {
    const data = await fetchLinearGraphQL(mutation, variables)

    if (data.webhookCreate.success) {
      console.log(`✅ ${teamName} のWebhook作成成功`)
      console.log(`   URL: ${data.webhookCreate.webhook.url}`)
      console.log(`   リソースタイプ: ${data.webhookCreate.webhook.resourceTypes.join(', ')}`)
    } else {
      console.error(`❌ ${teamName} のWebhook作成失敗`)
    }
  } catch (error) {
    console.error(`❌ ${teamName} のWebhook作成エラー:`, error)
  }
}

async function deleteWebhook(webhookId: string, teamName: string): Promise<void> {
  console.log(`🗑️  ${teamName} の古いWebhookを削除中...`)

  const mutation = `
    mutation WebhookDelete($id: String!) {
      webhookDelete(id: $id) {
        success
      }
    }
  `

  const variables = { id: webhookId }

  try {
    const data = await fetchLinearGraphQL(mutation, variables)

    if (data.webhookDelete.success) {
      console.log(`✅ ${teamName} の古いWebhook削除成功`)
    } else {
      console.error(`❌ ${teamName} の古いWebhook削除失敗`)
    }
  } catch (error) {
    console.error(`❌ ${teamName} の古いWebhook削除エラー:`, error)
  }
}

async function main() {
  console.log('🚀 Linear Webhook一括作成スクリプト開始\n')
  console.log('=' .repeat(60))
  console.log(`Webhook URL: ${WEBHOOK_URL}`)
  console.log(`リソースタイプ: ${RESOURCE_TYPES.join(', ')}`)
  console.log('=' .repeat(60))

  // 環境変数チェック
  if (!LINEAR_API_KEY) {
    console.error('\n❌ エラー: LINEAR_API_KEY が設定されていません')
    console.error('   .env.local ファイルに LINEAR_API_KEY を設定してください')
    process.exit(1)
  }

  if (WEBHOOK_URL.includes('your-domain.com')) {
    console.error('\n❌ エラー: WEBHOOK_URL が設定されていません')
    console.error('   スクリプト内の WEBHOOK_URL を実際のURLに変更してください')
    process.exit(1)
  }

  if (!LINEAR_WEBHOOK_SECRET) {
    console.warn('\n⚠️  警告: LINEAR_WEBHOOK_SECRET が設定されていません')
    console.warn('   署名検証なしでWebhookが作成されます（本番環境では推奨されません）')
  }

  try {
    // 全チーム取得
    const teams = await getAllTeams()

    // 既存のWebhook取得
    const existingWebhooks = await getExistingWebhooks()

    // 各チームに対してWebhookを作成
    console.log('\n' + '='.repeat(60))
    console.log('Webhook作成開始')
    console.log('='.repeat(60))

    for (const team of teams) {
      // 既に同じURLのWebhookが存在するかチェック
      const existingWebhook = existingWebhooks.find(
        w => w.team?.id === team.id && w.url === WEBHOOK_URL
      )

      if (existingWebhook) {
        console.log(`\n⏭️  ${team.name} - 既にWebhookが存在します (${existingWebhook.url})`)

        // リソースタイプが異なる場合は更新
        const hasDifferentResources =
          existingWebhook.resourceTypes.length !== RESOURCE_TYPES.length ||
          !RESOURCE_TYPES.every(type => existingWebhook.resourceTypes.includes(type))

        if (hasDifferentResources) {
          console.log(`   ⚠️  リソースタイプが異なるため、再作成します`)
          await deleteWebhook(existingWebhook.id, team.name)
          await createWebhook(team.id, team.name)
        }
      } else {
        await createWebhook(team.id, team.name)
      }

      // レート制限を避けるため少し待機
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ すべてのWebhook作成が完了しました！')
    console.log('='.repeat(60))

    // 最終確認（管理者権限がない場合はスキップ）
    try {
      const finalWebhooks = await getExistingWebhooks()
      const ourWebhooks = finalWebhooks.filter(w => w.url === WEBHOOK_URL)

      console.log(`\n📊 最終結果:`)
      console.log(`   作成されたWebhook数: ${ourWebhooks.length} / ${teams.length}`)
      console.log(`   Webhook URL: ${WEBHOOK_URL}`)
    } catch (error) {
      console.log(`\n📊 最終結果:`)
      console.log(`   対象チーム数: ${teams.length}`)
      console.log(`   Webhook URL: ${WEBHOOK_URL}`)
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error)
    process.exit(1)
  }
}

// スクリプト実行
main()
