import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 管理者チェック
    const { data: userData, error: userError } = await supabase
      .from('user_approvals')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (userError || userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    // リクエストボディからタスク名を取得
    const body = await request.json()
    const { taskName } = body

    if (!taskName || typeof taskName !== 'string') {
      return NextResponse.json({ error: 'Task name is required' }, { status: 400 })
    }

    // 同名のグローバルタスクが既に存在するかチェック
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id, name')
      .eq('name', taskName)
      .is('linear_issue_id', null)
      .eq('assignee_email', 'TaskForAll@task.com')
      .maybeSingle()

    if (existingTask) {
      return NextResponse.json({
        message: `「${taskName}」タスクは既に存在します`,
        task: existingTask
      }, { status: 200 })
    }

    // グローバルタスクを作成（Linear連携なし、誰でも使える）
    const { data: newTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        name: taskName,
        color: '#10b981', // 緑色
        user_id: user.id,
        // Linear関連のフィールドはnullのまま
        linear_issue_id: null,
        linear_team_id: null,
        linear_project_id: null,
        linear_state_type: null,
        assignee_email: 'TaskForAll@task.com', // 全員が見えるグローバルタスク
        assignee_name: 'All Users',
        linear_identifier: null,
        linear_url: null,
        priority: null,
        description: `このタスクは誰でも使用できる共通タスクです（管理者が作成）`,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating global task:', insertError)
      return NextResponse.json({
        error: 'Failed to create global task',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      message: `「${taskName}」タスクを作成しました`,
      task: newTask
    }, { status: 201 })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
