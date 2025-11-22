'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2, AlertCircle, ChevronDown, ChevronRight, Users, CheckSquare, Filter, Clock, CircleDot
} from 'lucide-react'

interface LinearIssue {
  id: string
  name: string
  linear_issue_id: string
  linear_identifier: string
  linear_state_type: string
  priority: number
  assignee_email?: string
  assignee_name?: string
  linear_url?: string
  description?: string
}

interface Team {
  id: string
  linear_team_id: string
  name: string
  key: string
  color?: string
  url?: string
  description?: string
  issues: LinearIssue[]
}

interface CurrentTask {
  task_id: string
  task_name: string
  task_color: string
  linear_identifier: string | null
  linear_state_type: string | null
  priority: number
  start_time: string
}

interface UserTeamData {
  user_id: string
  email: string
  name?: string
  role: string
  teams: Team[]
  currentTask: CurrentTask | null
}

export function UserTeamViewer() {
  const [users, setUsers] = useState<UserTeamData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [showUserSelector, setShowUserSelector] = useState(false)

  useEffect(() => {
    fetchUserTeams()
  }, [])

  const fetchUserTeams = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/users/teams')
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('[UserTeamViewer] API error:', res.status, errorData)
        throw new Error(errorData.details || errorData.error || 'ユーザーTeam情報の取得に失敗しました')
      }
      const data = await res.json()
      console.log('[UserTeamViewer] Fetched users data:', data.users)

      // 各ユーザーのTeamとIssueを詳細にログ出力
      data.users?.forEach((user: UserTeamData) => {
        console.log(`[UserTeamViewer] User: ${user.name || user.email}`)
        user.teams.forEach((team) => {
          console.log(`  Team: ${team.name} (linear_team_id: ${team.linear_team_id})`)
          console.log(`    Issues: ${team.issues.length}`)
        })
      })

      setUsers(data.users || [])
    } catch (err) {
      console.error('Fetch user teams error:', err)
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  const toggleTeam = (teamKey: string) => {
    setExpandedTeams((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(teamKey)) {
        newSet.delete(teamKey)
      } else {
        newSet.add(teamKey)
      }
      return newSet
    })
  }

  const getUserName = (user: UserTeamData) => user.name || user.email

  const formatDuration = (startTime: string) => {
    const start = new Date(startTime)
    const now = new Date()
    const diffMs = now.getTime() - start.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return hours > 0 ? `${hours}時間${mins}分` : `${mins}分`
  }

  const getPriorityInfo = (priority?: number) => {
    switch (priority) {
      case 1: return { label: '緊急', color: 'bg-red-500 text-white' }
      case 2: return { label: '高', color: 'bg-orange-500 text-white' }
      case 3: return { label: '中', color: 'bg-yellow-500 text-white' }
      case 4: return { label: '低', color: 'bg-blue-500 text-white' }
      default: return { label: 'なし', color: 'bg-gray-400 text-white' }
    }
  }

  const getStatusInfo = (stateType: string) => {
    if (stateType === 'completed') {
      return { label: 'completed', color: 'bg-green-600 text-white' }
    } else if (stateType === 'canceled') {
      return { label: 'canceled', color: 'bg-gray-600 text-white' }
    } else if (stateType === 'started') {
      return { label: 'started', color: 'bg-blue-600 text-white' }
    } else {
      return { label: 'unstarted', color: 'bg-blue-600 text-white' }
    }
  }

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  const selectAllUsers = () => {
    setSelectedUserIds(new Set(users.map(u => u.user_id)))
  }

  const clearAllUsers = () => {
    setSelectedUserIds(new Set())
  }

  // 表示するユーザーをフィルタリング
  const displayedUsers = selectedUserIds.size === 0
    ? users
    : users.filter(u => selectedUserIds.has(u.user_id))

  if (loading) {
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

      {/* ユーザー選択パネル */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              <CardTitle className="text-lg">ユーザー選択</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUserSelector(!showUserSelector)}
              >
                {showUserSelector ? '閉じる' : '選択'}
              </Button>
              {selectedUserIds.size > 0 && (
                <>
                  <Badge variant="secondary">
                    {selectedUserIds.size}人選択中
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllUsers}
                  >
                    クリア
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        {showUserSelector && (
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="text-sm text-muted-foreground">
                  表示するユーザーを選択してください（未選択の場合は全員表示）
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllUsers}
                >
                  全選択
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                {users.map((user) => (
                  <div
                    key={user.user_id}
                    className="flex items-center gap-2 p-2 border rounded-lg hover:bg-accent cursor-pointer"
                    onClick={() => toggleUserSelection(user.user_id)}
                  >
                    <Checkbox
                      checked={selectedUserIds.has(user.user_id)}
                      onCheckedChange={() => toggleUserSelection(user.user_id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {getUserName(user)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </div>
                    </div>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="flex-shrink-0">
                      {user.role === 'admin' ? '管理者' : 'ユーザー'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ユーザー一覧 */}
      <div className="space-y-4">
        {displayedUsers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {selectedUserIds.size > 0 ? '選択したユーザーが見つかりません' : 'ユーザーが見つかりません'}
            </CardContent>
          </Card>
        ) : (
          displayedUsers.map((user) => {
            const isUserExpanded = expandedUsers.has(user.user_id)

            return (
              <Card key={user.user_id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleUser(user.user_id)}
                        className="p-0 h-auto"
                      >
                        {isUserExpanded ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </Button>
                      <div className="space-y-1">
                        <CardTitle className="text-lg">
                          {getUserName(user)}
                        </CardTitle>
                        <CardDescription>{user.email}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role === 'admin' ? '管理者' : 'ユーザー'}
                      </Badge>
                      <Badge variant="outline">
                        <Users className="w-3 h-3 mr-1" />
                        {user.teams.length} Team
                      </Badge>
                    </div>
                  </div>

                  {/* 現在作業中のタスク表示 */}
                  {user.currentTask && (
                    <div className="mt-3 px-4 py-3 bg-green-50 dark:bg-green-950 border-l-4 border-green-600 rounded-r-lg">
                      <div className="flex items-start gap-3">
                        <CircleDot className="w-5 h-5 text-green-600 mt-0.5 animate-pulse" />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-green-900 dark:text-green-100">
                              作業中
                            </span>
                            {user.currentTask.linear_identifier && (
                              <Badge variant="secondary" className="text-xs font-mono">
                                {user.currentTask.linear_identifier}
                              </Badge>
                            )}
                            {user.currentTask.priority > 0 && (
                              <Badge className={`text-xs px-2 py-0.5 ${getPriorityInfo(user.currentTask.priority).color}`}>
                                {getPriorityInfo(user.currentTask.priority).label}
                              </Badge>
                            )}
                            {user.currentTask.linear_state_type && (
                              <Badge variant="outline" className="text-xs">
                                {user.currentTask.linear_state_type}
                              </Badge>
                            )}
                          </div>
                          <div
                            className="text-sm text-green-900 dark:text-green-100 font-medium truncate"
                            style={{
                              borderLeft: `3px solid ${user.currentTask.task_color}`,
                              paddingLeft: '8px'
                            }}
                          >
                            {user.currentTask.task_name}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300">
                            <Clock className="w-3 h-3" />
                            <span>{formatDuration(user.currentTask.start_time)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!user.currentTask && (
                    <div className="mt-3 px-4 py-2 bg-gray-50 dark:bg-gray-900 border-l-4 border-gray-400 rounded-r-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          作業中のタスクなし
                        </span>
                      </div>
                    </div>
                  )}
                </CardHeader>

                {isUserExpanded && (
                  <CardContent>
                    {user.teams.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center border-2 border-dashed rounded-lg">
                        Teamに所属していません
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {user.teams.map((team) => {
                          const teamKey = `${user.user_id}-${team.id}`
                          const isTeamExpanded = expandedTeams.has(teamKey)

                          return (
                            <div key={team.id} className="border rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleTeam(teamKey)}
                                    className="p-0 h-auto"
                                  >
                                    {isTeamExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </Button>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{team.name}</span>
                                    <Badge variant="outline" className="font-mono text-xs">
                                      {team.key}
                                    </Badge>
                                    {team.color && (
                                      <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: team.color }}
                                      />
                                    )}
                                  </div>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  <CheckSquare className="w-3 h-3 mr-1" />
                                  {team.issues.length} Issue
                                </Badge>
                              </div>

                              {isTeamExpanded && (
                                <div className="ml-6 mt-2 space-y-1">
                                  {team.issues.length === 0 ? (
                                    <div className="text-sm text-muted-foreground py-2 text-center border border-dashed rounded">
                                      Issueがありません
                                    </div>
                                  ) : (
                                    team.issues.map((issue) => {
                                      const priorityInfo = getPriorityInfo(issue.priority)
                                      const statusInfo = getStatusInfo(issue.linear_state_type)

                                      return (
                                        <div
                                          key={issue.id}
                                          className="flex flex-col gap-2 p-2 bg-background rounded text-sm hover:bg-accent transition-colors border"
                                        >
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant="secondary" className="text-xs font-mono">
                                              {issue.linear_identifier}
                                            </Badge>
                                            <span className="flex-1 truncate font-medium">
                                              {issue.name.replace(/^\[.*?\]\s*/, '')}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <Badge className={`text-xs ${statusInfo.color}`}>
                                              {statusInfo.label}
                                            </Badge>
                                            {issue.priority > 0 && (
                                              <Badge className={`text-xs ${priorityInfo.color}`}>
                                                {priorityInfo.label}
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
