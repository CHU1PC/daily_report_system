"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import type { Task, TimeEntry } from "@/lib/types"
import { useAuth } from "@/lib/contexts/AuthContext"

export function useSupabase() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [useLocalStorage, setUseLocalStorage] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')

  const { user, isAdmin } = useAuth()
  const supabase = createClient()

  // Supabaseが利用可能かチェック
  const isSupabaseConfigured = () => {
    return !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'your_supabase_project_url'
    )
  }

  // タスクを取得
  const fetchTasks = async () => {
    // LocalStorage モード
    if (useLocalStorage) {
      const savedTasks = localStorage.getItem("tasks")
      if (savedTasks) {
        setTasks(JSON.parse(savedTasks))
      }
      setConnectionStatus('disconnected')
      return
    }

    // Supabase モード
    try {
      console.log('[fetchTasks] Current user ID:', user?.id)
      console.log('[fetchTasks] Current user email:', user?.email)

      // ユーザーの所属TeamのLinear Team IDを取得
      const { data: memberships, error: membershipsError } = await supabase
        .from('user_team_memberships')
        .select(`
          team:linear_teams(
            linear_team_id
          )
        `)
        .eq('user_id', user?.id)

      console.log('[fetchTasks] Memberships data:', JSON.stringify(memberships, null, 2))

      if (membershipsError) {
        console.error('Failed to fetch team memberships:', membershipsError)
      }

      const userTeamIds = (memberships || [])
        .map((m: any) => m.team?.linear_team_id)
        .filter((id: string | null) => id !== null)

      console.log('User team IDs for task filtering:', userTeamIds)

      // タスクを取得
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error

      // 管理者: 全タスクを取得（未アサインタスクを表示するため）
      // 一般ユーザー: 自分のemailとassignee_emailが一致するタスクのみ表示
      const filteredData = isAdmin
        ? (data || [])
        : (data || []).filter((task) => {
            // assignee_emailが設定されており、かつユーザーのemailと一致するタスクのみ表示
            return !!task.assignee_email && task.assignee_email === user?.email
          })

      console.log(`Filtered ${filteredData.length} tasks from ${data?.length || 0} total tasks (user email: ${user?.email}, isAdmin: ${isAdmin})`)

      const mappedTasks: Task[] = filteredData.map((task) => ({
        id: task.id,
        user_id: task.user_id,
        name: task.name,
        color: task.color,
        createdAt: task.created_at,
        linear_issue_id: task.linear_issue_id,
        linear_team_id: task.linear_team_id,
        linear_state_type: task.linear_state_type,
        linear_project_id: task.linear_project_id,
        description: task.description,
        assignee_email: task.assignee_email,
        assignee_name: task.assignee_name,
        linear_identifier: task.linear_identifier,
        linear_url: task.linear_url,
        priority: task.priority,
        linear_updated_at: task.linear_updated_at,
      }))

      setTasks(mappedTasks)
      setConnectionStatus('connected')
    } catch (err) {
      console.warn("Supabase not available, falling back to localStorage")
      setUseLocalStorage(true)
      setConnectionStatus('disconnected')
      const savedTasks = localStorage.getItem("tasks")
      if (savedTasks) {
        setTasks(JSON.parse(savedTasks))
      }
    }
  }

  // 時間エントリを取得
  const fetchTimeEntries = async () => {
    // LocalStorage モード
    if (useLocalStorage) {
      const savedEntries = localStorage.getItem("timeEntries")
      if (savedEntries) {
        setTimeEntries(JSON.parse(savedEntries))
      }
      return
    }

    // Supabase モード
    try {
      // 現在のユーザーのエントリのみ取得
      let query = supabase
        .from("time_entries")
        .select("*")
        .order("start_time", { ascending: false })

      // ユーザーIDでフィルタリング
      if (user?.id) {
        query = query.eq("user_id", user.id)
      }

      const { data, error } = await query

      if (error) throw error

      const mappedEntries: TimeEntry[] = (data || []).map((entry) => ({
        id: entry.id,
        user_id: entry.user_id,
        taskId: entry.task_id,
        startTime: entry.start_time,
        endTime: entry.end_time,
        comment: entry.comment || "",
        date: entry.date,
      }))

      setTimeEntries(mappedEntries)
    } catch (err) {
      console.warn("Supabase not available, falling back to localStorage")
      setUseLocalStorage(true)
      const savedEntries = localStorage.getItem("timeEntries")
      if (savedEntries) {
        setTimeEntries(JSON.parse(savedEntries))
      }
    }
  }

  // 初期データ読み込み
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)

      // Supabaseが設定されていない場合の警告
      if (!isSupabaseConfigured()) {
        console.warn('Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
        setUseLocalStorage(true)
        setConnectionStatus('disconnected')
      }

      // 常にSupabaseを試みる（設定されている場合）
      await Promise.all([fetchTasks(), fetchTimeEntries()])
      setLoading(false)
    }

    // userが存在する場合のみデータを読み込む
    if (user) {
      loadData()
    } else {
      // userがない場合はローディングを終了
      setLoading(false)
    }
  }, [user, isAdmin])

  // LocalStorageに保存
  useEffect(() => {
    if (useLocalStorage && tasks.length > 0) {
      localStorage.setItem("tasks", JSON.stringify(tasks))
    }
  }, [tasks, useLocalStorage])

  useEffect(() => {
    if (useLocalStorage && timeEntries.length > 0) {
      localStorage.setItem("timeEntries", JSON.stringify(timeEntries))
    }
  }, [timeEntries, useLocalStorage])

  // タスクを追加
  const addTask = async (task: Omit<Task, "id">) => {
    // LocalStorage モード
    if (useLocalStorage) {
      const { generateId } = await import("@/lib/utils")
      const newTask: Task = {
        id: generateId(),
        ...task,
      }
      setTasks((prev) => [newTask, ...prev])
      return newTask
    }

    // Supabase モード
    try {
      console.log("Attempting to add task to Supabase:", task)
      console.log("useLocalStorage flag:", useLocalStorage)
      console.log("Current user:", user?.id)

      const insertData: Record<string, unknown> = {
        name: task.name,
        color: task.color,
        created_at: task.createdAt,
      }

      // user_idカラムが存在する場合のみ追加
      if (user?.id) {
        insertData.user_id = user.id
      }

      // Linear Issue情報を追加
      if (task.linear_issue_id) {
        insertData.linear_issue_id = task.linear_issue_id
      }
      if (task.linear_team_id) {
        insertData.linear_team_id = task.linear_team_id
      }

      const { data, error } = await supabase
        .from("tasks")
        .insert([insertData])
        .select()
        .single()

      console.log("Supabase response data:", data)
      console.log("Supabase response error:", error)

      if (error) {
        console.error("Supabase error details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })

        // RLSポリシーのエラーの可能性をチェック
        if (error.code === '42501' || error.message?.includes('policy')) {
          console.error("⚠️ Row Level Security (RLS) policy error detected!")
          console.error("Please check your Supabase RLS policies for the 'tasks' table.")
          console.error("You may need to disable RLS or add appropriate policies.")
        }

        throw new Error(error.message || "Supabase insert failed")
      }

      if (!data) {
        console.error("⚠️ No data returned from Supabase, but no error either")
        console.error("This usually means:")
        console.error("1. RLS policies are blocking the insert")
        console.error("2. The table doesn't exist")
        console.error("3. Network/configuration issue")
        throw new Error("No data returned from Supabase insert - possibly RLS policy blocking")
      }

      const newTask: Task = {
        id: data.id,
        name: data.name,
        color: data.color,
        createdAt: data.created_at,
      }

      setTasks((prev) => [newTask, ...prev])
      return newTask
    } catch (err) {
      console.error("Error adding task:", err)
      if (err instanceof Error) {
        console.error("Error message:", err.message)
        console.error("Error stack:", err.stack)
      }
      throw err
    }
  }

  // タスクを更新
  const updateTask = async (id: string, updates: Partial<Task>) => {
    // LocalStorage モード
    if (useLocalStorage) {
      setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...updates } : task)))
      return
    }

    // Supabase モード
    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          name: updates.name,
          color: updates.color,
        })
        .eq("id", id)

      if (error) throw error

      setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...updates } : task)))
    } catch (err) {
      console.error("Error updating task:", err)
      throw err
    }
  }

  // タスクを削除
  const deleteTask = async (id: string) => {
    // LocalStorage モード
    if (useLocalStorage) {
      setTasks((prev) => prev.filter((task) => task.id !== id))
      return
    }

    // Supabase モード
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", id)

      if (error) throw error

      setTasks((prev) => prev.filter((task) => task.id !== id))
    } catch (err) {
      console.error("Error deleting task:", err)
      throw err
    }
  }

  // 時間エントリを追加
  const addTimeEntry = async (entry: Omit<TimeEntry, "id"> | TimeEntry) => {
    // LocalStorage モード
    if (useLocalStorage) {
      const { generateId } = await import("@/lib/utils")
      const newEntry: TimeEntry = {
        id: 'id' in entry ? entry.id : generateId(),
        ...entry,
      }
      setTimeEntries((prev) => [newEntry, ...prev])
      return newEntry
    }

    // Supabase モード
    try {
      // 認証されたユーザーを取得
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()

      console.log('[addTimeEntry] Current authenticated user:', currentUser?.id)
      console.log('[addTimeEntry] Auth error:', authError)

      if (authError || !currentUser) {
        console.error('[addTimeEntry] User not authenticated')
        throw new Error('User must be authenticated to create time entries')
      }

      const insertData: Record<string, unknown> = {
        task_id: entry.taskId,
        start_time: entry.startTime,
        end_time: entry.endTime,
        comment: entry.comment,
        date: entry.date,
        user_id: currentUser.id, // 認証されたユーザーIDを必ず設定
      }

      console.log('[addTimeEntry] Inserting time entry:', insertData)

      const { data, error } = await supabase
        .from("time_entries")
        .insert([insertData])
        .select()
        .single()

      console.log('[addTimeEntry] Insert result - data:', data, 'error:', error)

      if (error) throw error

      const newEntry: TimeEntry = {
        id: data.id,
        taskId: data.task_id,
        startTime: data.start_time,
        endTime: data.end_time,
        comment: data.comment || "",
        date: data.date,
      }

      console.log('[addTimeEntry] New entry created:', newEntry)
      console.log('[addTimeEntry] Entry saved with user_id:', data.user_id, '(auth user.id:', currentUser.id, ')')

      setTimeEntries((prev) => [newEntry, ...prev])
      return newEntry
    } catch (err) {
      console.error("Error adding time entry:", err)
      throw err
    }
  }

  // 時間エントリを更新
  const updateTimeEntry = async (id: string, updates: Partial<TimeEntry>) => {
    console.log('[updateTimeEntry] Called with id:', id, 'updates:', updates)
    console.log('[updateTimeEntry] useLocalStorage:', useLocalStorage)
    console.log('[updateTimeEntry] Current user:', user?.id)

    // LocalStorage モード
    if (useLocalStorage) {
      console.log('[updateTimeEntry] Using localStorage mode')
      setTimeEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)))
      return
    }

    // Supabase モード
    try {
      console.log('[updateTimeEntry] Using Supabase mode')
      console.log('[updateTimeEntry] Entry ID to update:', id)

      // 現在のユーザーIDを取得
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      console.log('[updateTimeEntry] Current user ID:', currentUser?.id)

      // 更新前にレコードが存在するか確認
      const { data: existingEntry, error: fetchError } = await supabase
        .from("time_entries")
        .select("*")
        .eq("id", id)
        .maybeSingle()

      console.log('[updateTimeEntry] Existing entry:', existingEntry)
      console.log('[updateTimeEntry] Fetch error:', fetchError)

      if (fetchError) {
        console.error('[updateTimeEntry] Failed to fetch existing entry:', fetchError)
        throw new Error(`Entry not found or access denied: ${fetchError.message}`)
      }

      if (!existingEntry) {
        // RLSポリシーで除外されている可能性があるため、詳細を調査
        console.error('[updateTimeEntry] Entry not found. Checking RLS policy...')

        // すべてのtime_entriesを取得して確認（デバッグ用）
        const { data: allEntries } = await supabase
          .from("time_entries")
          .select("id, user_id, created_at")
          .order('created_at', { ascending: false })
          .limit(5)

        console.log('[updateTimeEntry] Recent accessible entries:', allEntries)
        console.error('[updateTimeEntry] Entry not found - ID:', id, '| User:', currentUser?.id)

        throw new Error('Entry not found - possibly due to RLS policy or incorrect ID')
      }

      // 更新するフィールドのみを含むオブジェクトを作成
      const updateData: Record<string, unknown> = {}
      if (updates.taskId !== undefined) updateData.task_id = updates.taskId
      if (updates.startTime !== undefined) updateData.start_time = updates.startTime
      if (updates.endTime !== undefined) updateData.end_time = updates.endTime
      if (updates.comment !== undefined) updateData.comment = updates.comment
      if (updates.date !== undefined) updateData.date = updates.date

      console.log('[updateTimeEntry] Update data:', updateData)

      const { data, error } = await supabase
        .from("time_entries")
        .update(updateData)
        .eq("id", id)
        .select()

      console.log('[updateTimeEntry] Supabase response - data:', data, 'error:', error)

      if (error) throw error

      // データが返ってこなくても、エラーがなければ更新成功とみなす
      setTimeEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)))
      console.log('[updateTimeEntry] Local state updated successfully')

      // スプレッドシートにも更新を反映
      try {
        console.log('[updateTimeEntry] Updating spreadsheet for entry:', id)
        const response = await fetch('/api/spreadsheet/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ timeEntryId: id }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          console.error('[updateTimeEntry] Spreadsheet update failed with status:', response.status)
          console.error('[updateTimeEntry] Error details:', errorData)
          // スプレッドシート更新のエラーは致命的ではないので警告のみ
        } else {
          console.log('[updateTimeEntry] Spreadsheet updated successfully')
        }
      } catch (spreadsheetError) {
        console.error('[updateTimeEntry] Error updating spreadsheet:', spreadsheetError)
        // スプレッドシート更新のエラーは致命的ではないので処理を続行
      }
    } catch (err) {
      console.error("[updateTimeEntry] Error updating time entry:", err)
      throw err
    }
  }

  // 時間エントリを削除
  const deleteTimeEntry = async (id: string) => {
    // LocalStorage モード
    if (useLocalStorage) {
      setTimeEntries((prev) => prev.filter((entry) => entry.id !== id))
      return
    }

    // Supabase モード
    try {
      // 削除前に時間エントリーの開始時刻を取得（スプレッドシート削除用）
      const { data: entryToDelete, error: fetchError } = await supabase
        .from("time_entries")
        .select("start_time")
        .eq("id", id)
        .single()

      console.log('[deleteTimeEntry] Entry to delete:', entryToDelete)
      console.log('[deleteTimeEntry] Fetch error:', fetchError)

      const { error } = await supabase.from("time_entries").delete().eq("id", id)

      if (error) throw error

      setTimeEntries((prev) => prev.filter((entry) => entry.id !== id))

      // スプレッドシートからも削除
      if (entryToDelete?.start_time) {
        try {
          console.log('[deleteTimeEntry] Deleting from spreadsheet, entry:', id)
          const response = await fetch('/api/spreadsheet/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              timeEntryId: id,
              startTime: entryToDelete.start_time,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            console.error('[deleteTimeEntry] Spreadsheet delete failed:', errorData)
            // スプレッドシート削除のエラーは致命的ではないので警告のみ
          } else {
            console.log('[deleteTimeEntry] Spreadsheet deleted successfully')
          }
        } catch (spreadsheetError) {
          console.error('[deleteTimeEntry] Error deleting from spreadsheet:', spreadsheetError)
          // スプレッドシート削除のエラーは致命的ではないので処理を続行
        }
      }
    } catch (err) {
      console.error("Error deleting time entry:", err)
      throw err
    }
  }

  return {
    tasks,
    timeEntries,
    loading,
    error,
    connectionStatus,
    isLocalStorageMode: useLocalStorage,
    addTask,
    updateTask,
    deleteTask,
    addTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    setTasks,
    setTimeEntries,
  }
}
