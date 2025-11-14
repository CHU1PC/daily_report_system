import { NextRequest, NextResponse } from 'next/server'
import { getAllLinearIssues } from '@/lib/linear'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * ユーザーの所属TeamのLinear Issue（完了済みを含む）をステータス順に取得するAPI
 * ソート順: 未終了 → 終了 → キャンセル → 完了
 * GET /api/linear/issues
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    // Linear API キーを環境変数から取得
    const linearApiKey = process.env.LINEAR_API_KEY

    if (!linearApiKey) {
      return NextResponse.json(
        {
          error: 'Linear API キーが設定されていません。.env.local に LINEAR_API_KEY を追加してください。',
        },
        { status: 500 }
      )
    }

    // Linear APIを呼び出し - すべてのIssueを取得（フィルタリングなし）
    const allIssues = await getAllLinearIssues(linearApiKey)

    console.log(`Returning all ${allIssues.length} issues without filtering`)

    return NextResponse.json({
      issues: allIssues,
      count: allIssues.length,
    })
  } catch (error) {
    console.error('Error in /api/linear/issues:', error)

    const errorMessage = error instanceof Error ? error.message : 'Linear APIの呼び出しに失敗しました'

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}
