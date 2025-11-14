import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * 全Teamとそのメンバー情報を取得（管理者のみ）
 * GET /api/admin/teams/members
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    // 管理者チェック
    const { data: userData, error: userError } = await supabase
      .from('user_approvals')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (userError || userData?.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      )
    }

    // 全Teamを取得
    const { data: teams, error: teamsError } = await supabase
      .from('linear_teams')
      .select('*')
      .order('name', { ascending: true })

    if (teamsError) {
      return NextResponse.json(
        { error: 'Team一覧の取得に失敗しました' },
        { status: 500 }
      )
    }

    // 各TeamのProject数を取得
    const teamsWithCounts = await Promise.all(
      (teams || []).map(async (team) => {
        // メンバー数を取得
        const { data: memberships, error: membershipsError } = await supabase
          .from('user_team_memberships')
          .select(`
            user_id,
            user:user_approvals(
              user_id,
              email,
              role,
              approved
            )
          `)
          .eq('team_id', team.id)

        if (membershipsError) {
          console.error('Failed to fetch memberships for team:', team.id, membershipsError)
        }

        const members = (memberships || [])
          .map((m: any) => m.user)
          .filter((u: any) => u !== null)

        // プロジェクト数を取得
        const { count: projectCount } = await supabase
          .from('linear_projects')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id)

        return {
          ...team,
          members,
          memberCount: members.length,
          projectCount: projectCount || 0,
        }
      })
    )

    return NextResponse.json({
      teams: teamsWithCounts,
      count: teamsWithCounts.length,
    })
  } catch (error) {
    console.error('Teams with members fetch error:', error)
    return NextResponse.json(
      {
        error: 'Team情報の取得に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
