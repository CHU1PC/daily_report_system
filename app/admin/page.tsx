'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Loader2, AlertCircle, CheckCircle, Clock,
  ArrowLeft, Trash2, XCircle
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserTeamViewer } from '@/components/user-team-viewer'

interface User {
  user_id: string
  email: string
  name?: string
  role: string
  approved?: boolean
  created_at: string
}

export default function AdminPage() {
  const { user, loading: authLoading, isAdmin } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null)
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login')
      } else if (!isAdmin) {
        router.push('/')
      } else {
        fetchUsers()
      }
    }
  }, [user, authLoading, isAdmin, router])

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        throw new Error('ユーザー一覧の取得に失敗しました')
      }
      const data = await res.json()
      setUsers(data.users || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (userId: string, role: 'user' | 'admin' = 'user') => {
    setApprovingUserId(userId)
    setError(null)

    try {
      console.log('Approving user:', userId, 'as', role)
      const res = await fetch(`/api/admin/users/${userId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      })

      const data = await res.json()
      console.log('Approval response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.details || data.error || 'ユーザーの承認に失敗しました')
      }

      await fetchUsers()
    } catch (err) {
      console.error('Approval error:', err)
      setError(err instanceof Error ? err.message : 'ユーザーの承認に失敗しました')
    } finally {
      setApprovingUserId(null)
    }
  }

  const handleRevoke = async (userId: string) => {
    setRevokingUserId(userId)
    setError(null)

    try {
      console.log('Revoking user approval:', userId)
      const res = await fetch(`/api/admin/users/${userId}/revoke`, {
        method: 'POST',
      })

      const data = await res.json()
      console.log('Revoke response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.details || data.error || '承認の取り消しに失敗しました')
      }

      await fetchUsers()
    } catch (err) {
      console.error('Revoke error:', err)
      setError(err instanceof Error ? err.message : '承認の取り消しに失敗しました')
    } finally {
      setRevokingUserId(null)
    }
  }

  const handleDelete = async (userId: string) => {
    if (!confirm('本当にこのユーザーを削除しますか？この操作は取り消せません。')) {
      return
    }

    setDeletingUserId(userId)
    setError(null)

    try {
      console.log('Deleting user:', userId)
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: 'DELETE',
      })

      const data = await res.json()
      console.log('Delete response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.details || data.error || 'ユーザーの削除に失敗しました')
      }

      await fetchUsers()
    } catch (err) {
      console.error('Delete error:', err)
      setError(err instanceof Error ? err.message : 'ユーザーの削除に失敗しました')
    } finally {
      setDeletingUserId(null)
    }
  }

  const handleReject = async (userId: string) => {
    if (!confirm('このユーザーの認証を拒否しますか？')) {
      return
    }

    setRejectingUserId(userId)
    setError(null)

    try {
      console.log('Rejecting user:', userId)
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: 'DELETE',
      })

      const data = await res.json()
      console.log('Reject response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.details || data.error || '認証拒否に失敗しました')
      }

      await fetchUsers()
    } catch (err) {
      console.error('Reject error:', err)
      setError(err instanceof Error ? err.message : '認証拒否に失敗しました')
    } finally {
      setRejectingUserId(null)
    }
  }

  const getUserId = (user: User) => user.user_id || (user as any).id
  const getUserName = (user: User) => user.name || user.email

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">読み込み中...</div>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  const pendingUsers = users.filter((u) => !u.approved)
  const approvedUsers = users.filter((u) => u.approved)

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">管理者ダッシュボード</h1>
            <p className="text-muted-foreground">ユーザーの管理</p>
          </div>
          <Button variant="outline" onClick={() => router.push('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            ホームに戻る
          </Button>
        </div>

        {/* エラー表示 */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* タブ */}
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">
              承認待ちユーザー ({pendingUsers.length})
            </TabsTrigger>
            <TabsTrigger value="approved">
              承認済みユーザー ({approvedUsers.length})
            </TabsTrigger>
            <TabsTrigger value="user-teams">
              ユーザーTeam表示
            </TabsTrigger>
          </TabsList>

          {/* 承認待ちユーザー */}
          <TabsContent value="pending" className="space-y-4">
            {pendingUsers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  承認待ちのユーザーはいません
                </CardContent>
              </Card>
            ) : (
              pendingUsers.map((user) => (
                <Card key={getUserId(user)}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">
                          {getUserName(user)}
                        </CardTitle>
                        <CardDescription>{user.email}</CardDescription>
                      </div>
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                        <Clock className="w-3 h-3 mr-1" />
                        承認待ち
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          onClick={() => handleApprove(getUserId(user), 'user')}
                          disabled={approvingUserId === getUserId(user) || rejectingUserId === getUserId(user)}
                          variant="default"
                        >
                          {approvingUserId === getUserId(user) ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              承認中...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              ユーザーとして承認
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleApprove(getUserId(user), 'admin')}
                          disabled={approvingUserId === getUserId(user) || rejectingUserId === getUserId(user)}
                          variant="outline"
                        >
                          {approvingUserId === getUserId(user) ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              承認中...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              管理者として承認
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleReject(getUserId(user))}
                          disabled={rejectingUserId === getUserId(user) || approvingUserId === getUserId(user)}
                          variant="destructive"
                        >
                          {rejectingUserId === getUserId(user) ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              拒否中...
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 mr-2" />
                              認証拒否
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        登録日時: {new Date(user.created_at).toLocaleString('ja-JP')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* 承認済みユーザー */}
          <TabsContent value="approved" className="space-y-4">
            {approvedUsers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  承認済みのユーザーはいません
                </CardContent>
              </Card>
            ) : (
              approvedUsers.map((user) => (
                <Card key={getUserId(user)}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">
                          {getUserName(user)}
                        </CardTitle>
                        <CardDescription>{user.email}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={user.role === 'admin' ? 'default' : 'secondary'}
                        >
                          {user.role === 'admin' ? '管理者' : 'ユーザー'}
                        </Badge>
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          承認済み
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        登録日時: {new Date(user.created_at).toLocaleString('ja-JP')}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(getUserId(user))}
                          disabled={revokingUserId === getUserId(user) || deletingUserId === getUserId(user)}
                        >
                          {revokingUserId === getUserId(user) ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              取り消し中...
                            </>
                          ) : (
                            <>
                              承認を取り消す
                            </>
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(getUserId(user))}
                          disabled={deletingUserId === getUserId(user) || revokingUserId === getUserId(user)}
                        >
                          {deletingUserId === getUserId(user) ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              削除中...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 mr-2" />
                              ユーザーを削除
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ユーザーTeam表示 */}
          <TabsContent value="user-teams">
            <UserTeamViewer />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
