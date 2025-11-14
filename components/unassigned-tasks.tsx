"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Task } from "@/lib/types"
import { AlertCircle, Users } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UnassignedTasksProps {
  tasks: Task[]
  onAssignTask?: (taskId: string, userId: string) => Promise<void>
}

export function UnassignedTasks({ tasks, onAssignTask }: UnassignedTasksProps) {
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)

  // assignee_emailが空のタスクのみをフィルタリング
  const unassignedTasks = useMemo(() => {
    console.log('[UnassignedTasks] Total tasks:', tasks.length)
    console.log('[UnassignedTasks] Tasks sample:', tasks.slice(0, 3).map(t => ({
      name: t.name,
      assignee_email: t.assignee_email,
      hasAssigneeEmail: !!t.assignee_email
    })))

    const filtered = tasks.filter(task => !task.assignee_email)
    console.log('[UnassignedTasks] Unassigned tasks count:', filtered.length)

    return filtered
  }, [tasks])

  // タスクをTeamごとにグループ化
  const groupedTasks = useMemo(() => {
    const grouped = new Map<string, Task[]>()

    unassignedTasks.forEach(task => {
      const teamKey = task.linear_identifier?.split('-')[0] || 'その他'
      const teamName = task.linear_team_id ? `Team: ${teamKey}` : 'その他'

      if (!grouped.has(teamName)) {
        grouped.set(teamName, [])
      }
      grouped.get(teamName)!.push(task)
    })

    return Array.from(grouped.entries()).map(([teamName, tasks]) => ({
      teamName,
      tasks: tasks.sort((a, b) => {
        // 優先度でソート
        const priorityA = a.priority ?? 999
        const priorityB = b.priority ?? 999
        return priorityA - priorityB
      })
    }))
  }, [unassignedTasks])

  const getPriorityBadge = (priority: number | null | undefined) => {
    if (!priority) return <Badge variant="outline">未設定</Badge>

    const priorityMap: Record<number, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
      1: { label: "緊急", variant: "destructive" },
      2: { label: "高", variant: "default" },
      3: { label: "中", variant: "secondary" },
      4: { label: "低", variant: "outline" },
    }

    const config = priorityMap[priority] || { label: "不明", variant: "outline" }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getStateBadge = (stateType: string | null | undefined) => {
    if (!stateType) return null

    const stateMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      backlog: { label: "バックログ", variant: "outline" },
      unstarted: { label: "未着手", variant: "secondary" },
      started: { label: "進行中", variant: "default" },
      completed: { label: "完了", variant: "outline" },
      canceled: { label: "キャンセル", variant: "outline" },
    }

    const config = stateMap[stateType] || { label: stateType, variant: "outline" }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  if (unassignedTasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            未アサインタスク
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              現在、未アサインのタスクはありません。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            未アサインタスク ({unassignedTasks.length}件)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              誰にもアサインされていないタスクの一覧です。必要に応じてメンバーにアサインしてください。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {groupedTasks.map(({ teamName, tasks }) => (
        <Card key={teamName}>
          <CardHeader>
            <CardTitle className="text-lg">{teamName}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{task.name}</h3>
                      {task.linear_identifier && (
                        <Badge variant="outline" className="font-mono text-xs">
                          {task.linear_identifier}
                        </Badge>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {getPriorityBadge(task.priority)}
                      {getStateBadge(task.linear_state_type)}
                      {task.linear_url && (
                        <a
                          href={task.linear_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Linearで開く →
                        </a>
                      )}
                    </div>
                  </div>

                  {onAssignTask && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={assigningTaskId === task.id}
                      onClick={() => {
                        // TODO: ユーザー選択ダイアログを開く
                        console.log('Assign task:', task.id)
                      }}
                    >
                      アサイン
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
