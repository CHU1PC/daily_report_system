"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ExternalLink, Loader2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react"
import type { LinearIssue } from "@/lib/linear"

interface LinearIssueSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectIssues: (issues: LinearIssue[]) => void
}

export function LinearIssueSelector({ open, onOpenChange, onSelectIssues }: LinearIssueSelectorProps) {
  const [issues, setIssues] = useState<LinearIssue[]>([])
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      fetchIssues()
    } else {
      // ダイアログを閉じる時に選択をリセット
      setSelectedIssueIds(new Set())
      setExpandedTeams(new Set())
      setExpandedProjects(new Set())
      setError(null)
    }
  }, [open])

  // Team → Project → Issue の3階層でグループ化
  const groupedIssues = useMemo(() => {
    const teams = new Map<string, Map<string, LinearIssue[]>>()

    issues.forEach((issue) => {
      const teamName = issue.team?.name || '未分類'
      const projectName = issue.project?.name || '未分類'

      if (!teams.has(teamName)) {
        teams.set(teamName, new Map())
      }

      const projects = teams.get(teamName)!
      if (!projects.has(projectName)) {
        projects.set(projectName, [])
      }

      projects.get(projectName)!.push(issue)
    })

    // ステータスの優先順位を定義
    const stateOrder: Record<string, number> = {
      unstarted: 1, // 未終了
      started: 2, // 進行中
      canceled: 3, // キャンセル
      completed: 4, // 完了
    }

    // 各プロジェクト内のIssueをステータス順にソート
    teams.forEach((projects) => {
      projects.forEach((projectIssues) => {
        projectIssues.sort((a, b) => {
          const orderA = stateOrder[a.state.type] || 99
          const orderB = stateOrder[b.state.type] || 99
          return orderA - orderB
        })
      })
    })

    // Teamを未完了Issue数でソート
    return new Map([...teams.entries()].sort((a, b) => {
      const [, projectsA] = a
      const [, projectsB] = b

      let totalCountA = 0
      let totalCountB = 0

      projectsA.forEach((issues) => {
        totalCountA += issues.filter(
          issue => issue.state.type !== 'completed' && issue.state.type !== 'canceled'
        ).length
      })

      projectsB.forEach((issues) => {
        totalCountB += issues.filter(
          issue => issue.state.type !== 'completed' && issue.state.type !== 'canceled'
        ).length
      })

      return totalCountB - totalCountA
    }))
  }, [issues])

  const fetchIssues = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/linear/issues')

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Issueの取得に失敗しました')
      }

      const data = await response.json()
      setIssues(data.issues || [])
    } catch (err) {
      console.error('Error fetching Linear issues:', err)
      setError(err instanceof Error ? err.message : 'Issueの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const toggleIssueSelection = (issueId: string) => {
    const newSelection = new Set(selectedIssueIds)
    if (newSelection.has(issueId)) {
      newSelection.delete(issueId)
    } else {
      newSelection.add(issueId)
    }
    setSelectedIssueIds(newSelection)
  }

  const toggleTeam = (teamName: string) => {
    const newExpanded = new Set(expandedTeams)
    if (newExpanded.has(teamName)) {
      newExpanded.delete(teamName)
    } else {
      newExpanded.add(teamName)
    }
    setExpandedTeams(newExpanded)
  }

  const toggleProject = (teamName: string, projectName: string) => {
    const key = `${teamName}::${projectName}`
    const newExpanded = new Set(expandedProjects)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedProjects(newExpanded)
  }

  const toggleAllProjectIssues = (projectIssues: LinearIssue[]) => {
    const newSelection = new Set(selectedIssueIds)
    const projectIssueIds = projectIssues.map(issue => issue.id)
    const allSelected = projectIssueIds.every(id => newSelection.has(id))

    if (allSelected) {
      projectIssueIds.forEach(id => newSelection.delete(id))
    } else {
      projectIssueIds.forEach(id => newSelection.add(id))
    }
    setSelectedIssueIds(newSelection)
  }

  const handleConfirm = () => {
    const selectedIssues = issues.filter((issue) => selectedIssueIds.has(issue.id))
    onSelectIssues(selectedIssues)
    setSelectedIssueIds(new Set())
  }

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return 'text-red-500 bg-red-500/10 border-red-500/20'
      case 2:
        return 'text-orange-500 bg-orange-500/10 border-orange-500/20'
      case 3:
        return 'text-green-500 bg-green-500/10 border-green-500/20'
      case 4:
        return 'text-purple-500 bg-purple-500/10 border-purple-500/20'
      default:
        return 'text-gray-500 bg-gray-500/10 border-gray-500/20'
    }
  }

  const getStateColor = (stateType: string) => {
    switch (stateType) {
      case 'started':
        return 'text-blue-500 bg-blue-500/10 border-blue-500/20'
      case 'completed':
        return 'text-green-500 bg-green-500/10 border-green-500/20'
      case 'canceled':
        return 'text-gray-500 bg-gray-500/10 border-gray-500/20'
      default:
        return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">Linear Issueから追加</DialogTitle>
          <DialogDescription>
            Team → Project → Issue の階層でIssueを表示しています。タスクとして追加したいIssueを選択してください。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-sm text-muted-foreground">Issueを取得中...</span>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && !error && issues.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">Issueがありません</p>
              <p className="text-sm mt-2">
                LinearにIssueを作成するか、LINEAR_API_KEYが正しく設定されているか確認してください
              </p>
            </div>
          )}

          {!loading && !error && groupedIssues.size > 0 && (
            <div className="space-y-3">
              {Array.from(groupedIssues.entries()).map(([teamName, projects]) => {
                const isTeamExpanded = expandedTeams.has(teamName)

                // Team全体の統計を計算
                let teamTotalCount = 0
                let teamSelectedCount = 0
                projects.forEach((projectIssues) => {
                  projectIssues.forEach((issue) => {
                    if (issue.state.type !== 'completed' && issue.state.type !== 'canceled') {
                      teamTotalCount++
                    }
                    if (selectedIssueIds.has(issue.id)) {
                      teamSelectedCount++
                    }
                  })
                })

                return (
                  <div key={teamName} className="border border-border rounded-lg overflow-hidden">
                    {/* Teamヘッダー */}
                    <div className="bg-accent/50 p-4 border-b border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <button
                            onClick={() => toggleTeam(teamName)}
                            className="hover:bg-accent rounded p-1 transition-colors"
                          >
                            {isTeamExpanded ? (
                              <ChevronDown className="w-5 h-5" />
                            ) : (
                              <ChevronRight className="w-5 h-5" />
                            )}
                          </button>
                          <h2 className="text-xl font-bold">{teamName}</h2>
                          <span className="text-sm text-muted-foreground">
                            ({teamSelectedCount}/{teamTotalCount} 選択中)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Project一覧 */}
                    {isTeamExpanded && (
                      <div className="space-y-0">
                        {Array.from(projects.entries()).map(([projectName, projectIssues]) => {
                          const projectKey = `${teamName}::${projectName}`
                          const isProjectExpanded = expandedProjects.has(projectKey)
                          const selectedCount = projectIssues.filter(issue => selectedIssueIds.has(issue.id)).length
                          const totalCount = projectIssues.filter(
                            issue => issue.state.type !== 'completed' && issue.state.type !== 'canceled'
                          ).length

                          return (
                            <div key={projectKey} className="border-t border-border">
                              {/* Projectヘッダー */}
                              <div className="bg-accent/20 p-3 pl-12">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 flex-1">
                                    <button
                                      onClick={() => toggleProject(teamName, projectName)}
                                      className="hover:bg-accent rounded p-1 transition-colors"
                                    >
                                      {isProjectExpanded ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </button>
                                    <h3 className="text-base font-semibold">{projectName}</h3>
                                    <span className="text-sm text-muted-foreground">
                                      ({selectedCount}/{totalCount} 選択中)
                                    </span>
                                  </div>
                                  <Checkbox
                                    checked={selectedCount === totalCount && totalCount > 0}
                                    onCheckedChange={() => toggleAllProjectIssues(projectIssues)}
                                    className="mr-1"
                                  />
                                </div>
                              </div>

                              {/* Issue一覧 */}
                              {isProjectExpanded && (
                                <div className="divide-y divide-border">
                                  {projectIssues.map((issue) => (
                                    <div
                                      key={issue.id}
                                      className="flex items-start gap-3 p-4 pl-20 hover:bg-accent/50 transition-colors cursor-pointer"
                                      onClick={() => toggleIssueSelection(issue.id)}
                                    >
                                      <Checkbox
                                        checked={selectedIssueIds.has(issue.id)}
                                        onCheckedChange={() => toggleIssueSelection(issue.id)}
                                        className="mt-1"
                                      />

                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                          <span className="font-mono text-sm font-bold text-foreground">
                                            {issue.identifier}
                                          </span>
                                          <span
                                            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getPriorityColor(
                                              issue.priority
                                            )}`}
                                          >
                                            {issue.priorityLabel}
                                          </span>
                                          <span
                                            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getStateColor(
                                              issue.state.type
                                            )}`}
                                          >
                                            {issue.state.name}
                                          </span>
                                          {issue.assignee && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500">
                                              👤 {issue.assignee.name}
                                            </span>
                                          )}
                                        </div>

                                        <div className="font-medium text-sm mb-1">{issue.title}</div>

                                        {issue.description && (
                                          <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                            {issue.description}
                                          </div>
                                        )}

                                        <div className="flex items-center gap-3 mt-2">
                                          <a
                                            href={issue.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 font-medium"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                            Linearで開く
                                          </a>
                                          <span className="text-xs text-muted-foreground">
                                            更新: {new Date(issue.updatedAt).toLocaleDateString('ja-JP')}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!loading && !error && issues.length > 0 && (
          <div className="flex justify-between items-center pt-4 border-t border-border mt-4">
            <div className="text-sm font-medium text-muted-foreground">
              {selectedIssueIds.size > 0
                ? `${selectedIssueIds.size}件のIssueを選択中`
                : 'Issueを選択してください'}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button onClick={handleConfirm} disabled={selectedIssueIds.size === 0}>
                タスクとして追加 ({selectedIssueIds.size})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
