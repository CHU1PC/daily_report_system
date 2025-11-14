import { NextRequest, NextResponse } from 'next/server'
import { getAllLinearProjects } from '@/lib/linear'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * LinearプロジェクトをSupabaseデータベースに同期
 * POST /api/linear/projects/sync
 * 管理者のみ実行可能
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

    const linearApiKey = process.env.LINEAR_API_KEY

    if (!linearApiKey) {
      return NextResponse.json(
        { error: 'LINEAR_API_KEY が設定されていません' },
        { status: 500 }
      )
    }

    // Linearからプロジェクト一覧を取得
    const projects = await getAllLinearProjects(linearApiKey)

    const syncResults = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    }

    // 各プロジェクトをデータベースに同期
    for (const project of projects) {
      try {
        // 既存のプロジェクトを確認
        const { data: existingProject } = await supabase
          .from('linear_projects')
          .select('id')
          .eq('linear_project_id', project.id)
          .single()

        if (existingProject) {
          // 更新
          const { error: updateError } = await supabase
            .from('linear_projects')
            .update({
              name: project.name,
              description: project.description,
              icon: project.icon,
              color: project.color,
              state: project.state,
              updated_at: new Date().toISOString(),
            })
            .eq('linear_project_id', project.id)

          if (updateError) {
            syncResults.errors.push(
              `プロジェクト ${project.name} の更新に失敗: ${updateError.message}`
            )
          } else {
            syncResults.updated++
          }
        } else {
          // 新規作成
          const { error: insertError } = await supabase
            .from('linear_projects')
            .insert({
              linear_project_id: project.id,
              name: project.name,
              description: project.description,
              icon: project.icon,
              color: project.color,
              state: project.state,
            })

          if (insertError) {
            syncResults.errors.push(
              `プロジェクト ${project.name} の作成に失敗: ${insertError.message}`
            )
          } else {
            syncResults.created++
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : '不明なエラー'
        syncResults.errors.push(
          `プロジェクト ${project.name} の同期に失敗: ${errorMessage}`
        )
      }
    }

    return NextResponse.json({
      success: true,
      totalProjects: projects.length,
      ...syncResults,
    })
  } catch (error) {
    console.error('Linear projects sync error:', error)
    return NextResponse.json(
      {
        error: 'プロジェクトの同期に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
