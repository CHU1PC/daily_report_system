'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { MembersManager } from '@/components/members-manager'
import {
  Loader2, AlertCircle, Users,
  UserPlus, RefreshCw, Filter
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

export function TeamManagement() {
  const [teams, setTeams] = useState<TeamWithMembers[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<TeamWithMembers | null>(null)
  const [showTeamMembersDialog, setShowTeamMembersDialog] = useState(false)
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [showTeamSelector, setShowTeamSelector] = useState(false)

  useEffect(() => {
    fetchTeams()
  }, [])

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

  const toggleTeamSelection = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(teamId)) {
        newSet.delete(teamId)
      } else {
        newSet.add(teamId)
      }
      return newSet
    })
  }

  const selectAllTeams = () => {
    setSelectedTeamIds(new Set(teams.map(t => t.id)))
  }

  const clearAllTeams = () => {
    setSelectedTeamIds(new Set())
  }

  // 表示するTeamをフィルタリング
  const displayedTeams = selectedTeamIds.size === 0
    ? teams
    : teams.filter(t => selectedTeamIds.has(t.id))

  if (teamsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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

      {/* Team選択パネル */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              <CardTitle className="text-lg">Team選択</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTeamSelector(!showTeamSelector)}
              >
                {showTeamSelector ? '閉じる' : '選択'}
              </Button>
              {selectedTeamIds.size > 0 && (
                <>
                  <Badge variant="secondary">
                    {selectedTeamIds.size}Team選択中
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllTeams}
                  >
                    クリア
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        {showTeamSelector && (
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="text-sm text-muted-foreground">
                  表示するTeamを選択してください（未選択の場合は全て表示）
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllTeams}
                >
                  全選択
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center gap-2 p-2 border rounded-lg hover:bg-accent cursor-pointer"
                    onClick={() => toggleTeamSelection(team.id)}
                  >
                    <Checkbox
                      checked={selectedTeamIds.has(team.id)}
                      onCheckedChange={() => toggleTeamSelection(team.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {team.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate font-mono">
                        {team.key}
                      </div>
                    </div>
                    {team.color && (
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: team.color }}
                      />
                    )}
                    <Badge variant="outline" className="flex-shrink-0">
                      <Users className="w-3 h-3 mr-1" />
                      {team.memberCount}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Team一覧 */}
      <div className="space-y-4">
        {displayedTeams.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {selectedTeamIds.size > 0 ? '選択したTeamが見つかりません' : 'Teamがありません。「Linearから同期」ボタンをクリックしてTeam情報を取得してください。'}
            </CardContent>
          </Card>
        ) : (
          displayedTeams.map((team) => (
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
