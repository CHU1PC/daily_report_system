import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendSlackMessage, formatDailyReportForSlack } from '@/lib/slack'

/**
 * 毎日24時に実行される日報自動送信API
 * GET /api/cron/daily-report
 *
 * Vercel Cronまたは外部cronサービスから呼び出される
 */
export async function GET(request: NextRequest) {
  try {
    // Cron Secret認証（セキュリティのため）
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: '認証に失敗しました' },
        { status: 401 }
      )
    }

    const slackChannel = process.env.SLACK_DAILY_REPORT_CHANNEL

    if (!slackChannel) {
      return NextResponse.json(
        { error: 'SLACK_DAILY_REPORT_CHANNEL が設定されていません' },
        { status: 500 }
      )
    }

    const supabase = await createServerSupabaseClient()

    // 今日の日付を取得（日本時間）
    const now = new Date()
    const jstOffset = 9 * 60 * 60 * 1000 // JST is UTC+9
    const jstDate = new Date(now.getTime() + jstOffset)
    const today = jstDate.toISOString().split('T')[0]

    // 全ユーザーを取得
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('role', 'user') // 一般ユーザーのみ

    if (usersError) {
      console.error('Users fetch error:', usersError)
      return NextResponse.json(
        { error: 'ユーザーの取得に失敗しました' },
        { status: 500 }
      )
    }

    const results = []

    // 各ユーザーの日報を取得してSlackに送信
    for (const user of users || []) {
      try {
        // 今日のタスクを取得
        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', `${today}T00:00:00`)
          .lte('created_at', `${today}T23:59:59`)

        if (tasksError) {
          console.error(`Tasks fetch error for user ${user.id}:`, tasksError)
          continue
        }

        // タスクがない場合はスキップ
        if (!tasks || tasks.length === 0) {
          results.push({
            userId: user.id,
            userName: user.name || user.email,
            status: 'skipped',
            reason: 'タスクなし',
          })
          continue
        }

        // 今日の時間エントリを取得
        const { data: timeEntries, error: timeEntriesError } = await supabase
          .from('time_entries')
          .select('*')
          .in('task_id', tasks.map(t => t.id))

        if (timeEntriesError) {
          console.error(`Time entries fetch error for user ${user.id}:`, timeEntriesError)
          continue
        }

        // タスクごとの作業時間を集計
        const taskDurations = new Map<string, number>()

        timeEntries?.forEach((entry) => {
          const current = taskDurations.get(entry.task_id) || 0
          taskDurations.set(entry.task_id, current + (entry.duration || 0))
        })

        // タスク情報を整形
        const taskList = tasks.map(task => ({
          name: task.name,
          duration: taskDurations.get(task.id) || 0,
          color: task.color,
        }))

        // 合計時間を計算
        const totalSeconds = Array.from(taskDurations.values()).reduce((sum, duration) => sum + duration, 0)
        const totalHours = Math.floor(totalSeconds / 3600)
        const totalMinutes = Math.floor((totalSeconds % 3600) / 60)

        // 日報データを整形
        const reportData = {
          userName: user.name || user.email,
          date: today,
          tasks: taskList,
          totalHours,
          totalMinutes,
          notes: '', // 必要に応じて追加
        }

        const slackMessage = formatDailyReportForSlack(reportData)

        // Slackに送信
        const slackResult = await sendSlackMessage({
          channel: slackChannel,
          text: slackMessage.text,
          blocks: slackMessage.blocks,
        })

        results.push({
          userId: user.id,
          userName: user.name || user.email,
          status: slackResult.success ? 'success' : 'failed',
          totalHours,
          totalMinutes,
          taskCount: tasks.length,
        })
      } catch (error) {
        console.error(`Error processing report for user ${user.id}:`, error)
        results.push({
          userId: user.id,
          userName: user.name || user.email,
          status: 'error',
          error: error instanceof Error ? error.message : '不明なエラー',
        })
      }
    }

    return NextResponse.json({
      success: true,
      date: today,
      results,
      message: `${results.length}件の日報を処理しました`,
    })
  } catch (error) {
    console.error('Daily report cron error:', error)
    return NextResponse.json(
      {
        error: '日報送信処理に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
