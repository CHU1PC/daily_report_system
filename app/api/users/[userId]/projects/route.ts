import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * ユーザーの所属プロジェクト一覧を取得
 * GET /api/users/[userId]/projects
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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

    const { userId } = await params

    // 管理者または本人のみアクセス可能
    const { data: userData } = await supabase
      .from('user_approvals')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (userData?.role !== 'admin' && user.id !== userId) {
      return NextResponse.json(
        { error: 'アクセス権限がありません' },
        { status: 403 }
      )
    }

    // ユーザーの所属プロジェクトを取得
    const { data: memberships, error: membershipsError } = await supabase
      .from('user_project_memberships')
      .select(`
        id,
        created_at,
        project:linear_projects(
          id,
          linear_project_id,
          name,
          description,
          icon,
          color,
          state
        )
      `)
      .eq('user_id', userId)

    if (membershipsError) {
      return NextResponse.json(
        { error: 'プロジェクト情報の取得に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      projects: memberships?.map((m: any) => m.project) || [],
      count: memberships?.length || 0,
    })
  } catch (error) {
    console.error('User projects fetch error:', error)
    return NextResponse.json(
      {
        error: 'プロジェクト情報の取得に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}

/**
 * ユーザーのプロジェクト所属を更新
 * POST /api/users/[userId]/projects
 * Body: { projectIds: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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
    const { data: userData } = await supabase
      .from('user_approvals')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (userData?.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      )
    }

    const { userId } = await params
    const body = await request.json()
    const { projectIds } = body as { projectIds: string[] }

    if (!Array.isArray(projectIds)) {
      return NextResponse.json(
        { error: 'projectIds は配列である必要があります' },
        { status: 400 }
      )
    }

    // 既存の所属関係を全て削除
    const { error: deleteError } = await supabase
      .from('user_project_memberships')
      .delete()
      .eq('user_id', userId)

    if (deleteError) {
      return NextResponse.json(
        { error: '既存の所属情報の削除に失敗しました' },
        { status: 500 }
      )
    }

    // 新しい所属関係を作成
    if (projectIds.length > 0) {
      const memberships = projectIds.map((projectId) => ({
        user_id: userId,
        project_id: projectId,
      }))

      const { error: insertError } = await supabase
        .from('user_project_memberships')
        .insert(memberships)

      if (insertError) {
        return NextResponse.json(
          { error: '所属情報の作成に失敗しました' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: 'プロジェクト所属を更新しました',
      projectCount: projectIds.length,
    })
  } catch (error) {
    console.error('User projects update error:', error)
    return NextResponse.json(
      {
        error: 'プロジェクト所属の更新に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
