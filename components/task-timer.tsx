"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import type { Task, TimeEntry } from "@/lib/types"
import { Play, Square, Clock } from "lucide-react"
import { generateId } from "@/lib/utils"
import { useAuth } from "@/lib/contexts/AuthContext"
import { logger } from "@/lib/logger"

// タイムゾーン定義
const TIMEZONES = {
  'Asia/Tokyo': { name: '日本時間 (JST)', offset: 9 },
  'America/New_York': { name: 'アメリカ東部時間 (EST/EDT)', offset: -5 }, // 冬時間、夏時間は-4
  'America/Los_Angeles': { name: 'アメリカ太平洋時間 (PST/PDT)', offset: -8 }, // 冬時間、夏時間は-7
  'Europe/London': { name: 'イギリス時間 (GMT/BST)', offset: 0 }, // 冬時間、夏時間は+1
  'Asia/Shanghai': { name: '中国標準時 (CST)', offset: 8 },
  'Asia/Kolkata': { name: 'インド標準時 (IST)', offset: 5.5 },
  'Europe/Paris': { name: '中央ヨーロッパ時間 (CET/CEST)', offset: 1 }, // 冬時間、夏時間は+2
  'Australia/Sydney': { name: 'オーストラリア東部時間 (AEST/AEDT)', offset: 10 }, // 冬時間、夏時間は+11
  'Pacific/Auckland': { name: 'ニュージーランド時間 (NZST/NZDT)', offset: 12 }, // 冬時間、夏時間は+13
} as const

type TimezoneKey = keyof typeof TIMEZONES

// 指定したタイムゾーンで日付を取得するヘルパー関数
const getDateInTimezone = (date: Date, timezone: TimezoneKey): string => {
  const offset = TIMEZONES[timezone].offset
  // UTCタイムスタンプにオフセット時間を追加
  const tzDate = new Date(date.getTime() + (offset * 60 * 60 * 1000))
  const year = tzDate.getUTCFullYear()
  const month = String(tzDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(tzDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface TaskTimerProps {
  tasks: Task[]
  onAddEntry: (entry: TimeEntry) => Promise<TimeEntry | undefined>
  onUpdateEntry: (id: string, updates: Partial<TimeEntry>) => void
  timeEntries: TimeEntry[]
  isHeaderMode?: boolean
}

export function TaskTimer({ tasks, onAddEntry, onUpdateEntry, timeEntries, isHeaderMode = false }: TaskTimerProps) {
  const { user } = useAuth()
  const [selectedTaskId, setSelectedTaskId] = useState<string>("")
  const [isRunning, setIsRunning] = useState(false)
  const [startTime, setStartTime] = useState<string>("")
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [comment, setComment] = useState("")
  const [showCommentDialog, setShowCommentDialog] = useState(false)
  const [pendingComment, setPendingComment] = useState("")
  const [currentEntryId, setCurrentEntryId] = useState<string>("")
  const [timezone, setTimezone] = useState<TimezoneKey>('Asia/Tokyo')
  const [isSaving, setIsSaving] = useState(false)

  // タイムゾーンをlocalStorageから読み込み
  useEffect(() => {
    const saved = localStorage.getItem('taskTimerTimezone')
    if (saved && saved in TIMEZONES) {
      setTimezone(saved as TimezoneKey)
    }
  }, [])

  // タイムゾーン変更時にlocalStorageに保存
  const handleTimezoneChange = (newTimezone: TimezoneKey) => {
    setTimezone(newTimezone)
    localStorage.setItem('taskTimerTimezone', newTimezone)
  }

  // タスクをフィルタリング: completed/canceledを除外し、assignee_emailが一致するもの + グローバルタスクのみ表示
  const availableTasks = tasks.filter((task) => {
    // linear_state_typeがcompleted, canceledの場合は除外
    if (task.linear_state_type === 'completed' || task.linear_state_type === 'canceled') {
      logger.log('[TaskTimer] Excluding completed/canceled task:', task.name)
      return false
    }

    // 1. グローバルタスク（全員が見える）
    if (task.assignee_email === 'TaskForAll@task.com') {
      logger.log('[TaskTimer] ✅ Including global task:', task.name)
      return true
    }

    // 2. 自分にアサインされているタスク
    if (task.assignee_email === user?.email) {
      logger.log('[TaskTimer] ✅ Including user task:', task.name)
      return true
    }

    // 3. それ以外は非表示
    logger.log('[TaskTimer] ❌ Filtering out task:', {
      taskName: task.name,
      taskAssigneeEmail: task.assignee_email,
      currentUserEmail: user?.email,
    })
    return false
  })

  logger.log('[TaskTimer] Total available tasks:', availableTasks.length, availableTasks.map(t => t.name))

  // タスクをTeamごとにグループ化してソート
  const groupedAvailableTasks = availableTasks.reduce((groups, task) => {
    // グローバルタスク（linear_team_idがnull）の場合は、linear_identifierをラベルとして使用
    // それ以外はTeam名を使用
    let teamName: string
    if (!task.linear_team_id && task.assignee_email === 'TaskForAll@task.com') {
      // グローバルタスク: linear_identifierをラベルとして使用（なければ「その他」）
      teamName = task.linear_identifier || 'その他'
    } else if (task.linear_team_id) {
      // 通常のLinearタスク: Team名を使用
      teamName = `Team: ${task.linear_identifier?.split('-')[0] || 'Unknown'}`
    } else {
      // その他
      teamName = 'その他'
    }

    if (!groups[teamName]) {
      groups[teamName] = []
    }
    groups[teamName].push(task)
    return groups
  }, {} as Record<string, typeof availableTasks>)

  // グループをソート: Teamグループを上に、グローバルタスクグループ（Team:で始まらない）を下に配置
  const sortedGroupedTasks = Object.entries(groupedAvailableTasks).sort(([teamA], [teamB]) => {
    const isTeamA = teamA.startsWith('Team:')
    const isTeamB = teamB.startsWith('Team:')

    // 両方ともTeamグループの場合、アルファベット順
    if (isTeamA && isTeamB) {
      return teamA.localeCompare(teamB)
    }

    // 片方だけTeamグループの場合、Teamグループを上に
    if (isTeamA) return -1
    if (isTeamB) return 1

    // 両方ともグローバルタスクグループの場合、アルファベット順
    return teamA.localeCompare(teamB)
  })

  useEffect(() => {
    let interval: NodeJS.Timeout

    if (isRunning && startTime) {
      interval = setInterval(() => {
        const now = new Date()
        const start = new Date(startTime)

        // 日付が変わったかチェック（選択されたタイムゾーン基準）
        const startDate = getDateInTimezone(start, timezone)
        const nowDate = getDateInTimezone(now, timezone)

        if (startDate !== nowDate) {
          // 24時を跨いだ場合、自動的に停止して再開
          console.log(`[TaskTimer] Midnight crossover detected (${TIMEZONES[timezone].name})`)
          console.log(`[TaskTimer] Start date: ${startDate}, Now date: ${nowDate}`)
          handleMidnightCrossover()
        } else {
          const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000)
          // 負の値を防ぐ
          setElapsedSeconds(Math.max(0, elapsed))
        }
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isRunning, startTime, selectedTaskId, currentEntryId, comment, pendingComment])

  useEffect(() => {
    if (selectedTaskId && !comment) {
      const today = new Date().toISOString().split("T")[0]
      const todayEntries = timeEntries.filter(
        (entry) => entry.taskId === selectedTaskId && entry.date === today && entry.comment,
      )
      if (todayEntries.length > 0) {
        setComment(todayEntries[todayEntries.length - 1].comment)
        setPendingComment(todayEntries[todayEntries.length - 1].comment)
      }
    }
  }, [selectedTaskId, timeEntries, comment])

  // ページロード時に進行中のエントリを復元
  useEffect(() => {
    const activeEntry = timeEntries.find((entry) => !entry.endTime)
    if (activeEntry) {
      const now = new Date()
      const start = new Date(activeEntry.startTime)

      // 日付が変わっているかチェック（選択されたタイムゾーン基準）
      const startDate = getDateInTimezone(start, timezone)
      const nowDate = getDateInTimezone(now, timezone)

      if (startDate !== nowDate) {
        // 24時を跨いでいる場合は、前日分を自動で終了させる
        console.log(`[TaskTimer] Active entry from previous day detected (${TIMEZONES[timezone].name}), will handle midnight crossover`)
        console.log(`[TaskTimer] Start date: ${startDate}, Now date: ${nowDate}`)
        setCurrentEntryId(activeEntry.id)
        setSelectedTaskId(activeEntry.taskId)
        setStartTime(activeEntry.startTime)
        setIsRunning(true)
        setComment(activeEntry.comment)
        setPendingComment(activeEntry.comment)
        setElapsedSeconds(0)

        // handleMidnightCrossoverが次のuseEffectで呼ばれる
      } else {
        // 同じ日の場合は通常通り復元
        setCurrentEntryId(activeEntry.id)
        setSelectedTaskId(activeEntry.taskId)
        setStartTime(activeEntry.startTime)
        setIsRunning(true)
        setComment(activeEntry.comment)
        setPendingComment(activeEntry.comment)

        // 経過時間を計算（負の値を防ぐ）
        const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000)
        setElapsedSeconds(Math.max(0, elapsed))
      }
    }
  }, [])

  const writeToSpreadsheet = async (entryId: string) => {
    try {
      const response = await fetch('/api/spreadsheet/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeEntryId: entryId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[writeToSpreadsheet] Failed to write to spreadsheet:', errorData)
      } else {
        console.log('[writeToSpreadsheet] Successfully wrote to spreadsheet')
      }
    } catch (spreadsheetError) {
      console.error('[writeToSpreadsheet] Error writing to spreadsheet:', spreadsheetError)
    }
  }

  const handleMidnightCrossover = async () => {
    if (!isRunning || !selectedTaskId || !startTime || !currentEntryId) return

    // 前日の23:59:59を計算
    const previousDayEnd = new Date(startTime)
    previousDayEnd.setHours(23, 59, 59, 999)

    // 現在進行中のエントリを前日の23:59:59で終了
    await onUpdateEntry(currentEntryId, {
      endTime: previousDayEnd.toISOString(),
      comment: comment || pendingComment,
    })

    // スプレッドシートに書き込み
    await writeToSpreadsheet(currentEntryId)

    // 新しい日の00:00:00で新しいタスクを開始
    const newDayStart = new Date(previousDayEnd)
    newDayStart.setHours(0, 0, 0, 0)
    newDayStart.setDate(newDayStart.getDate() + 1)

    const newEntry: TimeEntry = {
      id: generateId(),
      taskId: selectedTaskId,
      startTime: newDayStart.toISOString(),
      endTime: undefined,
      comment: comment || pendingComment || "",
      date: getDateInTimezone(newDayStart, timezone),
    }

    onAddEntry(newEntry)
    setCurrentEntryId(newEntry.id)
    setStartTime(newDayStart.toISOString())
    setElapsedSeconds(0)

    console.log(`Midnight crossover: Split task at ${previousDayEnd.toISOString()} and restarted at ${newDayStart.toISOString()}`)
  }

  const handleStart = async () => {
    if (!selectedTaskId) return

    const nowDate = new Date()
    const now = nowDate.toISOString()
    const newEntry: TimeEntry = {
      id: generateId(),
      taskId: selectedTaskId,
      startTime: now,
      endTime: undefined, // 進行中
      comment: comment || pendingComment || "",
      date: getDateInTimezone(nowDate, timezone),
    }

    console.log('[TaskTimer] Starting timer with entry:', newEntry)

    // すぐにサーバーに保存して、実際に保存されたIDを取得
    try {
      const savedEntry = await onAddEntry(newEntry)
      const actualEntryId = savedEntry?.id || newEntry.id
      console.log('[TaskTimer] Entry saved with actual ID:', actualEntryId)

      setCurrentEntryId(actualEntryId)
      setStartTime(now)
      setIsRunning(true)
      setElapsedSeconds(0)
    } catch (error) {
      console.error('[TaskTimer] Failed to start timer:', error)
    }
  }

  const handleStop = () => {
    if (!isRunning || !selectedTaskId) return
    setShowCommentDialog(true)
  }

  const handleSaveEntry = async () => {
    // 既に保存処理中の場合は何もしない
    if (isSaving) {
      console.log('[handleSaveEntry] Already saving, ignoring duplicate click')
      return
    }

    setIsSaving(true)
    const now = new Date().toISOString()

    console.log('[handleSaveEntry] Stopping timer')
    console.log('[handleSaveEntry] Current entry ID:', currentEntryId)
    console.log('[handleSaveEntry] End time:', now)
    console.log('[handleSaveEntry] Comment:', pendingComment)

    // 現在進行中のエントリを更新
    if (currentEntryId) {
      try {
        await onUpdateEntry(currentEntryId, {
          endTime: now,
          comment: pendingComment,
        })
        console.log('[handleSaveEntry] Entry updated successfully')

        // Google Sheetsにデータを書き込む
        await writeToSpreadsheet(currentEntryId)
      } catch (error) {
        console.error('[handleSaveEntry] Failed to update entry:', error)
        setIsSaving(false) // エラー時はローディング状態を解除
        return // エラーが発生した場合は処理を中断
      }
    } else {
      console.error('[handleSaveEntry] No current entry ID found!')
      setIsSaving(false)
      return
    }

    setIsRunning(false)
    setStartTime("")
    setElapsedSeconds(0)
    setComment(pendingComment)
    setCurrentEntryId("")
    setShowCommentDialog(false)
    setIsSaving(false)
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId)

  if (isHeaderMode) {
    return (
      <>
        <div className="bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-4">
                <h1 className="text-base sm:text-xl font-bold text-foreground">日報月報管理システム</h1>
                <Select value={timezone} onValueChange={(value) => handleTimezoneChange(value as TimezoneKey)}>
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIMEZONES) as TimezoneKey[]).map((tz) => (
                      <SelectItem key={tz} value={tz} className="text-xs">
                        {TIMEZONES[tz].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:flex-1 sm:max-w-3xl">
                <Select value={selectedTaskId} onValueChange={setSelectedTaskId} disabled={isRunning}>
                  <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue placeholder="タスクを選択" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px]" position="popper" sideOffset={4}>
                    {sortedGroupedTasks.map(([teamName, teamTasks]) => (
                      <div key={teamName}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                          {teamName} ({teamTasks.length})
                        </div>
                        {teamTasks.map((task) => (
                          <SelectItem key={task.id} value={task.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: task.color }} />
                              <span className="truncate">{task.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 sm:gap-3 bg-primary/10 px-3 sm:px-4 py-2 rounded-lg w-full sm:w-auto">
                  <Clock className={`w-3 h-3 sm:w-4 sm:h-4 ${isRunning ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                  <div className="text-base sm:text-lg font-mono font-bold text-foreground">{formatTime(elapsedSeconds)}</div>
                  {isRunning && selectedTask && (
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedTask.color }} />
                      <span className="text-sm text-muted-foreground truncate max-w-[100px]">{selectedTask.name}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                  <Button onClick={handleStart} disabled={!selectedTaskId || isRunning} size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm">
                    <Play className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    開始
                  </Button>
                  <Button onClick={handleStop} disabled={!isRunning} variant="destructive" size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm">
                    <Square className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    停止
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>作業コメントを入力</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">コメント</label>
                <Textarea
                  value={pendingComment}
                  onChange={(e) => setPendingComment(e.target.value)}
                  placeholder="作業内容を入力してください"
                  rows={4}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCommentDialog(false)} disabled={isSaving}>
                キャンセル
              </Button>
              <Button onClick={handleSaveEntry} disabled={isSaving}>
                {isSaving ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-bold text-foreground">日報月報管理システム</h1>

            <div className="flex items-center gap-4 flex-1 max-w-3xl">
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId} disabled={isRunning}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="タスクを選択" />
                </SelectTrigger>
                <SelectContent>
                  {availableTasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: task.color }} />
                        {task.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-3 bg-primary/10 px-4 py-2 rounded-lg">
                <Clock className={`w-4 h-4 ${isRunning ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                <div className="text-lg font-mono font-bold text-foreground">{formatTime(elapsedSeconds)}</div>
                {isRunning && selectedTask && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedTask.color }} />
                    <span className="text-sm text-muted-foreground">{selectedTask.name}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 ml-auto">
                <Button onClick={handleStart} disabled={!selectedTaskId || isRunning} size="sm">
                  <Play className="w-4 h-4 mr-1" />
                  開始
                </Button>
                <Button onClick={handleStop} disabled={!isRunning} variant="destructive" size="sm">
                  <Square className="w-4 h-4 mr-1" />
                  停止
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>作業コメントを入力</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">コメント</label>
              <Textarea
                value={pendingComment}
                onChange={(e) => setPendingComment(e.target.value)}
                placeholder="作業内容を入力してください"
                rows={4}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCommentDialog(false)} disabled={isSaving}>
              キャンセル
            </Button>
            <Button onClick={handleSaveEntry} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
