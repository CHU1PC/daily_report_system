import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// LinearのWebhookイベントの型定義
interface LinearWebhookPayload {
  action: string
  type: string
  data: {
    id: string
    identifier: string
    title: string
    description?: string
    priority?: number
    updatedAt?: string
    state?: {
      name: string
      type: string
    }
    team?: {
      id: string
      name: string
      key: string
    }
    project?: {
      id: string
      name: string
    }
    assignee?: {
      id: string
      name: string
      email: string
    }
  }
  url: string
  createdAt: string
}

// Linearのwebhook署名を検証
function verifyLinearSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch (error) {
    console.error('Error verifying signature:', error)
    return false
  }
}

export async function POST(request: NextRequest) {
  console.log('[Linear Webhook] POST request received!')
  console.log('[Linear Webhook] Headers:', Object.fromEntries(request.headers))

  try {
    const webhookSecretsEnv = process.env.LINEAR_WEBHOOK_SECRET
    console.log('[Linear Webhook] Webhook secret configured:', !!webhookSecretsEnv)

    // 複数の秘密鍵をサポート（カンマ区切り）
    const webhookSecrets = webhookSecretsEnv ? webhookSecretsEnv.split(',').map(s => s.trim()) : []

    // 署名検証（本番環境では必須）
    if (webhookSecrets.length > 0) {
      const signature = request.headers.get('linear-signature')
      console.log('[Linear Webhook] Signature:', signature)

      if (!signature) {
        console.error('[Linear Webhook] Missing signature')
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
      }

      const rawBody = await request.text()

      // いずれかの秘密鍵で署名検証が成功すればOK
      let isValidSignature = false
      for (const secret of webhookSecrets) {
        if (verifyLinearSignature(rawBody, signature, secret)) {
          isValidSignature = true
          console.log('[Linear Webhook] Signature verified successfully')
          break
        }
      }

      if (!isValidSignature) {
        console.error('[Linear Webhook] Invalid signature - tried', webhookSecrets.length, 'secrets')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }

      // 署名検証が成功したらJSONをパース
      const payload: LinearWebhookPayload = JSON.parse(rawBody)
      console.log('[Linear Webhook] Received event:', { action: payload.action, type: payload.type })

      return await processWebhookEvent(payload)
    } else {
      // Webhook秘密鍵が設定されていない場合（開発環境）
      console.warn('[Linear Webhook] LINEAR_WEBHOOK_SECRET not set, skipping signature verification')
      const payload: LinearWebhookPayload = await request.json()
      console.log('[Linear Webhook] Received event:', { action: payload.action, type: payload.type })

      return await processWebhookEvent(payload)
    }
  } catch (error) {
    console.error('Error in Linear webhook handler:', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

async function processWebhookEvent(payload: LinearWebhookPayload) {
  // WebhookハンドラーではサービスロールキーでRLSをバイパス
  const supabase = createServiceSupabaseClient()

  // イベントタイプに応じて処理を分岐
  if (payload.type === 'Issue') {
    const { data, action, url } = payload

    // actionに応じて処理を分岐
    if (action === 'create') {
      return await handleIssueCreate(supabase, data, url)
    } else if (action === 'update') {
      return await handleIssueUpdate(supabase, data, url)
    } else if (action === 'remove') {
      return await handleIssueRemove(supabase, data)
    } else if (action === 'restore') {
      // restoreはcreateと同じ処理（タスクを再作成）
      return await handleIssueCreate(supabase, data, url)
    }
  } else if (payload.type === 'Project') {
    return await handleProjectEvent(supabase, payload)
  } else if (payload.type === 'Team') {
    return await handleTeamEvent(supabase, payload)
  }

  return NextResponse.json({ message: 'Event type not supported or action not handled' }, { status: 200 })
}

// Project イベント処理
async function handleProjectEvent(supabase: any, payload: LinearWebhookPayload) {
  const { action, data } = payload

  if (action === 'create' || action === 'update') {
    const { error } = await supabase
      .from('linear_projects')
      .upsert({
        linear_project_id: data.id,
        linear_team_id: data.team?.id,
        name: data.title || data.identifier,
        description: data.description,
        state: data.state?.name,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'linear_project_id'
      })

    if (error) {
      console.error('[Linear Webhook] Error upserting project:', error)
      return NextResponse.json({ error: 'Failed to upsert project' }, { status: 500 })
    }

    console.log(`[Linear Webhook] Project ${action}d:`, data.identifier)
    return NextResponse.json({ message: `Project ${action}d successfully` }, { status: 200 })
  } else if (action === 'remove') {
    const { error } = await supabase
      .from('linear_projects')
      .delete()
      .eq('linear_project_id', data.id)

    if (error) {
      console.error('[Linear Webhook] Error deleting project:', error)
      return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
    }

    console.log('[Linear Webhook] Project removed:', data.id)
    return NextResponse.json({ message: 'Project removed successfully' }, { status: 200 })
  }

  return NextResponse.json({ message: 'Project action not handled' }, { status: 200 })
}

// Team イベント処理
async function handleTeamEvent(supabase: any, payload: LinearWebhookPayload) {
  const { action, data } = payload

  if (action === 'create' || action === 'update') {
    const teamKey = data.identifier?.split('-')[0] || 'UNKNOWN'

    const { error } = await supabase
      .from('linear_teams')
      .upsert({
        linear_team_id: data.id,
        name: data.title || data.identifier,
        key: teamKey,
        description: data.description,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'linear_team_id'
      })

    if (error) {
      console.error('[Linear Webhook] Error upserting team:', error)
      return NextResponse.json({ error: 'Failed to upsert team' }, { status: 500 })
    }

    console.log(`[Linear Webhook] Team ${action}d:`, data.identifier)
    return NextResponse.json({ message: `Team ${action}d successfully` }, { status: 200 })
  }

  return NextResponse.json({ message: 'Team action not handled' }, { status: 200 })
}

// Issue作成時の処理
async function handleIssueCreate(supabase: any, data: LinearWebhookPayload['data'], url?: string) {
  // Team情報を取得または作成
  let teamId: string | null = null
  if (data.team) {
    // Teamを自動的にupsert
    const { error: teamError } = await supabase
      .from('linear_teams')
      .upsert({
        linear_team_id: data.team.id,
        name: data.team.name,
        key: data.team.key,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'linear_team_id'
      })

    if (teamError) {
      console.error('Error upserting team:', teamError)
    } else {
      teamId = data.team.id
      console.log('Team upserted:', data.team.id)
    }
  }

  // Project情報を取得または作成
  if (data.project) {
    const { error: projectError } = await supabase
      .from('linear_projects')
      .upsert({
        linear_project_id: data.project.id,
        name: data.project.name,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'linear_project_id'
      })

    if (projectError) {
      console.error('Error upserting project:', projectError)
    } else {
      console.log('Project upserted:', data.project.id)
    }
  }

  // Issueに対応するタスクが既に存在するかチェック
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('id')
    .eq('linear_issue_id', data.id)
    .single()

  if (existingTask) {
    console.log('Task already exists for issue:', data.identifier)
    return NextResponse.json({ message: 'Task already exists' }, { status: 200 })
  }

  // タスク名を生成（[TEAM-123] タイトル）
  const taskName = `[${data.identifier}] ${data.title}`

  // ランダムな色を生成
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e'
  ]
  const randomColor = colors[Math.floor(Math.random() * colors.length)]

  // Linear Issueのassigneeを取得
  let assigneeUserId: string | null = null
  if (data.assignee?.email) {
    const { data: assigneeUser } = await supabase
      .from('user_approvals')
      .select('user_id')
      .eq('email', data.assignee.email)
      .single()

    if (assigneeUser) {
      assigneeUserId = assigneeUser.user_id
    }
  }

  // assigneeが見つからない場合は、最初の管理者に割り当て
  if (!assigneeUserId) {
    const { data: adminUser } = await supabase
      .from('user_approvals')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .single()

    if (adminUser) {
      assigneeUserId = adminUser.user_id
    }
  }

  // タスクを作成
  const { data: newTask, error: insertError } = await supabase
    .from('tasks')
    .insert({
      user_id: assigneeUserId,
      name: taskName,
      color: randomColor,
      linear_issue_id: data.id,
      linear_team_id: teamId,
      linear_state_type: data.state?.type || null,
      linear_project_id: data.project?.id || null,
      description: data.description || null,
      assignee_email: data.assignee?.email || null,
      assignee_name: data.assignee?.name || null,
      linear_identifier: data.identifier,
      linear_url: url || null,
      priority: data.priority || 0,
      linear_updated_at: data.updatedAt || new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error creating task:', insertError)
    return NextResponse.json(
      { error: 'Failed to create task', details: insertError.message },
      { status: 500 }
    )
  }

  console.log('Task created successfully:', {
    taskId: newTask.id,
    issueId: data.id,
    identifier: data.identifier
  })

  return NextResponse.json({
    message: 'Task created successfully',
    task: newTask
  }, { status: 201 })
}

// Issue更新時の処理
async function handleIssueUpdate(supabase: any, data: LinearWebhookPayload['data'], url?: string) {
  // Issueに対応するタスクを取得
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('id, user_id, color, priority')
    .eq('linear_issue_id', data.id)
    .single()

  if (!existingTask) {
    console.log('Task not found for issue:', data.identifier)
    return NextResponse.json({ message: 'Task not found' }, { status: 404 })
  }

  // タスク名を更新（[TEAM-123] タイトル）
  const taskName = `[${data.identifier}] ${data.title}`

  // Team情報を取得または作成
  let teamId: string | null = null
  if (data.team) {
    // Teamを自動的にupsert
    const { error: teamError } = await supabase
      .from('linear_teams')
      .upsert({
        linear_team_id: data.team.id,
        name: data.team.name,
        key: data.team.key,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'linear_team_id'
      })

    if (teamError) {
      console.error('Error upserting team:', teamError)
    } else {
      teamId = data.team.id
      console.log('Team upserted:', data.team.id)
    }
  }

  // Project情報を取得または作成
  if (data.project) {
    const { error: projectError} = await supabase
      .from('linear_projects')
      .upsert({
        linear_project_id: data.project.id,
        name: data.project.name,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'linear_project_id'
      })

    if (projectError) {
      console.error('Error upserting project:', projectError)
    } else {
      console.log('Project upserted:', data.project.id)
    }
  }

  // assigneeが変更された場合、user_idを更新
  let assigneeUserId: string | null = existingTask.user_id
  if (data.assignee?.email) {
    const { data: assigneeUser } = await supabase
      .from('user_approvals')
      .select('user_id')
      .eq('email', data.assignee.email)
      .single()

    if (assigneeUser) {
      assigneeUserId = assigneeUser.user_id
    }
  }

  // タスクを更新
  const { data: updatedTask, error: updateError } = await supabase
    .from('tasks')
    .update({
      name: taskName,
      user_id: assigneeUserId,
      linear_team_id: teamId,
      linear_state_type: data.state?.type || null,
      linear_project_id: data.project?.id || null,
      description: data.description || null,
      assignee_email: data.assignee?.email || null,
      assignee_name: data.assignee?.name || null,
      linear_url: url || null,
      priority: data.priority !== undefined ? data.priority : existingTask.priority,
      linear_updated_at: data.updatedAt || new Date().toISOString(),
    })
    .eq('id', existingTask.id)
    .select()
    .single()

  if (updateError) {
    console.error('Error updating task:', updateError)
    return NextResponse.json(
      { error: 'Failed to update task', details: updateError.message },
      { status: 500 }
    )
  }

  console.log('Task updated successfully:', {
    taskId: updatedTask.id,
    issueId: data.id,
    identifier: data.identifier
  })

  return NextResponse.json({
    message: 'Task updated successfully',
    task: updatedTask
  }, { status: 200 })
}

// Issue削除時の処理
async function handleIssueRemove(supabase: any, data: LinearWebhookPayload['data']) {
  // Issueに対応するタスクを取得
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('id')
    .eq('linear_issue_id', data.id)
    .single()

  if (!existingTask) {
    console.log('Task not found for issue:', data.identifier)
    return NextResponse.json({ message: 'Task not found' }, { status: 404 })
  }

  // タスクを削除
  const { error: deleteError } = await supabase
    .from('tasks')
    .delete()
    .eq('id', existingTask.id)

  if (deleteError) {
    console.error('Error deleting task:', deleteError)
    return NextResponse.json(
      { error: 'Failed to delete task', details: deleteError.message },
      { status: 500 }
    )
  }

  console.log('Task deleted successfully:', {
    taskId: existingTask.id,
    issueId: data.id,
    identifier: data.identifier
  })

  return NextResponse.json({
    message: 'Task deleted successfully',
    taskId: existingTask.id
  }, { status: 200 })
}

// GETリクエストは無視（Webhookの検証用）
export async function GET() {
  return NextResponse.json({ message: 'Linear webhook endpoint' }, { status: 200 })
}
