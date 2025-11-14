import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { userId } = await params

    // 管理者権限チェック
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminData } = await supabase
      .from('user_approvals')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!adminData || adminData.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // ユーザーの存在確認
    const { data: userToDelete } = await supabase
      .from('user_approvals')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!userToDelete) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 自分自身は削除できない
    if (userId === user.id) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
    }

    // user_approvalsテーブルからユーザー削除
    const { error: deleteError } = await supabase
      .from('user_approvals')
      .delete()
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Error deleting user from user_approvals:', deleteError)
      throw new Error('Failed to delete user from approvals table')
    }

    // Supabase Authからユーザー削除（管理者のみ可能）
    // Note: これはサービスロールキーが必要なため、現在のクライアントでは実行できません
    // 必要に応じて、Supabase管理画面から手動で削除するか、サービスロールAPIを使用してください

    console.log('User deleted successfully:', userId)

    return NextResponse.json({
      message: 'User deleted successfully',
      userId
    }, { status: 200 })

  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete user',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
