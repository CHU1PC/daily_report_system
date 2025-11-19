"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Task, TimeEntry } from "@/lib/types"
import {
  Pencil, Trash2, RefreshCw, AlertCircle, CheckCircle, ChevronDown, ChevronRight, Users
} from "lucide-react"
import { useAuth } from "@/lib/contexts/AuthContext"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface TaskManagementProps {
  tasks: Task[]
  timeEntries: TimeEntry[]
  onTasksChange: (tasks: Task[]) => void
  onUpdateTask?: (id: string, updates: Partial<Task>) => Promise<void>
  onDeleteTask?: (id: string) => Promise<void>
}

const PRESET_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"]

interface TeamInfo {
  id: string
  linear_team_id: string
  name: string
  key: string
}

export function TaskManagement({ tasks, timeEntries, onTasksChange, onUpdateTask, onDeleteTask }: TaskManagementProps) {
  const { isAdmin } = useAuth()
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [teams, setTeams] = useState<TeamInfo[]>([])
  const [creatingGlobalTask, setCreatingGlobalTask] = useState(false)
  const [showGlobalTaskDialog, setShowGlobalTaskDialog] = useState(false)
  const [newGlobalTaskName, setNewGlobalTaskName] = useState('')

  // Team情報を取得
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await fetch('/api/admin/linear-teams')
        if (res.ok) {
          const data = await res.json()
          setTeams(data.teams || [])
        }
      } catch (err) {
        console.error('Failed to fetch teams:', err)
      }
    }
    fetchTeams()
  }, [])

  // タスクをTeamごとにグループ化し、優先度とステータスでソート
  const groupedTasks = useMemo(() => {
    const grouped = new Map<string, { team: TeamInfo | null, tasks: Task[] }>()

    // Teamごとにタスクを分類
    tasks.forEach(task => {
      const teamId = task.linear_team_id || 'no-team'
      if (!grouped.has(teamId)) {
        const team = teams.find(t => t.linear_team_id === teamId) || null
        grouped.set(teamId, { team, tasks: [] })
      }
      grouped.get(teamId)!.tasks.push(task)
    })

    // 各チームのタスクをソート
    return Array.from(grouped.entries()).map(([teamId, data]) => {
      // タスクをソート: Done以外を上に、その上で優先度順（高い方が上）
      const sortedTasks = [...data.tasks].sort((a, b) => {
        // 1. まずDone（completed/canceled）かどうかで分ける
        const aIsDone = a.linear_state_type === 'completed' || a.linear_state_type === 'canceled'
        const bIsDone = b.linear_state_type === 'completed' || b.linear_state_type === 'canceled'

        if (aIsDone !== bIsDone) {
          return aIsDone ? 1 : -1 // Done以外を上に
        }

        // 2. 同じグループ内では優先度順（1が最高、4が最低、0は未設定）
        // Linearの優先度: 0=なし, 1=緊急, 2=高, 3=中, 4=低
        const priorityA = a.priority ?? 999 // 優先度未設定は最下位
        const priorityB = b.priority ?? 999

        return priorityA - priorityB // 数字が小さい方（高優先度）が上
      })

      return {
        teamId,
        team: data.team,
        tasks: sortedTasks
      }
    })
  }, [tasks, teams])

  const totalTime = useMemo(() => {
    let totalSeconds = 0
    timeEntries.forEach((entry) => {
      if (!entry.endTime) return // 進行中のエントリはスキップ
      const start = new Date(entry.startTime).getTime()
      const end = new Date(entry.endTime).getTime()
      totalSeconds += (end - start) / 1000
    })
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    return { hours, minutes }
  }, [timeEntries])

  const { todayTime, yesterdayTime, weekTime, monthTime } = useMemo(() => {
    const today = new Date().toISOString().split("T")[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()

    const now = new Date()
    const dayOfWeek = now.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + diff)
    weekStart.setHours(0, 0, 0, 0)

    let todaySeconds = 0
    let yesterdaySeconds = 0
    let weekSeconds = 0
    let monthSeconds = 0

    timeEntries.forEach((entry) => {
      if (!entry.endTime) return // 進行中のエントリはスキップ
      const start = new Date(entry.startTime).getTime()
      const end = new Date(entry.endTime).getTime()
      const duration = (end - start) / 1000
      const entryDate = new Date(entry.startTime)

      if (entry.date === today) {
        todaySeconds += duration
      } else if (entry.date === yesterday) {
        yesterdaySeconds += duration
      }

      if (entryDate >= weekStart) {
        weekSeconds += duration
      }

      if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
        monthSeconds += duration
      }
    })

    return {
      todayTime: {
        hours: Math.floor(todaySeconds / 3600),
        minutes: Math.floor((todaySeconds % 3600) / 60),
      },
      yesterdayTime: {
        hours: Math.floor(yesterdaySeconds / 3600),
        minutes: Math.floor((yesterdaySeconds % 3600) / 60),
      },
      weekTime: {
        hours: Math.floor(weekSeconds / 3600),
        minutes: Math.floor((weekSeconds % 3600) / 60),
      },
      monthTime: {
        hours: Math.floor(monthSeconds / 3600),
        minutes: Math.floor((monthSeconds % 3600) / 60),
      },
    }
  }, [timeEntries])

  const handleUpdateTask = async () => {
    if (!editingTask || !editingTask.name.trim()) return

    // Linear連携タスクは編集不可
    if (editingTask.linear_issue_id) {
      alert("このタスクはLinearで管理されているため、Linearから編集してください。")
      setEditingTask(null)
      return
    }

    if (onUpdateTask) {
      try {
        await onUpdateTask(editingTask.id, {
          name: editingTask.name,
          color: editingTask.color,
        })
        setEditingTask(null)
      } catch (err) {
        console.error("Failed to update task:", err)
      }
    } else {
      onTasksChange(tasks.map((task) => (task.id === editingTask.id ? editingTask : task)))
      setEditingTask(null)
    }
  }

  const handleDeleteTask = async (id: string) => {
    // Linear連携タスクは削除不可（UIで既にボタンが表示されないが念のため）
    const task = tasks.find(t => t.id === id)
    if (task?.linear_issue_id) {
      alert("このタスクはLinearで管理されているため、Linearから削除してください。")
      return
    }

    if (onDeleteTask) {
      try {
        await onDeleteTask(id)
      } catch (err) {
        console.error("Failed to delete task:", err)
      }
    } else {
      onTasksChange(tasks.filter((task) => task.id !== id))
    }
  }

  const handleSyncLinearIssues = async () => {
    setSyncing(true)
    setSyncMessage(null)

    try {
      const res = await fetch('/api/admin/tasks/sync-linear', {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.details || data.error || 'Linear同期に失敗しました')
      }

      const summary = data.summary
      setSyncMessage({
        type: 'success',
        text: `同期完了: Team ${summary.teams}件、Project ${summary.projects}件、メンバーシップ ${summary.memberships}件、Issue ${summary.synced}件追加、${summary.skipped}件スキップ${summary.errors > 0 ? `、${summary.errors}件エラー` : ''}`
      })
    } catch (err) {
      console.error('Sync error:', err)
      setSyncMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Linear同期に失敗しました'
      })
    } finally {
      setSyncing(false)
    }
  }

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(teamId)) {
        newSet.delete(teamId)
      } else {
        newSet.add(teamId)
      }
      return newSet
    })
  }

  const handleCreateGlobalTask = async () => {
    if (!newGlobalTaskName.trim()) {
      setSyncMessage({
        type: 'error',
        text: 'タスク名を入力してください'
      })
      return
    }

    setCreatingGlobalTask(true)
    setSyncMessage(null)

    try {
      const res = await fetch('/api/admin/tasks/create-global', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskName: newGlobalTaskName.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.details || data.error || 'グローバルタスクの作成に失敗しました')
      }

      setSyncMessage({
        type: 'success',
        text: data.message
      })

      // ダイアログを閉じて入力をクリア
      setShowGlobalTaskDialog(false)
      setNewGlobalTaskName('')

      // タスクリストを再読み込み（ページリロードで更新）
      window.location.reload()
    } catch (err) {
      console.error('Create global task error:', err)
      setSyncMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'グローバルタスクの作成に失敗しました'
      })
    } finally {
      setCreatingGlobalTask(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-[calc(100vh-200px)] relative">
      {/* Linear同期中の表示 */}
      {syncing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-8 space-y-4 text-center min-w-[400px]">
            <div className="text-lg font-semibold">Linear同期中...</div>
            <div className="text-sm text-muted-foreground">
              新しいIssueをデータベースに追加しています。
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        </div>
      )}

      <div className="w-full lg:w-64 space-y-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground mb-2">全タスクの総合計:</div>
          <div className="text-2xl font-bold">
            {totalTime.hours}時間{totalTime.minutes}分
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        {syncMessage && (
          <Alert variant={syncMessage.type === 'success' ? 'default' : 'destructive'}>
            {syncMessage.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{syncMessage.text}</AlertDescription>
          </Alert>
        )}

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">タスク一覧</div>
              <div className="text-xs text-muted-foreground">
                Linear上でIssueを作成すると自動的にタスクが追加されます
              </div>
            </div>
            {isAdmin && (
              <Button
                onClick={() => setShowGlobalTaskDialog(true)}
                variant="outline"
                size="sm"
              >
                グローバルタスク作成
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4 overflow-x-hidden">
          {groupedTasks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                タスクがありません
              </CardContent>
            </Card>
          ) : (
            groupedTasks.map((group) => {
              const isTeamExpanded = expandedTeams.has(group.teamId)
              const teamName = group.team?.name || 'チームなし'
              const teamKey = group.team?.key || ''

              return (
                <Card key={group.teamId}>
                  <Collapsible open={isTeamExpanded} onOpenChange={() => toggleTeam(group.teamId)}>
                    <CardHeader className="cursor-pointer" onClick={() => toggleTeam(group.teamId)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              {isTeamExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <Users className="w-5 h-5 text-primary" />
                          <div className="flex-1">
                            <CardTitle className="text-lg">{teamName}</CardTitle>
                            {teamKey && (
                              <div className="text-xs text-muted-foreground font-mono mt-1">
                                {teamKey}
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {group.tasks.length} タスク
                        </Badge>
                      </div>
                    </CardHeader>

                    <CollapsibleContent>
                      <CardContent className="space-y-2">
                        {group.tasks.map((task) => {
                          // 優先度ラベルと色を取得
                          const getPriorityInfo = (priority?: number) => {
                            switch (priority) {
                              case 1: return { label: '緊急', color: 'bg-red-500 text-white' }
                              case 2: return { label: '高', color: 'bg-orange-500 text-white' }
                              case 3: return { label: '中', color: 'bg-yellow-500 text-white' }
                              case 4: return { label: '低', color: 'bg-blue-500 text-white' }
                              default: return { label: 'なし', color: 'bg-gray-400 text-white' }
                            }
                          }

                          // ステータスラベルと色を取得
                          const getStatusInfo = (stateType?: string) => {
                            const label = stateType || 'NULL'

                            // linear_state_typeに応じて色を変更
                            if (stateType === 'completed') {
                              return { label, color: 'bg-green-600 text-white' }
                            } else if (stateType === 'canceled') {
                              return { label, color: 'bg-gray-600 text-white' }
                            } else {
                              return { label, color: 'bg-blue-600 text-white' }
                            }
                          }

                          const priorityInfo = getPriorityInfo(task.priority)
                          const statusInfo = getStatusInfo(task.linear_state_type)

                          return (
                            <div
                              key={task.id}
                              className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 hover:bg-accent rounded group"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: task.color }}
                                />
                                <span className="flex-1 min-w-0">
                                  <div className="line-clamp-2">{task.name}</div>
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={`text-xs px-2 py-0.5 ${priorityInfo.color} whitespace-nowrap`}>
                                  {priorityInfo.label}
                                </Badge>
                                <Badge className={`text-xs px-2 py-0.5 ${statusInfo.color} whitespace-nowrap`}>
                                  {statusInfo.label}
                                </Badge>
                                {task.linear_issue_id && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                                    {task.linear_url ? (
                                      <a
                                        href={task.linear_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-primary underline"
                                      >
                                        Linearで開く
                                      </a>
                                    ) : (
                                      <span>Linearで管理</span>
                                    )}
                                  </div>
                                )}
                                {isAdmin && !task.linear_issue_id && (
                                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 flex-shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setEditingTask(task)}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleDeleteTask(task.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              )
            })
          )}
        </div>
      </div>

      <div className="w-full lg:w-80 space-y-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-lg font-semibold mb-4">稼働時間統計</div>

          <div className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground mb-1">今月:</div>
              <div className="text-xl font-bold">
                {monthTime.hours}時間{monthTime.minutes}分
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">今週:</div>
              <div className="text-xl font-bold">
                {weekTime.hours}時間{weekTime.minutes}分
              </div>
            </div>

            <div className="flex justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">今日:</div>
                <div className="text-lg font-semibold">
                  {todayTime.hours}時間{todayTime.minutes}分
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1">昨日:</div>
                <div className="text-lg font-semibold">
                  {yesterdayTime.hours}時間{yesterdayTime.minutes}分
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-96 space-y-4">
            <h3 className="text-lg font-semibold">タスクを編集</h3>

            <Input
              value={editingTask.name}
              onChange={(e) => setEditingTask({ ...editingTask, name: e.target.value })}
            />

            <div className="flex gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    editingTask.color === color ? "ring-2 ring-primary ring-offset-2" : ""
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setEditingTask({ ...editingTask, color })}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleUpdateTask} className="flex-1">
                保存
              </Button>
              <Button onClick={() => setEditingTask(null)} variant="outline" className="flex-1">
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      )}

      {showGlobalTaskDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-96 space-y-4">
            <h3 className="text-lg font-semibold">グローバルタスクを作成</h3>
            <p className="text-sm text-muted-foreground">
              全ユーザーが使用できるタスクを作成します
            </p>

            <Input
              placeholder="タスク名を入力（例: 勉強、会議、休憩）"
              value={newGlobalTaskName}
              onChange={(e) => setNewGlobalTaskName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creatingGlobalTask) {
                  handleCreateGlobalTask()
                }
              }}
            />

            <div className="flex gap-2">
              <Button
                onClick={handleCreateGlobalTask}
                className="flex-1"
                disabled={creatingGlobalTask || !newGlobalTaskName.trim()}
              >
                {creatingGlobalTask ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    作成中...
                  </>
                ) : (
                  '作成'
                )}
              </Button>
              <Button
                onClick={() => {
                  setShowGlobalTaskDialog(false)
                  setNewGlobalTaskName('')
                }}
                variant="outline"
                className="flex-1"
                disabled={creatingGlobalTask}
              >
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
