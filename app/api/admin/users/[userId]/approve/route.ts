import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * ユーザーを承認（管理者のみ）
 * POST /api/admin/users/[userId]/approve
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

    const { userId } = await params

    // リクエストボディからroleを取得（デフォルトは'user'）
    const body = await request.json().catch(() => ({}))
    const { role = 'user' } = body as { role?: 'user' | 'admin' }

    // roleのバリデーション
    if (role !== 'user' && role !== 'admin') {
      return NextResponse.json(
        { error: 'roleは"user"または"admin"である必要があります' },
        { status: 400 }
      )
    }

    // ユーザーのapprovedをtrueに、roleを指定された値に更新
    const { data: updateData, error: updateError } = await supabase
      .from('user_approvals')
      .update({
        approved: true,
        role: role
      })
      .eq('user_id', userId)
      .select()

    console.log('Update attempt:', { userId, updateData, updateError })

    if (updateError) {
      console.error('Update error details:', updateError)
      return NextResponse.json(
        {
          error: 'ユーザーの承認に失敗しました',
          details: updateError.message,
          code: updateError.code
        },
        { status: 500 }
      )
    }

    if (!updateData || updateData.length === 0) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりませんでした' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'ユーザーを承認しました',
      user: updateData[0]
    })
  } catch (error) {
    console.error('User approval error:', error)
    return NextResponse.json(
      {
        error: 'ユーザーの承認に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
