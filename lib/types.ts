export interface Task {
  id: string
  user_id?: string
  name: string
  color: string
  createdAt: string
  parentId?: string
  linear_issue_id?: string
  linear_team_id?: string
  linear_state_type?: string
  linear_project_id?: string
  description?: string
  assignee_email?: string
  assignee_name?: string
  linear_identifier?: string
  linear_url?: string
  priority?: number
  linear_updated_at?: string
}

export interface TimeEntry {
  id: string
  user_id?: string
  taskId: string
  startTime: string
  endTime?: string
  comment: string
  date: string
}
