"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Clock, Mail } from "lucide-react"

export default function PendingApprovalPage() {
  const { user, isApproved, loading, signOut, checkApprovalStatus } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login")
      } else if (isApproved === true) {
        // 承認済みの場合のみホームへリダイレクト
        router.push("/")
      }
      // isApproved === false または null の場合はこのページに留まる
    }
  }, [user, isApproved, loading, router])

  const handleCheckStatus = async () => {
    const approved = await checkApprovalStatus()
    if (approved) {
      router.push("/")
    }
  }

  const handleLogout = async () => {
    await signOut()
    router.push("/login")
  }

  // 認証の読み込み中、または承認状態確認中は待機画面を表示
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">認証確認中...</div>
          <div className="text-sm text-muted-foreground">お待ちください</div>
        </div>
      </div>
    )
  }

  // ユーザーがいない場合のみログインページへリダイレクト（useEffectで処理）
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">リダイレクト中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">承認待ち</h1>
          <p className="text-muted-foreground">
            アカウントは正常に作成されましたが、管理者による承認が必要です
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <h2 className="font-semibold mb-1">登録メールアドレス</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="font-semibold mb-3">次のステップ</h3>
            <ol className="text-sm text-muted-foreground space-y-3">
              <li className="flex gap-3">
                <span className="font-semibold text-foreground">1.</span>
                <span>管理者にアカウントを登録したことを知らせてください</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-foreground">2.</span>
                <span>管理者があなたのアカウントを承認しましたら、再度ログインしてください</span>
              </li>
            </ol>
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            <Button onClick={handleCheckStatus} className="w-full" variant="default">
              承認状態を確認
            </Button>
            <Button onClick={handleLogout} className="w-full" variant="outline">
              ログアウト
            </Button>
          </div>

          <div className="text-xs text-center text-muted-foreground">
            問題がある場合は、管理者にお問い合わせください
          </div>
        </div>
      </div>
    </div>
  )
}
