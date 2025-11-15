import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { updateTimeEntryInSheet, TimeEntryData } from '@/lib/google-sheets'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // ユーザー認証チェック
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // リクエストボディから時間エントリーIDを取得
    const { timeEntryId } = await request.json()

    if (!timeEntryId) {
      return NextResponse.json(
        { error: 'timeEntryId is required' },
        { status: 400 }
      )
    }

    // 時間エントリーとタスク情報を取得
    console.log('[Spreadsheet Update API] Fetching time entry:', timeEntryId)
    console.log('[Spreadsheet Update API] Current user:', user.id)

    const { data: timeEntry, error: timeEntryError } = await supabase
      .from('time_entries')
      .select('*')
      .eq('id', timeEntryId)
      .single()

    console.log('[Spreadsheet Update API] Time entry result:', timeEntry)
    console.log('[Spreadsheet Update API] Error:', timeEntryError)

    if (timeEntryError || !timeEntry) {
      console.error('Error fetching time entry:', timeEntryError)
      return NextResponse.json(
        { error: 'Time entry not found', details: timeEntryError },
        { status: 404 }
      )
    }

    // タスク情報を個別に取得
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', timeEntry.task_id)
      .single()

    console.log('[Spreadsheet Update API] Task data:', task)
    console.log('[Spreadsheet Update API] Task error:', taskError)

    // Team情報を個別に取得
    let teamName = null
    if (task?.linear_team_id) {
      console.log('[Spreadsheet Update API] Fetching team:', task.linear_team_id)
      const { data: team, error: teamError } = await supabase
        .from('linear_teams')
        .select('name')
        .eq('linear_team_id', task.linear_team_id)
        .single()
      console.log('[Spreadsheet Update API] Team data:', team)
      console.log('[Spreadsheet Update API] Team error:', teamError)
      teamName = team?.name || null
    }

    // Project情報を個別に取得
    let projectName = null
    if (task?.linear_project_id) {
      console.log('[Spreadsheet Update API] Fetching project:', task.linear_project_id)
      const { data: project, error: projectError } = await supabase
        .from('linear_projects')
        .select('name')
        .eq('linear_project_id', task.linear_project_id)
        .single()
      console.log('[Spreadsheet Update API] Project data:', project)
      console.log('[Spreadsheet Update API] Project error:', projectError)
      projectName = project?.name || null
    }

    // ユーザー名をuser_approvalsから取得
    let assigneeName = null
    if (timeEntry.user_id) {
      const { data: userApproval } = await supabase
        .from('user_approvals')
        .select('name')
        .eq('user_id', timeEntry.user_id)
        .single()
      assigneeName = userApproval?.name || null
    }

    // 時間エントリーがログインユーザーのものか確認
    if (timeEntry.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: This time entry does not belong to you' },
        { status: 403 }
      )
    }

    // 開始時刻と終了時刻が両方存在するか確認
    if (!timeEntry.start_time || !timeEntry.end_time) {
      return NextResponse.json(
        { error: 'Time entry is incomplete' },
        { status: 400 }
      )
    }

    // 稼働時間を計算（時間単位）
    const startTime = new Date(timeEntry.start_time)
    const endTime = new Date(timeEntry.end_time)
    const workingHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)

    // スプレッドシートに書き込むデータを準備
    const sheetData: TimeEntryData = {
      timeEntryId: timeEntryId,
      date: startTime.toLocaleDateString('ja-JP'),
      teamName: teamName,
      projectName: projectName,
      issueName: task?.linear_identifier || task?.name || null,
      issueDescription: task?.description || null,
      comment: timeEntry.comment || '',
      workingHours,
      assigneeName: assigneeName,
      startTime: startTime.toLocaleString('ja-JP'),
      endTime: endTime.toLocaleString('ja-JP'),
    }

    console.log('[Spreadsheet Update API] Sheet data to update:', sheetData)

    // Google Sheetsで更新
    await updateTimeEntryInSheet(sheetData)

    console.log('Successfully updated time entry in spreadsheet:', {
      timeEntryId,
      date: sheetData.date,
    })

    return NextResponse.json({
      message: 'Time entry updated in spreadsheet successfully',
      timeEntryId,
    }, { status: 200 })

  } catch (error) {
    console.error('Error updating time entry in spreadsheet:', error)
    return NextResponse.json(
      {
        error: 'Failed to update time entry in spreadsheet',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
