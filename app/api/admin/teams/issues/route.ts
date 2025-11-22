import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    // 管理者権限チェック
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminData } = await supabase
      .from('user_approvals')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!adminData || adminData.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // 全てのLinear Teamsを取得
    const { data: teams, error: teamsError } = await supabase
      .from('linear_teams')
      .select('*')
      .order('name')

    if (teamsError) {
      console.error('Error fetching teams:', teamsError)
      throw new Error('Failed to fetch teams')
    }

    // 各Teamについて、Linear Issueとアサインされているユーザーを取得
    const teamsWithIssues = await Promise.all(
      (teams || []).map(async (team) => {
        // そのTeamのLinear Issueを全て取得（全ステータス）
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, name, linear_issue_id, linear_identifier, linear_state_type, priority, assignee_email, assignee_name, linear_url, description')
          .eq('linear_team_id', team.linear_team_id)
          .not('linear_issue_id', 'is', null)
          .order('linear_state_type')

        if (!tasks || tasks.length === 0) {
          return {
            ...team,
            members: [],
            issues: []
          }
        }

        // アサインされているユーザーのメールアドレスを収集
        const assigneeEmails = new Set(
          tasks
            .map(task => task.assignee_email)
            .filter((email): email is string => email != null)
        )

        // ユーザー情報を取得（承認済みのみ）
        const { data: users } = await supabase
          .from('user_approvals')
          .select('user_id, email, name, role')
          .in('email', Array.from(assigneeEmails))
          .eq('approved', true)

        const userMap = new Map(
          (users || []).map(user => [user.email, user])
        )

        // ユーザーごとにIssueをグループ化し、優先度スコアを計算
        const memberIssuesMap = new Map<string, {
          user: any
          issues: any[]
          priorityScore: number
        }>()

        tasks.forEach(task => {
          if (!task.assignee_email) return

          const user = userMap.get(task.assignee_email)
          if (!user) return

          if (!memberIssuesMap.has(task.assignee_email)) {
            memberIssuesMap.set(task.assignee_email, {
              user,
              issues: [],
              priorityScore: 0
            })
          }

          const memberData = memberIssuesMap.get(task.assignee_email)!
          memberData.issues.push(task)

          // 優先度スコア計算: 1=Urgent(緊急)→4点, 2=High(高)→3点, 3=Medium(中)→2点, 4=Low(低)→1点, 0=None→0点
          // Linearの優先度は逆順なので注意
          const priorityPoints: Record<number, number> = {
            0: 0, // None
            1: 4, // Urgent
            2: 3, // High
            3: 2, // Medium
            4: 1  // Low
          }
          memberData.priorityScore += priorityPoints[task.priority || 0] || 0
        })

        // メンバーを優先度スコアでソート（降順）
        const members = Array.from(memberIssuesMap.values())
          .sort((a, b) => b.priorityScore - a.priorityScore)
          .map(({ user, issues, priorityScore }) => ({
            ...user,
            issues: issues.sort((a, b) => {
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
            }),
            priorityScore
          }))

        return {
          ...team,
          members,
          issues: tasks
        }
      })
    )

    return NextResponse.json({
      teams: teamsWithIssues
    }, { status: 200 })

  } catch (error) {
    console.error('Error in teams issues API:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch team issues',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
