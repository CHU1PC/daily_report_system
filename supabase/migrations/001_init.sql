-- ============================================================================
-- セクション1: 関数定義
-- ============================================================================

-- updated_atを自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- tasksテーブルにIssueが追加・更新されたときに、
-- 自動的にlinear_projectsのlinear_team_idを更新するトリガー関数
CREATE OR REPLACE FUNCTION auto_update_project_team()
RETURNS TRIGGER AS $$
BEGIN
  -- 新しいtaskがlinear_project_idとlinear_team_idを持っている場合
  IF NEW.linear_project_id IS NOT NULL AND NEW.linear_team_id IS NOT NULL THEN
    -- linear_projectsテーブルを更新
    -- 既存のlinear_team_idがNULLの場合、または異なる場合のみ更新
    UPDATE linear_projects
    SET linear_team_id = NEW.linear_team_id
    WHERE linear_project_id = NEW.linear_project_id
      AND (linear_team_id IS NULL OR linear_team_id != NEW.linear_team_id);

    -- プロジェクトがlinear_projectsテーブルに存在しない場合は何もしない
    -- （Linearから同期される必要があります）
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_update_project_team() IS 'tasksが追加・更新されたときに、linear_projectsのlinear_team_idを自動的に更新';

-- ============================================================================
-- セクション2: テーブル作成
-- ============================================================================

-- Linearプロジェクト情報を保存するテーブル
CREATE TABLE IF NOT EXISTS public.linear_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linear_project_id TEXT UNIQUE NOT NULL, -- LinearのプロジェクトID
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- プロジェクトアイコン
  color TEXT, -- プロジェクトカラー
  state TEXT, -- プロジェクトの状態（active, archived, etc.）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.linear_projects IS 'Linearから取得したプロジェクト情報 - 2025-11-14 全プロジェクトのチーム割り当てを実際のIssue所属に基づいて自動修正';
COMMENT ON COLUMN public.linear_projects.linear_project_id IS 'LinearのプロジェクトID（一意）';

-- Linear Team情報を保存するテーブル
CREATE TABLE IF NOT EXISTS public.linear_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linear_team_id TEXT UNIQUE NOT NULL, -- LinearのTeam ID
  name TEXT NOT NULL,
  key TEXT NOT NULL, -- チームキー（例: "ENG", "DES"）
  description TEXT,
  icon TEXT,
  color TEXT,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.linear_teams IS 'Linearから取得したTeam情報';
COMMENT ON COLUMN public.linear_teams.linear_team_id IS 'LinearのTeam ID（一意）';
COMMENT ON COLUMN public.linear_teams.key IS 'チームキー（例: "ENG", "DES"）';

-- ユーザーとプロジェクトの所属関係を管理するテーブル（多対多）
CREATE TABLE IF NOT EXISTS public.user_project_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_approvals(user_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.linear_projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, project_id) -- 同じユーザー×プロジェクトの組み合わせは1つだけ
);

COMMENT ON TABLE public.user_project_memberships IS 'ユーザーとLinearプロジェクトの所属関係（多対多）';
COMMENT ON COLUMN public.user_project_memberships.user_id IS '所属するユーザー';
COMMENT ON COLUMN public.user_project_memberships.project_id IS '所属するプロジェクト';

-- ユーザーとTeamの所属関係を管理するテーブル（多対多）
CREATE TABLE IF NOT EXISTS public.user_team_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_approvals(user_id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.linear_teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, team_id) -- 同じユーザー×チームの組み合わせは1つだけ
);

COMMENT ON TABLE public.user_team_memberships IS 'ユーザーとLinear Teamの所属関係（多対多）';
COMMENT ON COLUMN public.user_team_memberships.user_id IS '所属するユーザー';
COMMENT ON COLUMN public.user_team_memberships.team_id IS '所属するTeam';

-- ============================================================================
-- セクション3: カラム追加・変更
-- ============================================================================

-- user_approvalsテーブルにnameカラムを追加
ALTER TABLE public.user_approvals
ADD COLUMN IF NOT EXISTS name TEXT;

COMMENT ON COLUMN public.user_approvals.name IS 'ユーザーの表示名';

-- linear_projectsテーブルにteam_id（UUID）を追加
ALTER TABLE public.linear_projects
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.linear_teams(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.linear_projects.team_id IS '所属するTeam';

-- linear_projectsテーブルにlinear_team_id（TEXT）を追加
ALTER TABLE public.linear_projects
ADD COLUMN IF NOT EXISTS linear_team_id TEXT;

COMMENT ON COLUMN public.linear_projects.linear_team_id IS '所属するTeamのLinear ID（TEXT）';

-- user_team_membershipsテーブルにroleカラムを追加
ALTER TABLE public.user_team_memberships
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

COMMENT ON COLUMN public.user_team_memberships.role IS 'チーム内での役割（member, admin等）';

-- tasksテーブルにLinear Issue関連のカラムを追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linear_issue_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linear_team_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linear_state_type TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linear_project_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_email TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linear_identifier TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linear_url TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linear_updated_at TIMESTAMPTZ;

-- tasksテーブルのコメント
COMMENT ON COLUMN tasks.linear_state_type IS 'Linear IssueのStateタイプ（completed, started, canceled等）- linear_stateは削除済み';
COMMENT ON COLUMN tasks.linear_project_id IS 'Linear ProjectのID';
COMMENT ON COLUMN tasks.description IS 'Issueの説明文';
COMMENT ON COLUMN tasks.assignee_email IS 'Issueにアサインされた人のメールアドレス';
COMMENT ON COLUMN tasks.assignee_name IS 'Issueにアサインされた人の名前';
COMMENT ON COLUMN tasks.linear_identifier IS 'Issue番号（例: TEAM-123）';
COMMENT ON COLUMN tasks.linear_url IS 'LinearのIssue URL';
COMMENT ON COLUMN tasks.priority IS '優先度（0: なし, 1: 緊急, 2: 高, 3: 中, 4: 低）';
COMMENT ON COLUMN tasks.linear_updated_at IS 'Linear上での最終更新日時';

-- time_entriesテーブルのend_timeカラムをNULL許容に変更
ALTER TABLE time_entries ALTER COLUMN end_time DROP NOT NULL;

COMMENT ON COLUMN time_entries.end_time IS 'タスク終了時刻（進行中の場合はNULL）';

-- ============================================================================
-- セクション4: インデックスと制約
-- ============================================================================

-- linear_projectsのインデックス
CREATE INDEX IF NOT EXISTS idx_linear_projects_linear_id ON public.linear_projects(linear_project_id);
CREATE INDEX IF NOT EXISTS idx_linear_projects_team ON public.linear_projects(team_id);
CREATE INDEX IF NOT EXISTS idx_linear_projects_linear_team_id ON linear_projects(linear_team_id);

-- linear_teamsのインデックス
CREATE INDEX IF NOT EXISTS idx_linear_teams_linear_id ON public.linear_teams(linear_team_id);

-- user_project_membershipsのインデックス
CREATE INDEX IF NOT EXISTS idx_user_project_memberships_user ON public.user_project_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_project_memberships_project ON public.user_project_memberships(project_id);

-- user_team_membershipsのインデックス
CREATE INDEX IF NOT EXISTS idx_user_team_memberships_user ON public.user_team_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_team_memberships_team ON public.user_team_memberships(team_id);

-- tasksのインデックス
CREATE INDEX IF NOT EXISTS idx_tasks_linear_team_id ON tasks(linear_team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_linear_issue_id ON tasks(linear_issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_linear_identifier ON tasks(linear_identifier);
CREATE INDEX IF NOT EXISTS idx_tasks_linear_state_type ON tasks(linear_state_type);
CREATE INDEX IF NOT EXISTS idx_tasks_linear_project_id ON tasks(linear_project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_email ON tasks(assignee_email);

-- tasksのUNIQUE制約（linear_issue_idは一意、NULL値は除外）
ALTER TABLE tasks ADD CONSTRAINT IF NOT EXISTS unique_linear_issue_id UNIQUE (linear_issue_id);

COMMENT ON CONSTRAINT unique_linear_issue_id ON tasks IS 'Linear IssueごとにTaskは1つのみ（NULL値は除外）';

-- ============================================================================
-- セクション5: RLS (Row Level Security) 有効化
-- ============================================================================

ALTER TABLE public.linear_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linear_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- セクション6: RLSポリシー - linear_projects
-- ============================================================================

-- 管理者は全てのプロジェクトを閲覧・編集可能
CREATE POLICY "Admins can view all projects"
  ON public.linear_projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert projects"
  ON public.linear_projects
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can update projects"
  ON public.linear_projects
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

-- 一般ユーザーは全てのプロジェクトを閲覧可能（所属判断のため）
CREATE POLICY "Users can view all projects"
  ON public.linear_projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
    )
  );

-- ============================================================================
-- セクション7: RLSポリシー - linear_teams
-- ============================================================================

-- 管理者は全てのTeamを閲覧・編集可能
CREATE POLICY "Admins can view all teams"
  ON public.linear_teams
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert teams"
  ON public.linear_teams
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can update teams"
  ON public.linear_teams
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

-- 一般ユーザーは全てのTeamを閲覧可能（所属判断のため）
CREATE POLICY "Users can view all teams"
  ON public.linear_teams
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
    )
  );

-- ============================================================================
-- セクション8: RLSポリシー - user_project_memberships
-- ============================================================================

-- 管理者は全ての所属関係を閲覧・編集可能
CREATE POLICY "Admins can view all memberships"
  ON public.user_project_memberships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert memberships"
  ON public.user_project_memberships
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can update memberships"
  ON public.user_project_memberships
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete memberships"
  ON public.user_project_memberships
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

-- ユーザーは自分の所属プロジェクトを閲覧可能
CREATE POLICY "Users can view their own memberships"
  ON public.user_project_memberships
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================================
-- セクション9: RLSポリシー - user_team_memberships
-- ============================================================================

-- 管理者は全ての所属関係を閲覧・編集可能
CREATE POLICY "Admins can view all team memberships"
  ON public.user_team_memberships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert team memberships"
  ON public.user_team_memberships
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can update team memberships"
  ON public.user_team_memberships
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete team memberships"
  ON public.user_team_memberships
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

-- ユーザーは自分の所属Teamを閲覧可能
CREATE POLICY "Users can view their own team memberships"
  ON public.user_team_memberships
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================================
-- セクション10: RLSポリシー - user_approvals
-- ============================================================================

-- 管理者は全てのユーザーを更新可能
CREATE POLICY "Admins can update all users"
  ON public.user_approvals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE public.user_approvals.user_id = auth.uid()
      AND public.user_approvals.role = 'admin'
    )
  );

-- ユーザーが自分の名前を更新できるポリシーを追加
CREATE POLICY "Users can update their own name"
  ON public.user_approvals
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      -- 名前フィールドのみ更新可能（approved, role, emailは変更不可）
      approved = (SELECT approved FROM public.user_approvals WHERE user_id = auth.uid())
      AND role = (SELECT role FROM public.user_approvals WHERE user_id = auth.uid())
      AND email = (SELECT email FROM public.user_approvals WHERE user_id = auth.uid())
    )
  );

COMMENT ON POLICY "Users can update their own name" ON public.user_approvals IS 'ユーザーは自分の名前のみ更新可能（承認状態やロールは変更不可）';

-- ============================================================================
-- セクション11: RLSポリシー - time_entries
-- ============================================================================

-- ユーザーは自分のtime_entriesを閲覧可能
CREATE POLICY "Users can view their own time entries"
  ON public.time_entries
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- ユーザーは自分のtime_entriesを挿入可能
CREATE POLICY "Users can insert their own time entries"
  ON public.time_entries
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
  );

-- ユーザーは自分のtime_entriesを更新可能
CREATE POLICY "Users can update their own time entries"
  ON public.time_entries
  FOR UPDATE
  USING (
    auth.uid() = user_id
  );

-- ユーザーは自分のtime_entriesを削除可能
CREATE POLICY "Users can delete their own time entries"
  ON public.time_entries
  FOR DELETE
  USING (
    auth.uid() = user_id
  );

-- 管理者は全てのtime_entriesを閲覧可能
CREATE POLICY "Admins can view all time entries"
  ON public.time_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.role = 'admin'
      AND user_approvals.approved = true
    )
  );

-- 管理者は全てのtime_entriesを挿入可能
CREATE POLICY "Admins can insert all time entries"
  ON public.time_entries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.role = 'admin'
      AND user_approvals.approved = true
    )
  );

-- 管理者は全てのtime_entriesを更新可能
CREATE POLICY "Admins can update all time entries"
  ON public.time_entries
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.role = 'admin'
      AND user_approvals.approved = true
    )
  );

-- 管理者は全てのtime_entriesを削除可能
CREATE POLICY "Admins can delete all time entries"
  ON public.time_entries
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.role = 'admin'
      AND user_approvals.approved = true
    )
  );

COMMENT ON POLICY "Users can view their own time entries" ON public.time_entries IS 'ユーザーは自分のtime_entriesのみ閲覧可能';
COMMENT ON POLICY "Users can insert their own time entries" ON public.time_entries IS 'ユーザーは自分のtime_entriesのみ挿入可能';
COMMENT ON POLICY "Users can update their own time entries" ON public.time_entries IS 'ユーザーは自分のtime_entriesのみ更新可能';
COMMENT ON POLICY "Users can delete their own time entries" ON public.time_entries IS 'ユーザーは自分のtime_entriesのみ削除可能';
COMMENT ON POLICY "Admins can view all time entries" ON public.time_entries IS '管理者は全てのtime_entriesを閲覧可能';
COMMENT ON POLICY "Admins can insert all time entries" ON public.time_entries IS '管理者は全てのtime_entriesを挿入可能';
COMMENT ON POLICY "Admins can update all time entries" ON public.time_entries IS '管理者は全てのtime_entriesを更新可能';
COMMENT ON POLICY "Admins can delete all time entries" ON public.time_entries IS '管理者は全てのtime_entriesを削除可能';

-- ============================================================================
-- セクション12: RLSポリシー - tasks
-- ============================================================================

-- 全ユーザーは全てのtasksを閲覧可能（チーム作業のため）
CREATE POLICY "Users can view all tasks"
  ON public.tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.approved = true
    )
  );

-- ユーザーは自分のtasksを挿入可能
CREATE POLICY "Users can insert their own tasks"
  ON public.tasks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.approved = true
    )
  );

-- ユーザーは自分のtasksを更新可能
CREATE POLICY "Users can update their own tasks"
  ON public.tasks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.approved = true
    )
  );

-- ユーザーは自分のtasksを削除可能
CREATE POLICY "Users can delete their own tasks"
  ON public.tasks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.approved = true
    )
  );

-- 管理者は全てのtasksを閲覧可能
CREATE POLICY "Admins can view all tasks"
  ON public.tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.role = 'admin'
      AND user_approvals.approved = true
    )
  );

-- 管理者は全てのtasksを挿入可能
CREATE POLICY "Admins can insert all tasks"
  ON public.tasks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.role = 'admin'
      AND user_approvals.approved = true
    )
  );

-- 管理者は全てのtasksを更新可能
CREATE POLICY "Admins can update all tasks"
  ON public.tasks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.role = 'admin'
      AND user_approvals.approved = true
    )
  );

-- 管理者は全てのtasksを削除可能
CREATE POLICY "Admins can delete all tasks"
  ON public.tasks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_approvals
      WHERE user_approvals.user_id = auth.uid()
      AND user_approvals.role = 'admin'
      AND user_approvals.approved = true
    )
  );

COMMENT ON POLICY "Users can view all tasks" ON public.tasks IS '承認済みユーザーは全てのtasksを閲覧可能（チーム作業のため）';
COMMENT ON POLICY "Users can insert their own tasks" ON public.tasks IS '承認済みユーザーはtasksを挿入可能';
COMMENT ON POLICY "Users can update their own tasks" ON public.tasks IS '承認済みユーザーはtasksを更新可能';
COMMENT ON POLICY "Users can delete their own tasks" ON public.tasks IS '承認済みユーザーはtasksを削除可能';
COMMENT ON POLICY "Admins can view all tasks" ON public.tasks IS '管理者は全てのtasksを閲覧可能';
COMMENT ON POLICY "Admins can insert all tasks" ON public.tasks IS '管理者は全てのtasksを挿入可能';
COMMENT ON POLICY "Admins can update all tasks" ON public.tasks IS '管理者は全てのtasksを更新可能';
COMMENT ON POLICY "Admins can delete all tasks" ON public.tasks IS '管理者は全てのtasksを削除可能';

-- ============================================================================
-- セクション13: トリガー
-- ============================================================================

-- linear_projectsのupdated_at自動更新トリガー
CREATE TRIGGER update_linear_projects_updated_at
  BEFORE UPDATE ON public.linear_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- linear_teamsのupdated_at自動更新トリガー
CREATE TRIGGER update_linear_teams_updated_at
  BEFORE UPDATE ON public.linear_teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- user_project_membershipsのupdated_at自動更新トリガー
CREATE TRIGGER update_user_project_memberships_updated_at
  BEFORE UPDATE ON public.user_project_memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- user_team_membershipsのupdated_at自動更新トリガー
CREATE TRIGGER update_user_team_memberships_updated_at
  BEFORE UPDATE ON public.user_team_memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- tasksが追加・更新されたときに、linear_projectsのlinear_team_idを自動更新するトリガー
CREATE TRIGGER trigger_auto_update_project_team
  AFTER INSERT OR UPDATE OF linear_project_id, linear_team_id
  ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_project_team();

COMMENT ON TRIGGER trigger_auto_update_project_team ON tasks IS 'Issueの追加・更新時にプロジェクトのチーム割り当てを自動更新';
