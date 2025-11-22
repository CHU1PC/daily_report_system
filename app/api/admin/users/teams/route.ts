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
                .select('id, name, linear_issue_id, linear_team_id, linear_state_type, linear_identifier, description, assignee_email, assignee_name, priority, linear_url')
                .eq('linear_team_id', team.linear_team_id)
                .eq('assignee_email', user.email)  // ユーザーに割り当てられたIssueのみ
                .not('linear_issue_id', 'is', null)

              if (issuesError) {
                console.error('Error fetching issues for team:', team.id, issuesError)
              }

              console.log(`[API] Fetched ${issues?.length || 0} issues for user ${user.email} in team ${team.name} (${team.linear_team_id})`)

              // Issueをソート（ステータス優先、次に優先度）
              const sortedIssues = (issues || []).sort((a, b) => {
                // ステータスでソート: unstarted, started, completed, canceled
                const statusOrder: Record<string, number> = {
                  'unstarted': 1,
                  'started': 2,
                  'completed': 3,
                  'canceled': 4
                }
                const orderA = statusOrder[a.linear_state_type] || 99
                const orderB = statusOrder[b.linear_state_type] || 99

                if (orderA !== orderB) return orderA - orderB

                // 同じステータスなら優先度でソート
                const priorityA = a.priority || 0
                const priorityB = b.priority || 0
                return priorityA - priorityB
              })

              return {
                id: team.id,
                linear_team_id: team.linear_team_id,
                name: team.name,
                key: team.key,
                color: team.color,
                url: team.url,
                description: team.description,
                issues: sortedIssues,
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
