import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getAllLinearTeams } from '@/lib/linear'

/**
 * LinearからTeam情報を取得してDBに同期（管理者のみ）
 * POST /api/admin/teams/sync
 */
export async function POST(request: NextRequest) {
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

    // Linear API Keyを取得
    const linearApiKey = process.env.LINEAR_API_KEY
    if (!linearApiKey) {
      return NextResponse.json(
        { error: 'LINEAR_API_KEYが設定されていません' },
        { status: 500 }
      )
    }

    // LinearからTeam情報を取得
    console.log('Fetching teams from Linear...')
    const linearTeams = await getAllLinearTeams(linearApiKey)
    console.log('Fetched teams:', linearTeams.length)

    // DBに保存（upsert: 存在すれば更新、なければ挿入）
    const syncResults = []
    for (const team of linearTeams) {
      const { data, error } = await supabase
        .from('linear_teams')
        .upsert(
          {
            linear_team_id: team.id,
            name: team.name,
            key: team.key,
            description: team.description,
            icon: team.icon,
            color: team.color,
            url: team.url,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'linear_team_id',
          }
        )
        .select()

      if (error) {
        console.error('Failed to sync team:', team.name, error)
        syncResults.push({ team: team.name, error: error.message })
      } else {
        syncResults.push({ team: team.name, success: true, data })
      }
    }

    return NextResponse.json({
      success: true,
      message: `${linearTeams.length}件のTeamを同期しました`,
      teams: linearTeams.length,
      syncResults,
    })
  } catch (error) {
    console.error('Teams sync error:', error)
    return NextResponse.json(
      {
        error: 'Team情報の同期に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
