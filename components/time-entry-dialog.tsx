"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import type { Task, TimeEntry } from "@/lib/types"
import { useState, useEffect } from "react"
import { Trash2 } from "lucide-react"

interface TimeEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: TimeEntry | null
  tasks: Task[]
  onUpdate: (updates: Partial<TimeEntry>) => void
  onDelete: () => void
  onAdd: (entry: Omit<TimeEntry, "id">) => void
}

export function TimeEntryDialog({ open, onOpenChange, entry, tasks, onUpdate, onDelete, onAdd }: TimeEntryDialogProps) {
  const [comment, setComment] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [timeError, setTimeError] = useState("")

  useEffect(() => {
    if (entry) {
      setComment(entry.comment)
      const start = new Date(entry.startTime)
      // ローカルタイムゾーンの日付を取得
      const startYear = start.getFullYear()
      const startMonth = String(start.getMonth() + 1).padStart(2, '0')
      const startDay = String(start.getDate()).padStart(2, '0')
      setStartDate(`${startYear}-${startMonth}-${startDay}`)
      setStartTime(`${start.getHours().toString().padStart(2, "0")}:${start.getMinutes().toString().padStart(2, "0")}`)

      if (entry.endTime) {
        const end = new Date(entry.endTime)
        // ローカルタイムゾーンの日付を取得
        const endYear = end.getFullYear()
        const endMonth = String(end.getMonth() + 1).padStart(2, '0')
        const endDay = String(end.getDate()).padStart(2, '0')
        setEndDate(`${endYear}-${endMonth}-${endDay}`)
        setEndTime(`${end.getHours().toString().padStart(2, "0")}:${end.getMinutes().toString().padStart(2, "0")}`)
      }
      setTimeError("")
    }
  }, [entry])

  // 時刻バリデーション
  useEffect(() => {
    if (startDate && endDate && startTime && endTime) {
      const [startHour, startMinute] = startTime.split(":").map(Number)
      const [endHour, endMinute] = endTime.split(":").map(Number)

      const startDateTime = new Date(`${startDate}T00:00:00`)
      startDateTime.setHours(startHour, startMinute, 0, 0)

      const endDateTime = new Date(`${endDate}T00:00:00`)
      endDateTime.setHours(endHour, endMinute, 0, 0)

      const now = new Date()

      // 終了日時が現在時刻より未来の場合はエラー
      if (endDateTime > now) {
        setTimeError("終了日時は現在時刻より未来に設定できません")
      } else if (startDateTime > now) {
        setTimeError("開始日時は現在時刻より未来に設定できません")
      } else if (startDateTime >= endDateTime) {
        setTimeError("終了日時は開始日時より後に設定してください")
      } else {
        setTimeError("")
      }
    }
  }, [startDate, endDate, startTime, endTime])

  const handleSave = () => {
    if (!entry) return

    // エラーがある場合は保存しない
    if (timeError) {
      return
    }

    const [startHour, startMinute] = startTime.split(":").map(Number)
    const [endHour, endMinute] = endTime.split(":").map(Number)

    // 日付をまたぐ場合は、2つのエントリに分割
    if (startDate !== endDate) {
      // 元のエントリを削除
      onDelete()

      // 1つ目: 開始日の開始時刻から23:59:59まで
      const firstStart = new Date(`${startDate}T${startTime}:00`)
      const firstEnd = new Date(`${startDate}T23:59:59.999`)

      onAdd({
        taskId: entry.taskId,
        startTime: firstStart.toISOString(),
        endTime: firstEnd.toISOString(),
        comment,
        date: startDate,
      })

      // 2つ目: 終了日の0:00から終了時刻まで
      const secondStart = new Date(`${endDate}T00:00:00.000`)
      const secondEnd = new Date(`${endDate}T${endTime}:00`)

      onAdd({
        taskId: entry.taskId,
        startTime: secondStart.toISOString(),
        endTime: secondEnd.toISOString(),
        comment,
        date: endDate,
      })

      onOpenChange(false)
    } else {
      // 同じ日の場合は通常の更新
      const startDateTime = new Date(`${startDate}T${startTime}:00`)
      const endDateTime = new Date(`${endDate}T${endTime}:00`)

      const updates: Partial<TimeEntry> = {
        comment,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        date: startDate,
      }

      onUpdate(updates)
    }
  }

  if (!entry) return null

  const task = tasks.find((t) => t.id === entry.taskId)
  if (!task) return null

  const calculateDuration = () => {
    const start = new Date(entry.startTime)
    const end = entry.endTime ? new Date(entry.endTime) : new Date()
    const diffMs = end.getTime() - start.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}時間${minutes}分`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>時間記録の編集</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">タスク</label>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: task.color }} />
              <span className="font-medium">{task.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">開始日</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} autoFocus={false} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">終了日</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} autoFocus={false} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">開始時刻</label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} autoFocus={false} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">終了時刻</label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} autoFocus={false} />
            </div>
          </div>

          {timeError && (
            <div className="text-sm text-red-500 font-medium">
              {timeError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">合計時間: {calculateDuration()}</label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">コメント</label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            削除
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={!!timeError}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
