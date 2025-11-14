import { NextRequest, NextResponse } from 'next/server'
import { getAllLinearProjects } from '@/lib/linear'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * すべてのLinear Projectを取得するAPI
 * GET /api/linear/projects
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const linearApiKey = process.env.LINEAR_API_KEY

    if (!linearApiKey) {
      return NextResponse.json(
        { error: 'LINEAR_API_KEY が設定されていません' },
        { status: 500 }
      )
    }

    const projects = await getAllLinearProjects(linearApiKey)

    return NextResponse.json({
      projects,
      count: projects.length,
    })
  } catch (error) {
    console.error('Linear projects fetch error:', error)
    return NextResponse.json(
      {
        error: 'プロジェクトの取得に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
