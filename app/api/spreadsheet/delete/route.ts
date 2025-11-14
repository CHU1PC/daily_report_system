import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { deleteTimeEntryFromSheet } from '@/lib/google-sheets'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // ユーザー認証チェック
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // リクエストボディから時間エントリーIDを取得
    const { timeEntryId, startTime } = await request.json()

    if (!timeEntryId || !startTime) {
      return NextResponse.json(
        { error: 'timeEntryId and startTime are required' },
        { status: 400 }
      )
    }

    console.log('[Spreadsheet Delete API] Deleting time entry:', timeEntryId)
    console.log('[Spreadsheet Delete API] Start time:', startTime)

    // 日付を取得（Date型として渡す）
    const dateStr = new Date(startTime).toLocaleDateString('ja-JP')
    console.log('[Spreadsheet Delete API] Date string:', dateStr)

    // Google Sheetsから削除
    await deleteTimeEntryFromSheet(timeEntryId, dateStr)

    console.log('Successfully deleted time entry from spreadsheet:', {
      timeEntryId,
      date: dateStr,
    })

    return NextResponse.json({
      message: 'Time entry deleted from spreadsheet successfully',
      timeEntryId,
    }, { status: 200 })

  } catch (error) {
    console.error('Error deleting time entry from spreadsheet:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete time entry from spreadsheet',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
