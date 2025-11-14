import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * データベースに保存されているプロジェクト一覧を取得
 * GET /api/admin/projects
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

    // プロジェクト一覧を取得
    const { data: projects, error: projectsError } = await supabase
      .from('linear_projects')
      .select('*')
      .order('name', { ascending: true })

    if (projectsError) {
      return NextResponse.json(
        { error: 'プロジェクト一覧の取得に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      projects: projects || [],
      count: projects?.length || 0,
    })
  } catch (error) {
    console.error('Projects fetch error:', error)
    return NextResponse.json(
      {
        error: 'プロジェクト一覧の取得に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
