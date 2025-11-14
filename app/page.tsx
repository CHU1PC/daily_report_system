"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { TaskTimer } from "@/components/task-timer"
import { WeeklyCalendar } from "@/components/weekly-calendar"
import { TaskManagement } from "@/components/task-management"
import { TeamManagement } from "@/components/team-management"
import { UserTeamViewer } from "@/components/user-team-viewer"
import { UnassignedTasks } from "@/components/unassigned-tasks"
import { SettingsDialog } from "@/components/settings-dialog"
import { Button } from "@/components/ui/button"
import type { TimeEntry } from "@/lib/types"
import { useSupabase } from "@/lib/hooks/useSupabase"
import { useAuth } from "@/lib/contexts/AuthContext"
import { LogOut, Settings } from "lucide-react"

export default function HomePage() {
  const [view, setView] = useState<"calendar" | "tasks" | "teams" | "user-teams" | "unassigned">("calendar")
  const [showSettings, setShowSettings] = useState(false)
  const { user, loading: authLoading, isApproved, isAdmin, userName, signOut } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login")
      } else if (isApproved === false) {
        // 承認されていない場合は承認待ちページへ
        // null の場合は読み込み中なのでリダイレクトしない
        router.push("/pending-approval")
      }
    }
  }, [user, authLoading, isApproved, router])

  const {
    tasks,
    timeEntries,
    loading,
    error,
    connectionStatus,
    addTask,
    updateTask,
    deleteTask,
    addTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    setTasks,
  } = useSupabase()

  const handleLogout = async () => {
    await signOut()
    router.push("/login")
  }

  const handleAddEntry = async (entry: Omit<TimeEntry, "id">) => {
    try {
      await addTimeEntry(entry)
    } catch (err) {
      console.error("Failed to add entry:", err)
    }
  }

  const handleAddEntryWithId = async (entry: TimeEntry) => {
    console.log('[handleAddEntryWithId] Called with entry:', entry)
    try {
      const savedEntry = await addTimeEntry(entry)
      console.log('[handleAddEntryWithId] Successfully added entry, returned ID:', savedEntry?.id)
      return savedEntry
    } catch (err) {
      console.error("Failed to add entry:", err)
      throw err
    }
  }

  const handleUpdateEntry = async (id: string, updates: Partial<TimeEntry>) => {
    console.log('[handleUpdateEntry] Called with id:', id, 'updates:', updates)
    try {
      await updateTimeEntry(id, updates)
      console.log('[handleUpdateEntry] Successfully updated entry')
    } catch (err) {
      console.error("[handleUpdateEntry] Failed to update entry:", err)
      throw err // エラーを再スローして呼び出し元で捕捉できるようにする
    }
  }

  const handleDeleteEntry = async (id: string) => {
    try {
      await deleteTimeEntry(id)
    } catch (err) {
      console.error("Failed to delete entry:", err)
    }
  }

  // 認証チェックが完了するまで待機
  // authLoadingがfalseでも、ユーザーがいてisApprovedがnullの場合は承認状態の読み込み中
  if (authLoading || (user && isApproved === null)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">認証確認中...</div>
          <div className="text-sm text-muted-foreground">お待ちください</div>
        </div>
      </div>
    )
  }

  // ユーザーが存在するが承認されていない場合は、リダイレクトする前に一瞬だけ待つ
  if (user && isApproved === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">リダイレクト中...</div>
          <div className="text-sm text-muted-foreground">承認待ちページへ移動します</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">読み込み中...</div>
          <div className="text-sm text-muted-foreground">データを取得しています</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2 text-destructive">エラーが発生しました</div>
          <div className="text-sm text-muted-foreground">{error}</div>
          <div className="mt-4 text-xs text-muted-foreground">
            環境変数が正しく設定されているか確認してください
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 bg-card/50 backdrop-blur-sm border-b border-border">
        <TaskTimer tasks={tasks} onAddEntry={handleAddEntryWithId} onUpdateEntry={handleUpdateEntry} timeEntries={timeEntries} isHeaderMode={true} />

        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 border-t border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 sm:gap-2">
              <Button variant={view === "calendar" ? "default" : "ghost"} onClick={() => setView("calendar")} size="sm" className="text-xs sm:text-sm px-2 sm:px-3">
                カレンダー
              </Button>
              <Button variant={view === "tasks" ? "default" : "ghost"} onClick={() => setView("tasks")} size="sm" className="text-xs sm:text-sm px-2 sm:px-3">
                タスク管理
              </Button>
              {isAdmin && (
                <>
                  <Button variant={view === "unassigned" ? "default" : "ghost"} onClick={() => setView("unassigned")} size="sm" className="text-xs sm:text-sm px-2 sm:px-3">
                    未アサインタスク
                  </Button>
                  <Button variant={view === "teams" ? "default" : "ghost"} onClick={() => setView("teams")} size="sm" className="text-xs sm:text-sm px-2 sm:px-3">
                    Team管理
                  </Button>
                  <Button variant={view === "user-teams" ? "default" : "ghost"} onClick={() => setView("user-teams")} size="sm" className="text-xs sm:text-sm px-2 sm:px-3">
                    ユーザーTeam表示
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* ユーザー名表示 */}
              {userName && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted border border-border">
                  <span className="text-xs font-medium text-foreground">{userName}</span>
                </div>
              )}

              {/* 管理者バッジ */}
              {isAdmin && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs font-semibold text-blue-500">管理者</span>
                </div>
              )}

              {/* 接続状態インジケーター */}
              <div className="flex items-center gap-1.5 text-xs">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                  connectionStatus === 'disconnected' ? 'bg-yellow-500' :
                  'bg-gray-400 animate-pulse'
                }`} />
                <span className="hidden sm:inline text-muted-foreground">
                  {connectionStatus === 'connected' ? 'Supabase接続済' :
                   connectionStatus === 'disconnected' ? 'ローカルモード' :
                   '接続確認中...'}
                </span>
              </div>
              {isAdmin && (
                <Button variant="outline" onClick={() => router.push('/admin')} size="sm" className="text-xs sm:text-sm px-2 sm:px-3">
                  管理画面
                </Button>
              )}
              <Button variant="ghost" onClick={() => setShowSettings(true)} size="sm" className="text-xs sm:text-sm px-2 sm:px-3" title="設定">
                <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline ml-1">設定</span>
              </Button>
              <Button variant="ghost" onClick={handleLogout} size="sm" className="text-xs sm:text-sm px-2 sm:px-3" title="ログアウト">
                <LogOut className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline ml-1">ログアウト</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {view === "calendar" && (
          <WeeklyCalendar
            tasks={tasks}
            timeEntries={timeEntries}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onAddEntry={handleAddEntry}
          />
        )}
        {view === "tasks" && (
          <TaskManagement
            tasks={tasks}
            timeEntries={timeEntries}
            onTasksChange={setTasks}
            onAddTask={addTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
          />
        )}
        {view === "unassigned" && isAdmin && (
          <UnassignedTasks tasks={tasks} />
        )}
        {view === "teams" && isAdmin && (
          <TeamManagement />
        )}
        {view === "user-teams" && isAdmin && (
          <UserTeamViewer />
        )}
      </main>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  )
}
