import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    // Supabase Authからユーザー削除（Service Roleキーを使用）
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        })

        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (authDeleteError) {
          console.error('Error deleting user from Supabase Auth:', authDeleteError)
          // Auth削除に失敗してもuser_approvalsは削除済みなので、警告のみ
          console.warn('User removed from approvals but Auth deletion failed. User can no longer access the app.')
        } else {
          console.log('User deleted from Supabase Auth:', userId)
        }
      } catch (authError) {
        console.error('Exception during Auth deletion:', authError)
        // Auth削除に失敗してもuser_approvalsは削除済みなので、警告のみ
      }
    } else {
      console.warn('SUPABASE_SERVICE_ROLE_KEY not configured. User removed from approvals but still exists in Auth.')
    }

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
