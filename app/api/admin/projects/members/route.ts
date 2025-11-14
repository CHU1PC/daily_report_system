import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * 全プロジェクトとそのメンバー情報を取得（管理者のみ）
 * GET /api/admin/projects/members
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    // 管理者チェック
    const { data: userData, error: userError } = await supabase
      .from('user_approvals')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (userError || userData?.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      )
    }

    // 全プロジェクトを取得
    const { data: projects, error: projectsError } = await supabase
      .from('linear_projects')
      .select('*')
      .order('name', { ascending: true })

    if (projectsError) {
      return NextResponse.json(
        { error: 'プロジェクト一覧の取得に失敗しました' },
        { status: 500 }
      )
    }

    // 各プロジェクトのメンバー情報を取得
    const projectsWithMembers = await Promise.all(
      (projects || []).map(async (project) => {
        const { data: memberships, error: membershipsError } = await supabase
          .from('user_project_memberships')
          .select(`
            user_id,
            user:user_approvals(
              user_id,
              email,
              role,
              approved
            )
          `)
          .eq('project_id', project.id)

        if (membershipsError) {
          console.error('Failed to fetch memberships for project:', project.id, membershipsError)
          return {
            ...project,
            members: [],
            memberCount: 0
          }
        }

        const members = (memberships || [])
          .map((m: any) => m.user)
          .filter((u: any) => u !== null)

        return {
          ...project,
          members,
          memberCount: members.length
        }
      })
    )

    return NextResponse.json({
      projects: projectsWithMembers,
      count: projectsWithMembers.length,
    })
  } catch (error) {
    console.error('Projects with members fetch error:', error)
    return NextResponse.json(
      {
        error: 'プロジェクト情報の取得に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
