import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { LinearClient } from '@linear/sdk'

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // URLパラメータからカーソルを取得
    const { searchParams } = new URL(request.url)
    const afterCursor = searchParams.get('after') || undefined
    const isFirstPage = !afterCursor

    // Linear APIキーの確認
    const linearApiKey = process.env.LINEAR_API_KEY
    if (!linearApiKey) {
      return NextResponse.json({ error: 'Linear API key not configured' }, { status: 500 })
    }

    const linearClient = new LinearClient({ apiKey: linearApiKey })

    // すべてのLinear Teamを取得（初回のみ）
    let teams = []
    if (isFirstPage) {
      const { data: teamsData, error: teamsError } = await supabase
        .from('linear_teams')
        .select('id, linear_team_id, name, key')
        .order('name')

      if (teamsError) {
        throw teamsError
      }
      teams = teamsData || []
    }

    // Linear APIから1ページ分のIssue情報を取得
    const issuesConnection = await linearClient.issues({
      first: 50, // 1ページあたり50件取得（高速化のため）
      after: afterCursor,
      includeArchived: true,
    })

    const issues = issuesConnection.nodes
    const pageInfo = issuesConnection.pageInfo

    // Issue情報をマップに格納
    const linearIssuesMap: Map<string, any> = new Map()
    for (const issue of issues) {
      const state = await issue.state
      const project = await issue.project

      linearIssuesMap.set(issue.id, {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        state: state ? {
          name: state.name,
          type: state.type,
        } : null,
        project: project ? {
          id: project.id,
          name: project.name,
        } : null,
      })
    }

    // このページのIssue IDに対応するタスクを取得
    const issueIds = Array.from(linearIssuesMap.keys())
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, name, color, linear_issue_id, linear_team_id, created_at, linear_state_type, linear_project_id, description, assignee_email, assignee_name, linear_identifier, linear_url, priority, linear_updated_at')
      .in('linear_issue_id', issueIds)
      .not('linear_issue_id', 'is', null)
      .order('created_at', { ascending: false })

    // Teamごと、プロジェクトごとにグループ化
    const teamMap = new Map<string, any>()

    for (const task of tasks || []) {
      const linearIssue = linearIssuesMap.get(task.linear_issue_id)
      if (!linearIssue) continue

      const teamId = task.linear_team_id
      if (!teamMap.has(teamId)) {
        teamMap.set(teamId, new Map<string, any[]>())
      }

      const projectMap = teamMap.get(teamId)!
      const projectKey = linearIssue.project?.id || 'no-project'
      const projectName = linearIssue.project?.name || 'プロジェクトなし'

      if (!projectMap.has(projectKey)) {
        projectMap.set(projectKey, {
          project_id: projectKey === 'no-project' ? null : projectKey,
          project_name: projectName,
          issues: [],
        })
      }

      const enrichedTask = {
        ...task,
        linear_state: linearIssue.state || null,
        linear_identifier: linearIssue.identifier || null,
      }

      projectMap.get(projectKey)!.issues.push(enrichedTask)
    }

    // チームデータに変換
    const teamsData = []
    for (const [teamId, projectMap] of teamMap.entries()) {
      const team = teams.find(t => t.linear_team_id === teamId)
      const projects = Array.from(projectMap.values())

      teamsData.push({
        team_id: teamId,
        team_name: team?.name || teamId,
        team_key: team?.key || teamId,
        projects: projects,
      })
    }

    return NextResponse.json({
      teams: teamsData,
      pageInfo: {
        hasNextPage: pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor,
      },
      isFirstPage,
    })
  } catch (error) {
    console.error('Error in GET /api/admin/tasks/hierarchy:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
