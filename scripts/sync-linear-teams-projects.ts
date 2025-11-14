/**
 * 既存のタスクからTeamとProjectの情報を取得し、
 * linear_teamsとlinear_projectsテーブルに登録するスクリプト
 */

import { createClient } from '@supabase/supabase-js'

const LINEAR_API_KEY = process.env.LINEAR_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!LINEAR_API_KEY) {
  console.error('LINEAR_API_KEY is not set')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface LinearIssue {
  id: string
  identifier: string
  title: string
  team?: {
    id: string
    name: string
    key: string
  }
  project?: {
    id: string
    name: string
  }
}

async function fetchLinearIssue(issueId: string): Promise<LinearIssue | null> {
  const query = `
    query Issue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        team {
          id
          name
          key
        }
        project {
          id
          name
        }
      }
    }
  `

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: LINEAR_API_KEY!,
    },
    body: JSON.stringify({
      query,
      variables: { id: issueId },
    }),
  })

  const result = await response.json()

  if (result.errors) {
    console.error('GraphQL errors:', result.errors)
    return null
  }

  return result.data?.issue || null
}

async function syncTeamsAndProjects() {
  console.log('Starting sync of Linear teams and projects...')

  // すべてのタスクを取得
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, linear_issue_id, linear_team_id, linear_project_id, linear_identifier')
    .not('linear_issue_id', 'is', null)

  if (tasksError) {
    console.error('Error fetching tasks:', tasksError)
    return
  }

  console.log(`Found ${tasks.length} tasks with Linear issues`)

  const teamsToUpsert = new Map<string, { id: string; name: string; key: string }>()
  const projectsToUpsert = new Map<string, { id: string; name: string }>()

  // 各タスクのLinear Issueから情報を取得
  for (const task of tasks) {
    if (!task.linear_issue_id) continue

    console.log(`Fetching issue ${task.linear_identifier || task.linear_issue_id}...`)

    const issue = await fetchLinearIssue(task.linear_issue_id)
    if (!issue) {
      console.log(`  Could not fetch issue ${task.linear_identifier}`)
      continue
    }

    // Team情報を収集
    if (issue.team) {
      teamsToUpsert.set(issue.team.id, {
        id: issue.team.id,
        name: issue.team.name,
        key: issue.team.key,
      })
      console.log(`  Team: ${issue.team.name} (${issue.team.key})`)
    }

    // Project情報を収集
    if (issue.project) {
      projectsToUpsert.set(issue.project.id, {
        id: issue.project.id,
        name: issue.project.name,
      })
      console.log(`  Project: ${issue.project.name}`)
    }

    // Rate limiting対策: 少し待機
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  // Teamsをデータベースに登録
  console.log(`\nUpserting ${teamsToUpsert.size} teams...`)
  for (const team of teamsToUpsert.values()) {
    const { error } = await supabase
      .from('linear_teams')
      .upsert({
        linear_team_id: team.id,
        name: team.name,
        key: team.key,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'linear_team_id'
      })

    if (error) {
      console.error(`Error upserting team ${team.name}:`, error)
    } else {
      console.log(`  ✓ ${team.name}`)
    }
  }

  // Projectsをデータベースに登録
  console.log(`\nUpserting ${projectsToUpsert.size} projects...`)
  for (const project of projectsToUpsert.values()) {
    const { error } = await supabase
      .from('linear_projects')
      .upsert({
        linear_project_id: project.id,
        name: project.name,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'linear_project_id'
      })

    if (error) {
      console.error(`Error upserting project ${project.name}:`, error)
    } else {
      console.log(`  ✓ ${project.name}`)
    }
  }

  console.log('\nSync completed!')
}

syncTeamsAndProjects().catch(console.error)
