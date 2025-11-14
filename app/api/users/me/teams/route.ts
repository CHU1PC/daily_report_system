import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * ログインユーザーの所属Team一覧を取得
 * GET /api/users/me/teams
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

    // ユーザーの所属Teamを取得
    const { data: memberships, error: membershipsError } = await supabase
      .from('user_team_memberships')
      .select(`
        team_id,
        team:linear_teams(
          id,
          linear_team_id,
          name,
          key,
          description,
          icon,
          color,
          url
        )
      `)
      .eq('user_id', user.id)

    if (membershipsError) {
      console.error('Failed to fetch team memberships:', membershipsError)
      return NextResponse.json(
        { error: 'Team情報の取得に失敗しました' },
        { status: 500 }
      )
    }

    const teams = (memberships || [])
      .map((m: any) => m.team)
      .filter((t: any) => t !== null)

    return NextResponse.json({
      teams,
      count: teams.length,
    })
  } catch (error) {
    console.error('User teams fetch error:', error)
    return NextResponse.json(
      {
        error: 'Team情報の取得に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
