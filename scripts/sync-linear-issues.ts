#!/usr/bin/env tsx
/**
 * Linear Issue同期スクリプト
 *
 * 最新200件のIssueを取得し、まだ同期されていないIssueをデータベースに追加します。
 * Rate limitに達した場合は処理を停止します。
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// 環境変数を読み込み
dotenv.config({ path: '.env.local' })

const LINEAR_API_KEY = process.env.LINEAR_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!LINEAR_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Required environment variables are missing')
  console.error('LINEAR_API_KEY:', !!LINEAR_API_KEY)
  console.error('NEXT_PUBLIC_SUPABASE_URL:', !!SUPABASE_URL)
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_ROLE_KEY)
  process.exit(1)
}

// Supabaseクライアントを作成
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface LinearIssueNode {
  id: string
  identifier: string
  title: string
  description?: string
  priority: number
  state: {
    name: string
    type: string
  }
  team?: {
    id: string
    name: string
    key: string
  }
  project?: {
    id: string
    name: string
  }
  assignee?: {
    id: string
    name: string
    email: string
  }
  url: string
  createdAt: string
  updatedAt: string
}

interface LinearApiResponse {
  data?: {
    issues?: {
      nodes: LinearIssueNode[]
      pageInfo: {
        hasNextPage: boolean
        endCursor: string
      }
    }
  }
  errors?: Array<{
    message: string
    extensions?: {
      code?: string
    }
  }>
}

/**
 * Linear APIからIssueを取得
 */
async function fetchLinearIssues(limit: number): Promise<LinearIssueNode[]> {
  const query = `
    query {
      issues(
        orderBy: updatedAt
        first: ${limit}
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          identifier
          title
          description
          priority
          state {
            name
            type
          }
          team {
            id
            name
            key
          }
          project {
            id
            name
          }
          assignee {
            id
            name
            email
          }
          url
          createdAt
          updatedAt
        }
      }
    }
  `

  console.log(`📡 Fetching latest ${limit} issues from Linear...`)

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: LINEAR_API_KEY,
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      throw new Error(`Linear API HTTP error: ${response.status} ${response.statusText}`)
    }

    const result: LinearApiResponse = await response.json()

    // Rate limitエラーをチェック
    if (result.errors) {
      const rateLimitError = result.errors.find(
        (err) => err.extensions?.code === 'RATE_LIMITED'
      )
      if (rateLimitError) {
        console.error('⚠️  Rate limit reached!')
        throw new Error('RATE_LIMIT_REACHED')
      }
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`)
    }

    if (!result.data?.issues) {
      throw new Error('No data returned from Linear API')
    }

    console.log(`✅ Fetched ${result.data.issues.nodes.length} issues`)
    return result.data.issues.nodes
  } catch (error) {
    if (error instanceof Error && error.message === 'RATE_LIMIT_REACHED') {
      throw error
    }
    console.error('❌ Error fetching Linear issues:', error)
    throw error
  }
}

/**
 * すでに同期済みのIssue IDを取得
 */
async function getExistingIssueIds(): Promise<Set<string>> {
  console.log('🔍 Checking existing synced issues...')

  const { data, error } = await supabase
    .from('tasks')
    .select('linear_issue_id')
    .not('linear_issue_id', 'is', null)

  if (error) {
    console.error('❌ Error fetching existing tasks:', error)
    throw error
  }

  const existingIds = new Set(
    data?.map((task) => task.linear_issue_id).filter(Boolean) || []
  )

  console.log(`✅ Found ${existingIds.size} already synced issues`)
  return existingIds
}

/**
 * TeamをUpsert
 */
async function upsertTeam(team: { id: string; name: string; key: string }) {
  const { error } = await supabase
    .from('linear_teams')
    .upsert(
      {
        linear_team_id: team.id,
        name: team.name,
        key: team.key,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'linear_team_id',
      }
    )

  if (error) {
    console.error('  ⚠️  Error upserting team:', error)
  }
}

/**
 * ProjectをUpsert
 */
async function upsertProject(project: { id: string; name: string }) {
  const { error } = await supabase
    .from('linear_projects')
    .upsert(
      {
        linear_project_id: project.id,
        name: project.name,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'linear_project_id',
      }
    )

  if (error) {
    console.error('  ⚠️  Error upserting project:', error)
  }
}

/**
 * Issueを同期
 */
async function syncIssue(issue: LinearIssueNode): Promise<boolean> {
  // Teamが存在する場合はupsert
  if (issue.team) {
    await upsertTeam(issue.team)
  }

  // Projectが存在する場合はupsert
  if (issue.project) {
    await upsertProject(issue.project)
  }

  // タスク名を生成（[TEAM-123] タイトル）
  const taskName = `[${issue.identifier}] ${issue.title}`

  // ランダムな色を生成
  const colors = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#eab308',
    '#84cc16',
    '#22c55e',
    '#10b981',
    '#14b8a6',
    '#06b6d4',
    '#0ea5e9',
    '#3b82f6',
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#d946ef',
    '#ec4899',
    '#f43f5e',
  ]
  const randomColor = colors[Math.floor(Math.random() * colors.length)]

  // assigneeを検索
  let assigneeUserId: string | null = null
  if (issue.assignee?.email) {
    const { data: assigneeUser } = await supabase
      .from('user_approvals')
      .select('user_id')
      .eq('email', issue.assignee.email)
      .single()

    if (assigneeUser) {
      assigneeUserId = assigneeUser.user_id
    }
  }

  // assigneeが見つからない場合は、最初の管理者に割り当て
  if (!assigneeUserId) {
    const { data: adminUser } = await supabase
      .from('user_approvals')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .single()

    if (adminUser) {
      assigneeUserId = adminUser.user_id
    }
  }

  // タスクを作成
  const { error: insertError } = await supabase.from('tasks').insert({
    user_id: assigneeUserId,
    name: taskName,
    color: randomColor,
    linear_issue_id: issue.id,
    linear_team_id: issue.team?.id || null,
    linear_state_type: issue.state?.type || null,
    linear_project_id: issue.project?.id || null,
    description: issue.description || null,
    assignee_email: issue.assignee?.email || null,
    assignee_name: issue.assignee?.name || null,
    linear_identifier: issue.identifier,
    linear_url: issue.url || null,
    priority: issue.priority || 0,
    linear_updated_at: issue.updatedAt || new Date().toISOString(),
    created_at: new Date().toISOString(),
  })

  if (insertError) {
    console.error(`  ❌ Error creating task for ${issue.identifier}:`, insertError)
    return false
  }

  console.log(`  ✅ Created task: ${issue.identifier} - ${issue.title}`)
  return true
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 Starting Linear Issue synchronization...\n')

  try {
    // 1. すでに同期済みのIssue IDを取得
    const existingIssueIds = await getExistingIssueIds()

    // 2. 最新200件のIssueを取得
    let issues: LinearIssueNode[]
    try {
      issues = await fetchLinearIssues(200)
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT_REACHED') {
        console.error('\n❌ Rate limit reached. Please try again later.')
        process.exit(1)
      }
      throw error
    }

    // 3. 新しいIssueのみをフィルタリング
    const newIssues = issues.filter((issue) => !existingIssueIds.has(issue.id))

    console.log(`\n📊 Summary:`)
    console.log(`  Total issues fetched: ${issues.length}`)
    console.log(`  Already synced: ${issues.length - newIssues.length}`)
    console.log(`  New issues to sync: ${newIssues.length}\n`)

    if (newIssues.length === 0) {
      console.log('✨ All issues are already synced!')
      return
    }

    // 4. 新しいIssueを同期
    console.log('📝 Syncing new issues...\n')
    let successCount = 0
    let failCount = 0

    for (const issue of newIssues) {
      const success = await syncIssue(issue)
      if (success) {
        successCount++
      } else {
        failCount++
      }
    }

    // 5. 結果を表示
    console.log(`\n✨ Synchronization completed!`)
    console.log(`  Successfully synced: ${successCount}`)
    if (failCount > 0) {
      console.log(`  Failed: ${failCount}`)
    }
  } catch (error) {
    console.error('\n❌ Synchronization failed:', error)
    process.exit(1)
  }
}

// スクリプト実行
main()
