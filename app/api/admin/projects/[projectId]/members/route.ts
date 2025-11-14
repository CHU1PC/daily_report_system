import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * プロジェクトのメンバーを更新（管理者のみ）
 * POST /api/admin/projects/[projectId]/members
 * Body: { userIds: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
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

    const { projectId } = await params
    const body = await request.json()
    const { userIds } = body as { userIds: string[] }

    console.log('Updating project members:', { projectId, userIds })

    if (!Array.isArray(userIds)) {
      return NextResponse.json(
        { error: 'userIds は配列である必要があります' },
        { status: 400 }
      )
    }

    // 既存のメンバーシップを全て削除
    const { error: deleteError } = await supabase
      .from('user_project_memberships')
      .delete()
      .eq('project_id', projectId)

    console.log('Delete result:', { deleteError })

    if (deleteError) {
      return NextResponse.json(
        { error: '既存のメンバー情報の削除に失敗しました' },
        { status: 500 }
      )
    }

    // 新しいメンバーシップを作成
    if (userIds.length > 0) {
      const memberships = userIds.map((userId) => ({
        user_id: userId,
        project_id: projectId,
      }))

      const { error: insertError } = await supabase
        .from('user_project_memberships')
        .insert(memberships)

      console.log('Insert result:', { insertError, membershipCount: memberships.length })

      if (insertError) {
        console.error('Insert error details:', insertError)
        return NextResponse.json(
          { error: 'メンバー情報の作成に失敗しました', details: insertError.message },
          { status: 500 }
        )
      }
    }

    console.log('Project members updated successfully')
    return NextResponse.json({
      success: true,
      message: 'プロジェクトメンバーを更新しました',
      memberCount: userIds.length,
    })
  } catch (error) {
    console.error('Project members update error:', error)
    return NextResponse.json(
      {
        error: 'プロジェクトメンバーの更新に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
