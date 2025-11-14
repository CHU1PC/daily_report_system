import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * 全ユーザー一覧を取得（管理者のみ）
 * GET /api/admin/users
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

    // 全ユーザーを取得
    const { data: users, error: usersError } = await supabase
      .from('user_approvals')
      .select('*')
      .order('created_at', { ascending: false })

    if (usersError) {
      return NextResponse.json(
        { error: 'ユーザー一覧の取得に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      users: users || [],
      count: users?.length || 0,
    })
  } catch (error) {
    console.error('Users fetch error:', error)
    return NextResponse.json(
      {
        error: 'ユーザー一覧の取得に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
