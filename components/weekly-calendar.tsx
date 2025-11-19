"use client"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Task, TimeEntry } from "@/lib/types"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { TimeEntryDialog } from "@/components/time-entry-dialog"
import { ManualTimeEntryDialog } from "@/components/manual-time-entry-dialog"

interface WeeklyCalendarProps {
  tasks: Task[]
  timeEntries: TimeEntry[]
  onUpdateEntry: (id: string, updates: Partial<TimeEntry>) => void
  onDeleteEntry: (id: string) => void
  onAddEntry: (entry: Omit<TimeEntry, "id">) => void
}

export function WeeklyCalendar({ tasks, timeEntries, onUpdateEntry, onDeleteEntry, onAddEntry }: WeeklyCalendarProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(now.getDate() + diff)
    monday.setHours(0, 0, 0, 0)
    return monday
  })

  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isManualEntryDialogOpen, setIsManualEntryDialogOpen] = useState(false)

  const weekDays = useMemo(() => {
    const days = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart)
      date.setDate(currentWeekStart.getDate() + i)
      days.push(date)
    }
    return days
  }, [currentWeekStart])

  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeekStart)
    newDate.setDate(newDate.getDate() - 7)
    setCurrentWeekStart(newDate)
  }

  const goToNextWeek = () => {
    const newDate = new Date(currentWeekStart)
    newDate.setDate(newDate.getDate() + 7)
    setCurrentWeekStart(newDate)
  }

  const getEntriesForDay = (date: Date) => {
    // ローカルタイムゾーンの日付文字列を取得
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    return timeEntries.filter((entry) => {
      const entryStart = new Date(entry.startTime)
      // ローカルタイムゾーンの日付を取得
      const entryStartYear = entryStart.getFullYear()
      const entryStartMonth = String(entryStart.getMonth() + 1).padStart(2, '0')
      const entryStartDay = String(entryStart.getDate()).padStart(2, '0')
      const entryStartDate = `${entryStartYear}-${entryStartMonth}-${entryStartDay}`

      // 開始日がこの日と一致する場合
      if (entryStartDate === dateStr) {
        return true
      }

      // 終了日がこの日と一致し、かつ開始日と異なる場合（日をまたぐタスク）
      if (entry.endTime) {
        const entryEnd = new Date(entry.endTime)
        // ローカルタイムゾーンの日付を取得
        const entryEndYear = entryEnd.getFullYear()
        const entryEndMonth = String(entryEnd.getMonth() + 1).padStart(2, '0')
        const entryEndDay = String(entryEnd.getDate()).padStart(2, '0')
        const entryEndDate = `${entryEndYear}-${entryEndMonth}-${entryEndDay}`

        if (entryEndDate === dateStr && entryStartDate !== entryEndDate) {
          return true
        }
      }

      return false
    })
  }

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr)
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`
  }

  const calculatePosition = (startTime: string, endTime?: string, displayDate?: Date) => {
    const start = new Date(startTime)
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const top = (startMinutes / 1440) * 100

    if (!endTime) {
      const now = new Date()
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      const duration = nowMinutes - startMinutes
      const height = (duration / 1440) * 100
      return { top: `${top}%`, height: `${Math.max(height, 2)}%` }
    }

    const end = new Date(endTime)

    // 開始日と終了日が異なる場合の処理
    const startDate = start.toISOString().split("T")[0]
    const endDate = end.toISOString().split("T")[0]

    if (displayDate && startDate !== endDate) {
      const displayDateStr = displayDate.toISOString().split("T")[0]

      // 表示している日が開始日の場合、開始時刻から24:00まで表示
      if (displayDateStr === startDate) {
        const duration = 1440 - startMinutes // 24:00までの時間
        const height = (duration / 1440) * 100
        return { top: `${top}%`, height: `${Math.max(height, 2)}%` }
      }

      // 表示している日が終了日の場合、0:00から終了時刻まで表示
      if (displayDateStr === endDate) {
        const endMinutes = end.getHours() * 60 + end.getMinutes()
        const height = (endMinutes / 1440) * 100
        return { top: '0%', height: `${Math.max(height, 2)}%` }
      }
    }

    // 同じ日の場合、通常通り計算
    const endMinutes = end.getHours() * 60 + end.getMinutes()
    const duration = endMinutes - startMinutes
    const height = (duration / 1440) * 100

    return { top: `${top}%`, height: `${Math.max(height, 2)}%` }
  }

  const handleEntryClick = (entry: TimeEntry) => {
    setSelectedEntry(entry)
    setIsDialogOpen(true)
  }

  const handleUpdateEntry = (updates: Partial<TimeEntry>) => {
    if (selectedEntry) {
      onUpdateEntry(selectedEntry.id, updates)
      setIsDialogOpen(false)
      setSelectedEntry(null)
    }
  }

  const handleDeleteEntry = () => {
    if (selectedEntry) {
      onDeleteEntry(selectedEntry.id)
      setIsDialogOpen(false)
      setSelectedEntry(null)
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="space-y-4">
      <Card className="p-2 sm:p-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={goToPreviousWeek} className="h-8 w-8 sm:h-10 sm:w-10">
            <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
          <div className="flex items-center gap-4">
            <h2 className="text-sm sm:text-lg font-semibold">
              {currentWeekStart.getFullYear()}年 {currentWeekStart.getMonth() + 1}月 {currentWeekStart.getDate()}日 -{" "}
              {weekDays[6].getMonth() + 1}月 {weekDays[6].getDate()}日
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsManualEntryDialogOpen(true)}
              className="h-6 px-2 text-xs opacity-30 hover:opacity-60 transition-opacity"
            >
              <Plus className="w-3 h-3 mr-1" />
              手動追加
            </Button>
          </div>
          <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-8 w-8 sm:h-10 sm:w-10">
            <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
        </div>
      </Card>

      <div className="border border-border rounded-lg bg-card overflow-x-auto">
        <div className="min-w-[800px] grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
          <div className="p-2 border-r border-border" />
          {weekDays.map((day, index) => (
            <div key={index} className="p-3 text-center border-r border-border last:border-r-0">
              <div className="text-xs text-muted-foreground mb-1">
                {["月", "火", "水", "木", "金", "土", "日"][index]}
              </div>
              <div className="text-sm font-medium">
                {day.getMonth() + 1}/{day.getDate()}
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-[800px] grid grid-cols-[60px_repeat(7,1fr)] relative">
          <div className="border-r border-border">
            {hours.map((hour) => (
              <div key={hour} className="h-[60px] border-b border-border p-2 text-xs text-muted-foreground">
                {hour.toString().padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {weekDays.map((day, dayIndex) => (
            <div key={dayIndex} className="relative border-r border-border last:border-r-0">
              {hours.map((hour) => (
                <div key={hour} className="h-[60px] border-b border-border" />
              ))}

              <div className="absolute inset-0 pointer-events-none">
                {getEntriesForDay(day).map((entry) => {
                  const task = tasks.find((t) => t.id === entry.taskId)
                  if (!task) return null

                  const position = calculatePosition(entry.startTime, entry.endTime, day)

                  return (
                    <div
                      key={entry.id}
                      className="absolute left-1 right-1 rounded-md px-2.5 py-2 cursor-pointer pointer-events-auto overflow-hidden hover:ring-2 hover:ring-white/50 transition-all shadow-sm"
                      style={{
                        backgroundColor: task.color,
                        top: position.top,
                        height: position.height,
                      }}
                      onClick={() => handleEntryClick(entry)}
                    >
                      <div className="font-semibold text-white text-sm leading-tight mb-1 truncate drop-shadow-sm">
                        {task.name}
                      </div>
                      <div className="text-white font-medium text-xs flex items-center gap-1 drop-shadow-sm">
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[11px]">
                          {formatTime(entry.startTime)}
                        </span>
                        <span>-</span>
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[11px]">
                          {entry.endTime ? formatTime(entry.endTime) : "進行中"}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <TimeEntryDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        entry={selectedEntry}
        tasks={tasks}
        onUpdate={handleUpdateEntry}
        onDelete={handleDeleteEntry}
        onAdd={onAddEntry}
      />

      <ManualTimeEntryDialog
        open={isManualEntryDialogOpen}
        onOpenChange={setIsManualEntryDialogOpen}
        tasks={tasks}
        onAdd={onAddEntry}
      />
    </div>
  )
}
