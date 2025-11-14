import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) {
      console.error('[API] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized', details: authError.message }, { status: 401 })
    }
    if (!user) {
      console.error('[API] No user found')
      return NextResponse.json({ error: 'Unauthorized', details: 'No user found' }, { status: 401 })
    }

    // 管理者チェック
    const { data: userData, error: userError } = await supabase
      .from('user_approvals')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (userError || userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 全ユーザーを取得
    const { data: users, error: usersError } = await supabase
      .from('user_approvals')
      .select('user_id, email, name, role, approved')
      .eq('approved', true)
      .order('name')

    if (usersError) {
      throw usersError
    }

    // 各ユーザーのTeam情報を取得
    const usersWithTeams = await Promise.all(
      (users || []).map(async (user) => {
        // ユーザーが現在作業中のタスクを取得（end_timeがnullの時間エントリ）
        console.log(`[API] Querying time_entries for user_id: ${user.user_id}`)

        const { data: activeTimeEntries, error: timeEntriesError } = await supabase
          .from('time_entries')
          .select(`
            id,
            task_id,
            start_time,
            tasks (
              id,
              name,
              color,
              linear_identifier,
              linear_state_type,
              priority
            )
          `)
          .eq('user_id', user.user_id)
          .is('end_time', null)
          .order('start_time', { ascending: false })

        console.log(`[API] Active time entries for user ${user.email} (user_id: ${user.user_id}):`, activeTimeEntries)

        const currentTask = activeTimeEntries && activeTimeEntries.length > 0
          ? {
              task_id: activeTimeEntries[0].task_id,
              task_name: (activeTimeEntries[0].tasks as any)?.name || 'Unknown',
              task_color: (activeTimeEntries[0].tasks as any)?.color || '#6366f1',
              linear_identifier: (activeTimeEntries[0].tasks as any)?.linear_identifier || null,
              linear_state_type: (activeTimeEntries[0].tasks as any)?.linear_state_type || null,
              priority: (activeTimeEntries[0].tasks as any)?.priority || 0,
              start_time: activeTimeEntries[0].start_time,
            }
          : null

        console.log(`[API] Current task for user ${user.email}:`, currentTask)

        if (timeEntriesError) {
          console.error('Error fetching active time entries for user:', user.user_id, timeEntriesError)
        }

        // ユーザーが所属するTeamを取得
        const { data: memberships, error: membershipsError } = await supabase
          .from('user_team_memberships')
          .select(`
            linear_teams (
              id,
              linear_team_id,
              name,
              key,
              description,
              color
            )
          `)
          .eq('user_id', user.user_id)

        if (membershipsError) {
          console.error('Error fetching memberships for user:', user.user_id, membershipsError)
          return { ...user, teams: [], currentTask }
        }

        // 各TeamのProjectsとIssuesを取得
        const teams = await Promise.all(
          (memberships || [])
            .filter((m: any) => m.linear_teams)
            .map(async (membership: any) => {
              const team = membership.linear_teams

              // TeamのIssuesを取得（Tasksテーブルから）- ユーザーに割り当てられたもののみ
              const { data: issues, error: issuesError } = await supabase
                .from('tasks')
                .select('id, name, linear_issue_id, linear_team_id, linear_state_type, linear_identifier, description, assignee_email, assignee_name, priority, linear_project_id')
                .eq('linear_team_id', team.linear_team_id)
                .eq('assignee_email', user.email)  // ユーザーに割り当てられたIssueのみ
                .not('linear_issue_id', 'is', null)
                .order('created_at', { ascending: false })

              if (issuesError) {
                console.error('Error fetching issues for team:', team.id, issuesError)
              }

              console.log(`[API] Fetched ${issues?.length || 0} issues for user ${user.email} in team ${team.name} (${team.linear_team_id})`)

              // Issueデータを整形
              const formattedIssues = (issues || []).map((issue) => {
                // linear_identifierがある場合はそれを使用、なければnameから抽出
                const identifier = issue.linear_identifier || issue.name.match(/^\[([^\]]+)\]/)?.[1] || issue.linear_issue_id || 'Unknown'
                const title = issue.name.replace(/^\[[^\]]+\]\s*/, '') // "[TEAM-123] Title" -> "Title"

                return {
                  id: issue.id,
                  identifier,
                  title,
                  state: issue.linear_state_type || 'unknown', // 実際のステータスを使用
                  assignee_email: issue.assignee_email,
                  assignee_name: issue.assignee_name,
                  priority: issue.priority || 0,
                  linear_project_id: issue.linear_project_id,
                }
              })

              // Teamに属するProjectsを取得（linear_team_idで紐付け）
              console.log(`[API] Fetching projects for team ${team.name}, searching with linear_team_id: '${team.linear_team_id}'`)

              const { data: projects, error: projectsError } = await supabase
                .from('linear_projects')
                .select('id, name, linear_project_id, linear_team_id')
                .eq('linear_team_id', team.linear_team_id)
                .order('name')

              if (projectsError) {
                console.error('Error fetching projects for team:', team.id, projectsError)
              }

              console.log(`[API] Projects found for team ${team.name} (linear_team_id: ${team.linear_team_id}):`, projects?.length || 0)
              if (projects && projects.length > 0) {
                console.log('[API] Project details:', projects.map(p => ({
                  name: p.name,
                  linear_project_id: p.linear_project_id,
                  linear_team_id: p.linear_team_id
                })))
              }
              console.log('[API] Issue linear_project_ids (first 5):', formattedIssues.slice(0, 5).map(i => ({ identifier: i.identifier, linear_project_id: i.linear_project_id })))

              // Issueソート関数: Done以外を上に、その上で優先度順（高い方が上）
              const sortIssues = (issues: typeof formattedIssues) => {
                return issues.sort((a, b) => {
                  // まずDone（completed/canceled）かどうかで分ける
                  const aIsDone = a.state === 'completed' || a.state === 'canceled'
                  const bIsDone = b.state === 'completed' || b.state === 'canceled'

                  if (aIsDone !== bIsDone) {
                    return aIsDone ? 1 : -1 // Done以外を上に
                  }

                  // 同じグループ内では優先度順（1が最高、4が最低、0は未設定）
                  const aPriority = a.priority || 999 // 優先度未設定は最下位
                  const bPriority = b.priority || 999

                  return aPriority - bPriority // 数字が小さい方（高優先度）が上
                })
              }

              // ProjectごとにIssueを振り分け、ソート
              const projectsWithIssues = (projects || []).map((project) => {
                const projectIssues = formattedIssues.filter(
                  (issue) => {
                    const matches = issue.linear_project_id === project.linear_project_id
                    if (!matches && formattedIssues.indexOf(issue) < 3) {
                      console.log(`[API] Issue ${issue.identifier}: '${issue.linear_project_id}' !== '${project.linear_project_id}' (types: ${typeof issue.linear_project_id} vs ${typeof project.linear_project_id})`)
                    }
                    return matches
                  }
                )
                console.log(`[API] Project "${project.name}" (${project.linear_project_id}): ${projectIssues.length} issues`)
                return {
                  id: project.id,
                  linear_project_id: project.linear_project_id,
                  name: project.name,
                  issues: sortIssues(projectIssues),
                }
              })

              // Projectに属さないIssueがあれば「その他」として追加
              const issuesWithoutProject = formattedIssues.filter(
                (issue) => !issue.linear_project_id ||
                !(projects || []).some(p => p.linear_project_id === issue.linear_project_id)
              )

              console.log(`[API] Issues without project for team ${team.name}: ${issuesWithoutProject.length}`)
              if (issuesWithoutProject.length > 0) {
                console.log(`[API] First 3 unmatched issues:`, issuesWithoutProject.slice(0, 3).map(i => ({ identifier: i.identifier, linear_project_id: i.linear_project_id })))
                projectsWithIssues.push({
                  id: 'no-project',
                  linear_project_id: 'no-project',
                  name: 'プロジェクト未割り当て',
                  issues: sortIssues(issuesWithoutProject),
                })
              }

              return {
                id: team.id,
                linear_team_id: team.linear_team_id,
                name: team.name,
                key: team.key,
                color: team.color,
                projects: projectsWithIssues,
              }
            })
        )

        return {
          user_id: user.user_id,
          email: user.email,
          name: user.name,
          role: user.role,
          teams,
          currentTask,
        }
      })
    )

    return NextResponse.json({ users: usersWithTeams })
  } catch (error) {
    console.error('Error in GET /api/admin/users/teams:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
