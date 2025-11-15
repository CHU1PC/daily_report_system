"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import type { User, Session } from "@supabase/supabase-js"

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  isApproved: boolean | null
  role: string | null
  isAdmin: boolean
  userName: string | null
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  checkApprovalStatus: () => Promise<boolean>
  updateUserName: (name: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // localStorageから初期値を読み込む（SSR対応）
  const [isApproved, setIsApproved] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('isApproved')
      return stored ? stored === 'true' : null
    }
    return null
  })

  const [role, setRole] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userRole')
    }
    return null
  })

  const [userName, setUserName] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userName')
    }
    return null
  })

  const [initialCheckDone, setInitialCheckDone] = useState(false)
  const supabase = createClient()

  // 管理者かどうかを判定
  const isAdmin = role === 'admin'

  // ユーザーの承認状態を確認
  const checkApprovalStatus = async (userId?: string, userEmail?: string): Promise<boolean> => {
    console.log("🔍 checkApprovalStatus called with userId:", userId, "email:", userEmail)
    try {
      // パラメータでuserIdが渡されていればそれを使う、なければauth.getUser()を呼ぶ
      let currentUserId = userId
      let currentUserEmail = userEmail

      if (!currentUserId) {
        console.log("📡 No userId provided, calling supabase.auth.getUser()...")
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        console.log("📡 getUser response:", { user: user?.email, error: authError })

        if (authError) {
          console.error("❌ Auth error:", authError)
          setIsApproved(null)
          return false
        }

        if (!user) {
          console.log("❌ No user found, setting isApproved to null")
          setIsApproved(null)
          return false
        }

        currentUserId = user.id
        currentUserEmail = user.email
      }

      console.log("👤 Using user:", currentUserEmail, "ID:", currentUserId)
      console.log("📊 Querying user_approvals table for user_id:", currentUserId)

      const { data, error } = await supabase
        .from("user_approvals")
        .select("approved, role, name")
        .eq("user_id", currentUserId)
        .maybeSingle()

      console.log("📊 Query result - data:", data, "error:", error)

      if (error) {
        console.error("❌ Error checking approval status:", error)
        setIsApproved(false)
        setRole(null)
        setUserName(null)
        return false
      }

      // レコードが存在しない場合は未承認とみなす
      if (!data) {
        console.warn("⚠️ No approval record found for user:", currentUserEmail)
        setIsApproved(false)
        setRole(null)
        setUserName(null)
        return false
      }

      const approved = data.approved ?? false
      const userRole = data.role ?? 'user'
      const name = data.name || null
      console.log("✅ Approval status retrieved:", approved, "role:", userRole, "name:", name)
      console.log("📝 Setting isApproved state to:", approved, "and role to:", userRole)

      // localStorageにも保存して、ページ遷移時に値が保持されるようにする
      if (typeof window !== 'undefined') {
        localStorage.setItem('isApproved', String(approved))
        localStorage.setItem('userRole', userRole)
        if (name) {
          localStorage.setItem('userName', name)
        }
      }

      setIsApproved(approved)
      setRole(userRole)
      setUserName(name)
      return approved
    } catch (error) {
      console.error("💥 Error in checkApprovalStatus:", error)
      setIsApproved(false)
      return false
    }
  }

  useEffect(() => {
    let mounted = true

    // セッションを確認
    const checkSession = async () => {
      console.log("🔄 Checking session...")
      try {
        const { data: { session } } = await supabase.auth.getSession()
        console.log("📦 Session:", session?.user?.email, "ID:", session?.user?.id)

        if (!mounted) return

        setSession(session)
        setUser(session?.user ?? null)

        // セッションがある場合は承認状態も確認
        if (session?.user) {
          console.log("✅ User found, checking approval status...")
          await checkApprovalStatus(session.user.id, session.user.email)
        } else {
          console.log("❌ No user session found")
        }
      } catch (error) {
        console.error("💥 Error checking session:", error)
      } finally {
        if (mounted) {
          console.log("🏁 Setting loading to false and initialCheckDone to true")
          setLoading(false)
          setInitialCheckDone(true)
        }
      }
    }

    checkSession()

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔔 Auth state change:", event, session?.user?.email)

      if (!mounted) return

      // 初回チェック完了前はスキップ（checkSession()で処理済み）
      if (!initialCheckDone) {
        console.log("⏭️ Skipping auth state change (initial check not done)")
        return
      }

      // 初回チェック完了後は、TOKEN_REFRESHEDとINITIAL_SESSIONイベントはスキップ
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        console.log(`⏭️ Skipping approval check for ${event} (already checked)`)
        setSession(session)
        setUser(session?.user ?? null)
        return
      }

      // SIGNED_OUTイベントの場合は承認状態をクリア
      if (event === 'SIGNED_OUT') {
        console.log("👋 User signed out")
        setSession(null)
        setUser(null)
        setIsApproved(null)
        setRole(null)
        setUserName(null)

        // localStorageもクリア
        if (typeof window !== 'undefined') {
          localStorage.removeItem('isApproved')
          localStorage.removeItem('userRole')
          localStorage.removeItem('userName')
        }

        return
      }

      // SIGNED_INイベントの場合のみ承認状態を再確認
      // ただし、既に承認状態が取得済みの場合はリセットしない
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        console.log("✅ User session exists, checking approval...")
        // 承認状態を確認（この呼び出しは非同期だが、状態は内部で更新される）
        await checkApprovalStatus(session.user.id, session.user.email)
      } else {
        console.log("❌ No user in auth state change")
        // ユーザーがいない場合のみnullにリセット
        setIsApproved(null)
        setRole(null)
        setUserName(null)
      }

      console.log("🏁 Auth state change complete")
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { error }
      }

      // ログイン成功後、承認状態を確実に取得する
      if (data.user) {
        console.log("🔐 Sign in successful, checking approval status immediately...")
        await checkApprovalStatus(data.user.id, data.user.email)
      }

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signUp = async (email: string, password: string, name: string) => {
    try {
      // ユーザーを作成
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        return { error }
      }

      // user_approvalsテーブルにレコードを作成
      if (data.user) {
        const { error: insertError } = await supabase
          .from('user_approvals')
          .insert([
            {
              user_id: data.user.id,
              email: data.user.email,
              name: name,
              approved: false,
              role: 'user',
            }
          ])

        if (insertError) {
          console.error('Failed to create user approval record:', insertError)
          // user_approvalsテーブルへの挿入に失敗しても、認証自体は成功しているのでエラーは返さない
        }
      }

      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const signInWithGoogle = async () => {
    try {
      // リダイレクトURLを取得（ngrok環境に対応）
      const getRedirectUrl = () => {
        if (typeof window === 'undefined') return undefined

        // 環境変数から取得を試みる
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
        console.log('🔧 NEXT_PUBLIC_SITE_URL:', baseUrl)
        console.log('🌐 window.location.href:', window.location.href)

        if (baseUrl) {
          const redirectUrl = `${baseUrl}/auth/callback`
          console.log('✅ Using redirect URL from env:', redirectUrl)
          return redirectUrl
        }

        // window.location.hrefからホスト部分を取得（ngrokのURLを含む）
        const url = new URL(window.location.href)
        const redirectUrl = `${url.protocol}//${url.host}/auth/callback`
        console.log('⚠️ Using redirect URL from window.location:', redirectUrl)
        return redirectUrl
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl(),
        },
      })

      if (error) {
        console.error("Google sign in error:", error)
        return { error }
      }

      return { error: null }
    } catch (error) {
      console.error("Google sign in exception:", error)
      return { error: error as Error }
    }
  }

  const updateUserName = async (name: string) => {
    try {
      if (!user) {
        throw new Error("ユーザーがログインしていません")
      }

      const { error } = await supabase
        .from('user_approvals')
        .update({ name })
        .eq('user_id', user.id)

      if (error) {
        console.error('Failed to update user name:', error)
        throw new Error('名前の更新に失敗しました')
      }

      // 状態を更新
      setUserName(name)

      // localStorageも更新
      if (typeof window !== 'undefined') {
        localStorage.setItem('userName', name)
      }
    } catch (error) {
      console.error('Error updating user name:', error)
      throw error
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, isApproved, role, isAdmin, userName, signIn, signUp, signOut, signInWithGoogle, checkApprovalStatus, updateUserName }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
