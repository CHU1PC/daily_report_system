/**
 * Linear グローバルWebhook作成スクリプト
 *
 * 1つのWebhookですべてのチームのイベントを受け取ります
 *
 * 使い方:
 * 1. .env.local に LINEAR_API_KEY を設定
 * 2. pnpm run setup-global-webhook
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// .env.local を読み込み
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const LINEAR_API_KEY = process.env.LINEAR_API_KEY
const LINEAR_WEBHOOK_SECRET = process.env.LINEAR_WEBHOOK_SECRET

const WEBHOOK_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/linear`
  : 'https://your-domain.com/api/webhooks/linear'

// 購読するリソースタイプ
const RESOURCE_TYPES = [
  'Issue',
  'Project',
  'IssueLabel',
]

interface Webhook {
  id: string
  url: string
  enabled: boolean
  resourceTypes: string[]
  allPublicTeams: boolean
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

async function getExistingWebhooks(): Promise<Webhook[]> {
  console.log('🔍 既存のWebhookを確認中...')

  const query = `
    query {
      webhooks {
        nodes {
          id
          url
          enabled
          resourceTypes
          allPublicTeams
        }
      }
    }
  `

  try {
    const data = await fetchLinearGraphQL(query)
    const webhooks: Webhook[] = data.webhooks.nodes

    console.log(`✅ ${webhooks.length}個の既存Webhookを発見`)

    webhooks.forEach(webhook => {
      console.log(`   - ${webhook.url}`)
      console.log(`     リソース: ${webhook.resourceTypes.join(', ')}`)
      console.log(`     全チーム: ${webhook.allPublicTeams}`)
    })

    return webhooks
  } catch (error: any) {
    if (error.message.includes('admin required')) {
      console.log('⚠️  既存Webhookの取得には管理者権限が必要です（スキップ）')
      return []
    }
    throw error
  }
}

async function createGlobalWebhook(): Promise<void> {
  console.log('\n🔧 グローバルWebhookを作成中...')
  console.log('   対象: すべての公開チーム')

  const mutation = `
    mutation WebhookCreate($input: WebhookCreateInput!) {
      webhookCreate(input: $input) {
        success
        webhook {
          id
          url
          enabled
          resourceTypes
          allPublicTeams
        }
      }
    }
  `

  const variables = {
    input: {
      url: WEBHOOK_URL,
      resourceTypes: RESOURCE_TYPES,
      secret: LINEAR_WEBHOOK_SECRET || undefined,
      enabled: true,
      allPublicTeams: true, // 全チームのイベントを受け取る
    }
  }

  try {
    const data = await fetchLinearGraphQL(mutation, variables)

    if (data.webhookCreate.success) {
      console.log('✅ グローバルWebhook作成成功！')
      console.log(`   URL: ${data.webhookCreate.webhook.url}`)
      console.log(`   リソースタイプ: ${data.webhookCreate.webhook.resourceTypes.join(', ')}`)
      console.log(`   全チーム対象: ${data.webhookCreate.webhook.allPublicTeams ? 'はい' : 'いいえ'}`)
    } else {
      console.error('❌ Webhook作成失敗')
    }
  } catch (error: any) {
    if (error.message.includes('admin required')) {
      console.error('\n❌ エラー: ワークスペース管理者権限が必要です')
      console.error('   Webhookの作成には管理者権限のあるAPI Keyが必要です')
      console.error('\n   対処法:')
      console.error('   1. ワークスペース管理者に依頼してこのスクリプトを実行してもらう')
      console.error('   2. または、Linear UIから手動でWebhookを作成:')
      console.error('      https://linear.app/settings/api')
      throw error
    }
    throw error
  }
}

async function main() {
  console.log('🚀 Linear グローバルWebhook作成スクリプト\n')
  console.log('=' .repeat(60))
  console.log(`Webhook URL: ${WEBHOOK_URL}`)
  console.log(`リソースタイプ: ${RESOURCE_TYPES.join(', ')}`)
  console.log(`対象: 全公開チーム（35チーム）`)
  console.log('=' .repeat(60))

  // 環境変数チェック
  if (!LINEAR_API_KEY) {
    console.error('\n❌ エラー: LINEAR_API_KEY が設定されていません')
    console.error('   .env.local ファイルに LINEAR_API_KEY を設定してください')
    console.error('   https://linear.app/settings/api から取得できます')
    process.exit(1)
  }

  if (WEBHOOK_URL.includes('your-domain.com')) {
    console.error('\n❌ エラー: WEBHOOK_URL が設定されていません')
    console.error('   .env.local に NEXT_PUBLIC_SITE_URL を設定してください')
    console.error('   例: NEXT_PUBLIC_SITE_URL=https://your-domain.com')
    process.exit(1)
  }

  if (!LINEAR_WEBHOOK_SECRET) {
    console.warn('\n⚠️  警告: LINEAR_WEBHOOK_SECRET が設定されていません')
    console.warn('   署名検証なしでWebhookが作成されます（本番環境では推奨されません）')
    console.warn('   .env.local に LINEAR_WEBHOOK_SECRET を追加することを推奨します\n')
  }

  try {
    // 既存のWebhook確認（管理者権限がない場合はスキップ）
    const existingWebhooks = await getExistingWebhooks()

    // 既に同じURLのWebhookが存在するかチェック
    const existingWebhook = existingWebhooks.find(w => w.url === WEBHOOK_URL && w.allPublicTeams)

    if (existingWebhook) {
      console.log(`\n✅ 既にグローバルWebhookが存在します: ${existingWebhook.url}`)
      console.log(`   リソースタイプ: ${existingWebhook.resourceTypes.join(', ')}`)
      console.log('   スキップします')
    } else {
      await createGlobalWebhook()
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ 完了しました！')
    console.log('='.repeat(60))

    console.log('\n📝 次のステップ:')
    console.log('1. Linearで新しいIssueを作成してテスト')
    console.log('2. サーバーログで以下を確認:')
    console.log('   [Linear Webhook] Received event: { action: "create", type: "Issue" }')
    console.log('   [Linear Webhook] Task created successfully: APE-123')
    console.log('\n3. タスク管理画面をリフレッシュして、新しいタスクが表示されることを確認')

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error)
    process.exit(1)
  }
}

// スクリプト実行
main()
