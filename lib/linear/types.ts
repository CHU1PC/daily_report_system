/**
 * Linear API Type Definitions
 */

export interface LinearTeam {
  id: string
  name: string
  key: string // チームキー（例: "ENG", "DES"）
  description?: string
  icon?: string
  color?: string
  url: string
  createdAt: string
  updatedAt: string
}

export interface LinearProject {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  state: string // "started" | "planned" | "completed" | "canceled" | "paused"
  startDate?: string
  targetDate?: string
  url: string
  createdAt: string
  updatedAt: string
  team?: {
    id: string
    name: string
    key: string
  }
}

export interface LinearIssue {
  id: string
  identifier: string // DEV-123 のような識別子
  title: string
  description?: string
  priority: number // 0: None, 1: Urgent, 2: High, 3: Medium, 4: Low
  priorityLabel: string
  state: {
    name: string
    type: string // "started" | "unstarted" | "completed" | "canceled"
  }
  project?: {
    name: string
  }
  team?: {
    id: string
    name: string
    key: string
  }
  assignee?: {
    name: string
    email: string
  }
  url: string
  createdAt: string
  updatedAt: string
}

export const PRIORITY_LABELS: Record<number, string> = {
  0: 'なし',
  1: '緊急',
  2: '高',
  3: '中',
  4: '低',
}
