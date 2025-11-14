'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface MembersManagerProps {
  entityId: string
  entityName: string
  entityType: 'project' | 'team'
  currentMemberIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface User {
  user_id: string
  email: string
  name?: string
  role: string
  approved: boolean
}

export function MembersManager({
  entityId,
  entityName,
  entityType,
  currentMemberIds,
  open,
  onOpenChange,
  onSuccess,
}: MembersManagerProps) {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(currentMemberIds)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entityTypeLabel = entityType === 'project' ? 'プロジェクト' : 'Team'
  const apiEndpoint = `/api/admin/${entityType === 'project' ? 'projects' : 'teams'}/${entityId}/members`

  useEffect(() => {
    if (open) {
      fetchUsers()
      setSelectedUserIds(currentMemberIds)
    }
  }, [open, currentMemberIds])

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        throw new Error('ユーザー一覧の取得に失敗しました')
      }
      const data = await res.json()
      // 承認済みユーザーのみ表示
      const approvedUsers = (data.users || []).filter((u: User) => u.approved)
      setUsers(approvedUsers)
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    )
  }

  const handleSelectAll = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([])
    } else {
      setSelectedUserIds(users.map((u) => u.user_id))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      console.log(`Saving ${entityType} members:`, { entityId, selectedUserIds })
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userIds: selectedUserIds }),
      })

      const data = await res.json()
      console.log('Save response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.error || 'メンバーの更新に失敗しました')
      }

      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      console.error('Save error:', err)
      setError(err instanceof Error ? err.message : 'メンバーの更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const getUserName = (user: User) => user.name || user.email

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {entityName} のメンバー管理
          </DialogTitle>
          <DialogDescription>
            {entityTypeLabel}に所属させるユーザーを選択してください
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b">
              <div className="text-sm text-muted-foreground">
                {selectedUserIds.length} / {users.length} 名選択中
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedUserIds.length === users.length ? 'すべて解除' : 'すべて選択'}
              </Button>
            </div>

            <div className="space-y-2">
              {users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  承認済みユーザーがいません
                </div>
              ) : (
                users.map((user) => (
                  <div
                    key={user.user_id}
                    className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-accent transition-colors"
                  >
                    <Checkbox
                      id={user.user_id}
                      checked={selectedUserIds.includes(user.user_id)}
                      onCheckedChange={() => handleToggleUser(user.user_id)}
                    />
                    <label
                      htmlFor={user.user_id}
                      className="flex-1 flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{getUserName(user)}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </div>
                      <Badge
                        variant={user.role === 'admin' ? 'default' : 'secondary'}
                      >
                        {user.role === 'admin' ? '管理者' : 'ユーザー'}
                      </Badge>
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
