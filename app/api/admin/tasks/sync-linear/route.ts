import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { LinearClient } from '@linear/sdk'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 管理者チェック
    const { data: userData, error: userError } = await supabase
      .from('user_approvals')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (userError || userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Linear APIキーの確認
    const linearApiKey = process.env.LINEAR_API_KEY
    if (!linearApiKey) {
      return NextResponse.json(
        { error: 'Linear API key not configured' },
        { status: 500 }
      )
    }

    const linearClient = new LinearClient({ apiKey: linearApiKey })

    // === 1. Teamsの同期 ===
    console.log('Syncing teams...')
    const teamsConnection = await linearClient.teams()
    const teams = teamsConnection.nodes
    let teamsSynced = 0

    for (const team of teams) {
      const { error: teamError } = await supabase
        .from('linear_teams')
        .upsert({
          linear_team_id: team.id,
          name: team.name,
          key: team.key,
          description: team.description || null,
          color: team.color || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'linear_team_id'
        })

      if (!teamError) {
        teamsSynced++
      } else {
        console.error(`Error syncing team ${team.key}:`, teamError)
      }
    }
    console.log(`Teams synced: ${teamsSynced}`)

    // === 2. Projectsの同期 ===
    console.log('Syncing projects...')
    let projectsSynced = 0
    const projectsMap = new Map() // プロジェクトIDをキャッシュ

    for (const team of teams) {
      const projectsConnection = await team.projects()
      const projects = projectsConnection.nodes

      for (const project of projects) {
        const { error: projectError } = await supabase
          .from('linear_projects')
          .upsert({
            linear_project_id: project.id,
            name: project.name,
            description: project.description || null,
            linear_team_id: team.id,
            color: project.color || null,
            state: project.state || null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'linear_project_id'
          })

        if (!projectError) {
          projectsSynced++
          projectsMap.set(project.id, project)
        } else {
          console.error(`Error syncing project ${project.name}:`, projectError)
        }
      }
    }
    console.log(`Projects synced: ${projectsSynced}`)

    // === 3. User Team Membershipsの同期 ===
    console.log('Syncing user team memberships...')
    let membershipsSynced = 0

    // 全ユーザーのLinear emailを取得
    const { data: allUsers } = await supabase
      .from('user_approvals')
      .select('user_id, email')
      .eq('approved', true)

    if (allUsers && allUsers.length > 0) {
      for (const team of teams) {
        // DBからlinear_team_idに対応するteam_id (UUID)を取得
        const { data: teamRecord } = await supabase
          .from('linear_teams')
          .select('id')
          .eq('linear_team_id', team.id)
          .single()

        if (!teamRecord) {
          console.error(`Team not found in DB: ${team.id}`)
          continue
        }

        const membersConnection = await team.members()
        const members = membersConnection.nodes

        for (const member of members) {
          const memberEmail = member.email

          // emailでユーザーを検索
          const matchedUser = allUsers.find(u => u.email === memberEmail)
          if (matchedUser) {
            const { error: membershipError } = await supabase
              .from('user_team_memberships')
              .upsert({
                user_id: matchedUser.user_id,
                team_id: teamRecord.id, // UUIDを使用
                role: member.admin ? 'admin' : 'member',
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'user_id,team_id'
              })

            if (!membershipError) {
              membershipsSynced++
            } else {
              console.error(`Error syncing membership for ${memberEmail}:`, membershipError)
            }
          }
        }
      }
    }
    console.log(`Memberships synced: ${membershipsSynced}`)

    // === 4. Issuesの同期（既存のコード） ===
    console.log('Syncing issues...')

    // 既存のタスクからlinear_issue_idを取得
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('linear_issue_id')
      .not('linear_issue_id', 'is', null)

    const existingIssueIds = new Set(
      existingTasks?.map(t => t.linear_issue_id) || []
    )

    // すべてのIssueを取得（ページネーション対応）
    const allIssues = []
    let hasNextPage = true
    let afterCursor: string | undefined = undefined

    while (hasNextPage) {
      const issuesConnection = await linearClient.issues({
        first: 100,
        after: afterCursor,
        includeArchived: true,
      })

      const issues = issuesConnection.nodes
      const pageInfo = issuesConnection.pageInfo

      allIssues.push(...issues)

      hasNextPage = pageInfo.hasNextPage
      afterCursor = pageInfo.endCursor || undefined

      console.log(`Fetched ${issues.length} issues (Total: ${allIssues.length})`)
    }

    console.log(`Found ${allIssues.length} issues from Linear`)

    let syncedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    // 各Issueを処理
    for (const issue of allIssues) {
      // 既に同期済みの場合はスキップ
      if (existingIssueIds.has(issue.id)) {
        skippedCount++
        continue
      }

      try {
        // Teamを取得
        const team = await issue.team
        let teamId: string | null = null

        if (team) {
          teamId = team.id
        }

        // タスク名を生成
        const taskName = `[${issue.identifier}] ${issue.title}`

        // 優先度に応じて色を決定
        const colors = {
          0: '#6366f1', // なし: 紫
          1: '#ef4444', // 緊急: 赤
          2: '#f59e0b', // 高: オレンジ
          3: '#10b981', // 中: 緑
          4: '#3b82f6', // 低: 青
        }
        const color = colors[issue.priority as keyof typeof colors] || '#3b82f6'

        // IssueのState、Project、Assigneeを取得
        const state = await issue.state
        const project = await issue.project
        const assignee = await issue.assignee

        // タスクを作成（管理者のuser_idを設定）
        const { error: insertError } = await supabase
          .from('tasks')
          .insert({
            user_id: user.id,
            name: taskName,
            color: color,
            linear_issue_id: issue.id,
            linear_team_id: teamId,
            linear_state_type: state?.type || null,
            linear_project_id: project?.id || null,
            description: issue.description || null,
            assignee_email: assignee?.email || null,
            assignee_name: assignee?.name || null,
            linear_identifier: issue.identifier,
            linear_url: issue.url,
            priority: issue.priority || 0,
            linear_updated_at: issue.updatedAt.toISOString(),
            created_at: issue.createdAt.toISOString(),
          })

        if (insertError) {
          console.error(`Error syncing issue ${issue.identifier}:`, insertError)
          errors.push(`${issue.identifier}: ${insertError.message}`)
        } else {
          syncedCount++
        }
      } catch (err) {
        console.error(`Error processing issue ${issue.identifier}:`, err)
        errors.push(`${issue.identifier}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    console.log(`Issues synced: ${syncedCount}, skipped: ${skippedCount}`)

    return NextResponse.json({
      message: 'Sync completed successfully',
      summary: {
        teams: teamsSynced,
        projects: projectsSynced,
        memberships: membershipsSynced,
        synced: syncedCount,
        skipped: skippedCount,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error in Linear sync:', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
