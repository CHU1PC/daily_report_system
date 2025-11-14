import { WebClient } from '@slack/web-api'

/**
 * Slack Web APIクライアント
 */
export function createSlackClient(token?: string) {
  const slackToken = token || process.env.SLACK_BOT_TOKEN

  if (!slackToken) {
    throw new Error('SLACK_BOT_TOKEN is not configured')
  }

  return new WebClient(slackToken)
}

/**
 * Slackチャンネルにメッセージを送信
 */
export async function sendSlackMessage(params: {
  channel: string
  text?: string
  blocks?: any[]
  thread_ts?: string
}) {
  const client = createSlackClient()

  try {
    const result = await client.chat.postMessage({
      channel: params.channel,
      text: params.text,
      blocks: params.blocks,
      thread_ts: params.thread_ts,
    })

    return { success: true, data: result }
  } catch (error) {
    console.error('Slack message send error:', error)
    return { success: false, error }
  }
}

/**
 * 日報データをSlack用のフォーマットに整形
 */
export function formatDailyReportForSlack(report: {
  userName: string
  date: string
  tasks: Array<{ name: string; duration: number; color?: string }>
  totalHours: number
  totalMinutes: number
  notes?: string
}) {
  const { userName, date, tasks, totalHours, totalMinutes, notes } = report

  // タスクリストのフォーマット
  const taskList = tasks
    .map((task, index) => {
      const hours = Math.floor(task.duration / 3600)
      const minutes = Math.floor((task.duration % 3600) / 60)
      const timeStr = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`
      return `${index + 1}. ${task.name} - ${timeStr}`
    })
    .join('\n')

  // Slack Blocks形式でリッチなメッセージを作成
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📝 ${userName}さんの日報 - ${date}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*合計作業時間*\n${totalHours}時間${totalMinutes}分`,
        },
        {
          type: 'mrkdwn',
          text: `*タスク数*\n${tasks.length}件`,
        },
      ],
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*タスク一覧*\n${taskList}`,
      },
    },
  ]

  // 備考がある場合は追加
  if (notes && notes.trim()) {
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*備考*\n${notes}`,
        },
      }
    )
  }

  return {
    text: `${userName}さんの日報 - ${date}`, // フォールバック用のプレーンテキスト
    blocks,
  }
}
