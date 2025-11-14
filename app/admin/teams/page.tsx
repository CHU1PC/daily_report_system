'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MembersManager } from '@/components/members-manager'
import {
  Loader2, AlertCircle, Users,
  ArrowLeft, UserPlus, RefreshCw
} from 'lucide-react'

interface TeamMember {
  user_id: string
  email: string
  name?: string
  role: string
  approved?: boolean
}

interface TeamWithMembers {
  id: string
  linear_team_id: string
  name: string
  key: string
  description?: string
  icon?: string
  color?: string
  url: string
  members: TeamMember[]
  memberCount: number
  projectCount: number
}

export default function TeamsPage() {
  const { user, loading: authLoading, isAdmin } = useAuth()
  const router = useRouter()
  const [teams, setTeams] = useState<TeamWithMembers[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<TeamWithMembers | null>(null)
  const [showTeamMembersDialog, setShowTeamMembersDialog] = useState(false)

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login')
      } else if (!isAdmin) {
        router.push('/')
      } else {
        fetchTeams()
      }
    }
  }, [user, authLoading, isAdmin, router])

  const fetchTeams = async () => {
    console.log('Fetching teams...')
    setTeamsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/teams/members')
      if (!res.ok) {
        throw new Error('Team一覧の取得に失敗しました')
      }
      const data = await res.json()
      console.log('Teams fetched:', data.teams)
      setTeams(data.teams || [])
    } catch (err) {
      console.error('Fetch teams error:', err)
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setTeamsLoading(false)
    }
  }

  const handleSyncTeams = async () => {
    setSyncing(true)
    setError(null)

    try {
      console.log('Syncing teams from Linear...')
      const res = await fetch('/api/admin/teams/sync', {
        method: 'POST',
      })

      const data = await res.json()
      console.log('Sync response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.details || data.error || 'Team同期に失敗しました')
      }

      await fetchTeams()
    } catch (err) {
      console.error('Sync error:', err)
      setError(err instanceof Error ? err.message : 'Team同期に失敗しました')
    } finally {
      setSyncing(false)
    }
  }

  const handleManageTeamMembers = (team: TeamWithMembers) => {
    setSelectedTeam(team)
    setShowTeamMembersDialog(true)
  }

  const getMemberName = (member: TeamMember) => member.name || member.email

  if (authLoading || teamsLoading) {
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Team管理</h1>
            <p className="text-muted-foreground">LinearのTeamとメンバーを管理</p>
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

        {/* 同期ボタン */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            LinearからTeam情報を同期してメンバーを管理できます
          </div>
          <Button
            onClick={handleSyncTeams}
            disabled={syncing}
            variant="outline"
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                同期中...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Linearから同期
              </>
            )}
          </Button>
        </div>

        {/* Team一覧 */}
        <div className="space-y-4">
          {teams.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Teamがありません。「Linearから同期」ボタンをクリックしてTeam情報を取得してください。
              </CardContent>
            </Card>
          ) : (
            teams.map((team) => (
              <Card key={team.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">
                          {team.name}
                        </CardTitle>
                        <Badge variant="outline" className="font-mono">
                          {team.key}
                        </Badge>
                        {team.color && (
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: team.color }}
                          />
                        )}
                      </div>
                      {team.description && (
                        <CardDescription>{team.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        <Users className="w-3 h-3 mr-1" />
                        {team.memberCount}名
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">メンバー一覧:</div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleManageTeamMembers(team)}
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        メンバー編集
                      </Button>
                    </div>

                    {team.members.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center border-2 border-dashed rounded-lg">
                        メンバーが登録されていません
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {team.members.map((member) => (
                          <div
                            key={member.user_id}
                            className="flex items-center gap-2 p-2 border rounded-lg"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {getMemberName(member)}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {member.email}
                              </div>
                            </div>
                            <Badge
                              variant={member.role === 'admin' ? 'default' : 'secondary'}
                              className="flex-shrink-0"
                            >
                              {member.role === 'admin' ? '管理者' : 'ユーザー'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Teamのメンバー管理ダイアログ */}
      {selectedTeam && (
        <MembersManager
          entityId={selectedTeam.id}
          entityName={selectedTeam.name}
          entityType="team"
          currentMemberIds={selectedTeam.members.map(m => m.user_id)}
          open={showTeamMembersDialog}
          onOpenChange={setShowTeamMembersDialog}
          onSuccess={fetchTeams}
        />
      )}
    </div>
  )
}
