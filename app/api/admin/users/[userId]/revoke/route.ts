import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * ユーザーの承認を取り消す（管理者のみ）
 * POST /api/admin/users/[userId]/revoke
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

    // 自分自身の承認を取り消すことはできない
    if (user.id === userId) {
      return NextResponse.json(
        { error: '自分自身の承認を取り消すことはできません' },
        { status: 400 }
      )
    }

    // ユーザーのapprovedをfalseに更新
    const { data: updateData, error: updateError } = await supabase
      .from('user_approvals')
      .update({ approved: false })
      .eq('user_id', userId)
      .select()

    console.log('Revoke attempt:', { userId, updateData, updateError })

    if (updateError) {
      console.error('Revoke error details:', updateError)
      return NextResponse.json(
        {
          error: '承認の取り消しに失敗しました',
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
      message: 'ユーザーの承認を取り消しました',
      user: updateData[0]
    })
  } catch (error) {
    console.error('User revoke error:', error)
    return NextResponse.json(
      {
        error: '承認の取り消しに失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
