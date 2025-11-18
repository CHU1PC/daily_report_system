import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// サーバーサイドログ用（本番でも重要なログは残す）
const isDev = process.env.NODE_ENV === 'development'
const log = (...args: any[]) => isDev && console.log(...args)
const logError = (...args: any[]) => console.error(...args)

export async function GET() {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // 現在のユーザーを取得
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      log('[Approval API] Not authenticated:', authError?.message)
      const response = NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
      // 認証エラーも短時間キャッシュ（不要な再試行を防ぐ）
      response.headers.set('Cache-Control', 'private, max-age=60')
      return response
    }

    // 承認状態を取得
    const { data, error } = await supabase
      .from('user_approvals')
      .select('approved, role, name')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      logError('[Approval API] Error fetching approval status:', error)
      // エラー時はキャッシュしない（即座に再試行できるように）
      return NextResponse.json(
        { error: 'Failed to fetch approval status' },
        { status: 500 }
      )
    }

    // レコードが存在しない場合は未承認
    if (!data) {
      log('[Approval API] No approval record found for user:', user.id)
      const response = NextResponse.json({
        approved: false,
        role: 'user',
        name: null,
      })
      // キャッシュヘッダーを追加（5分間キャッシュ、承認状態は頻繁に変わらない）
      response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60')
      return response
    }

    log('[Approval API] Approval status retrieved:', { approved: data.approved, role: data.role })
    const response = NextResponse.json({
      approved: data.approved ?? false,
      role: data.role ?? 'user',
      name: data.name || null,
    })
    // キャッシュヘッダーを追加（5分間キャッシュ、承認状態は頻繁に変わらない）
    response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60')
    return response
  } catch (error) {
    logError('[Approval API] Error in approval status API:', error)
    // エラー時はキャッシュしない（即座に再試行できるように）
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
