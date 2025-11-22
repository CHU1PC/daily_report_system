"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/contexts/AuthContext"
import { logger } from "@/lib/logger"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const { signInWithGoogle, user, isApproved, loading: authLoading } = useAuth()
  const router = useRouter()

  // 既にログイン済みの場合はリダイレクト
  useEffect(() => {
    if (!authLoading && user) {
      logger.log("📍 Login page - Already logged in, redirecting...", { user: user.email, isApproved })
      if (isApproved === true) {
        router.push("/")
      } else if (isApproved === false) {
        router.push("/pending-approval")
      }
      // isApproved === null の場合は承認状態の確認中なので待つ
    }
  }, [user, isApproved, authLoading, router])

  const handleGoogleSignIn = async () => {
    setError(null)
    setGoogleLoading(true)

    const { error } = await signInWithGoogle()

    if (error) {
      setError(error.message || "Googleログインに失敗しました")
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">DayLog</h1>
          <p className="mt-2 text-muted-foreground">Googleアカウントでログイン</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 sm:p-8 space-y-6">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {googleLoading ? "Google認証中..." : "Googleでログイン"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            初回ログイン時は管理者の承認が必要です
          </p>
        </div>
      </div>
    </div>
  )
}
