'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2, AlertCircle, Users,
  RefreshCw, ExternalLink
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

interface TeamMember {
  user_id: string
  email: string
  name?: string
  role: string
  issues: LinearIssue[]
  priorityScore: number
}

interface TeamWithIssues {
  id: string
  linear_team_id: string
  name: string
  key: string
  description?: string
  icon?: string
  color?: string
  url: string
  members: TeamMember[]
  issues: LinearIssue[]
}

const PRIORITY_LABELS: Record<number, string> = {
  0: 'なし',
  1: '緊急',
  2: '高',
  3: '中',
  4: '低',
}

const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-gray-400 text-white',
  1: 'bg-red-500 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-white',
  4: 'bg-blue-500 text-white',
}

const STATUS_LABELS: Record<string, string> = {
  'unstarted': 'unstarted',
  'started': 'started',
  'completed': 'completed',
  'canceled': 'canceled',
}

const STATUS_COLORS: Record<string, string> = {
  'unstarted': 'bg-blue-600 text-white',
  'started': 'bg-blue-600 text-white',
  'completed': 'bg-green-600 text-white',
  'canceled': 'bg-gray-600 text-white',
}

export function TeamManagement() {
  const [teams, setTeams] = useState<TeamWithIssues[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTeams()
  }, [])

  const fetchTeams = async () => {
    console.log('Fetching teams with issues...')
    setTeamsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/teams/issues')
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

  const getMemberName = (member: TeamMember) => member.name || member.email

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
          LinearからTeam情報とIssueを同期できます
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
          <Accordion type="multiple" className="space-y-4">
            {teams.map((team) => (
              <AccordionItem
                key={team.id}
                value={team.id}
                className="border rounded-lg px-0"
              >
                <Card className="border-0">
                  <AccordionTrigger className="hover:no-underline px-6 py-0">
                    <CardHeader className="w-full">
                      <div className="flex items-center justify-between w-full">
                        <div className="space-y-1 flex-1 text-left">
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
                            {team.members.length}名
                          </Badge>
                          <Badge variant="outline">
                            {team.issues.length}件のIssue
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </AccordionTrigger>

                  <AccordionContent>
                    <CardContent className="pt-4">
                      {team.members.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-8 text-center border-2 border-dashed rounded-lg">
                          このTeamにアサインされているIssueを持つメンバーがいません
                        </div>
                      ) : (
                        <Accordion type="multiple" className="space-y-3">
                          {team.members.map((member) => (
                            <AccordionItem
                              key={member.user_id}
                              value={member.user_id}
                              className="border rounded-lg"
                            >
                              <AccordionTrigger className="hover:no-underline px-4 py-3">
                                <div className="flex items-center justify-between w-full pr-4">
                                  <div className="flex items-center gap-3">
                                    <div className="text-left">
                                      <div className="font-medium">
                                        {getMemberName(member)}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        {member.email}
                                      </div>
                                    </div>
                                    <Badge
                                      variant={member.role === 'admin' ? 'default' : 'secondary'}
                                    >
                                      {member.role === 'admin' ? '管理者' : 'ユーザー'}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">
                                      {member.issues.length}件のIssue
                                    </Badge>
                                    <div className="text-sm text-muted-foreground">
                                      優先度スコア: {member.priorityScore}
                                    </div>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="px-4 pb-3">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="w-[120px]">Issue ID</TableHead>
                                        <TableHead>タイトル</TableHead>
                                        <TableHead className="w-[100px]">優先度</TableHead>
                                        <TableHead className="w-[100px]">ステータス</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {member.issues.map((issue) => (
                                        <TableRow key={issue.id}>
                                          <TableCell className="font-mono text-sm">
                                            {issue.linear_identifier}
                                          </TableCell>
                                          <TableCell>
                                            <div className="max-w-md">
                                              <div className="font-medium truncate">
                                                {issue.name.replace(/^\[.*?\]\s*/, '')}
                                              </div>
                                              {issue.description && (
                                                <div className="text-xs text-muted-foreground truncate mt-1">
                                                  {issue.description}
                                                </div>
                                              )}
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            <Badge
                                              className={PRIORITY_COLORS[issue.priority || 0]}
                                            >
                                              {PRIORITY_LABELS[issue.priority || 0]}
                                            </Badge>
                                          </TableCell>
                                          <TableCell>
                                            <Badge
                                              className={STATUS_COLORS[issue.linear_state_type] || STATUS_COLORS.unstarted}
                                            >
                                              {STATUS_LABELS[issue.linear_state_type] || issue.linear_state_type}
                                            </Badge>
                                          </TableCell>
                                          <TableCell>
                                            {issue.linear_url && (
                                              <a
                                                href={issue.linear_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-muted-foreground hover:text-foreground"
                                              >
                                                <ExternalLink className="w-4 h-4" />
                                              </a>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      )}
                    </CardContent>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  )
}
