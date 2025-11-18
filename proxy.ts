import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// サーバーサイドログ用（本番でも重要なログは残す）
const isDev = process.env.NODE_ENV === 'development'
const log = (...args: any[]) => isDev && console.log(...args)

export async function proxy(request: NextRequest) {
  try {
    // 認証が不要なパス（最小限に限定）
    const publicPaths = [
      '/login',
      '/signup',
      '/auth',
      '/pending-approval',
      '/api/webhooks',  // 外部サービスからのwebhook
      '/api/user/approval-status',  // 認証チェック用API（内部で認証を行う）
    ]
    const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path))

    log('[Proxy] Path:', request.nextUrl.pathname, 'isPublicPath:', isPublicPath)

    // 認証不要なパスは直接通す
    if (isPublicPath) {
      log('[Proxy] Allowing request (public path)')
      return NextResponse.next({ request })
    }

    // セッションの検証とトークンリフレッシュを実行
    let supabaseResponse = NextResponse.next({
      request,
    })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // getSession()はローカルセッションのみチェック（getUser()より高速）
    // トークンのリフレッシュが必要な場合のみAPIコールが発生
    const { data: { session } } = await supabase.auth.getSession()

    log('[Proxy] Session:', session?.user ? 'valid' : 'invalid')

    // セッションが無効な場合はログインへリダイレクト
    if (!session?.user) {
      log('[Proxy] Invalid session, redirecting to /login')
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    log('[Proxy] Allowing request')
    return supabaseResponse
  } catch (error) {
    console.error('[Proxy] Error in authentication middleware:', error)
    // エラーが発生しても、リクエストを通す（認証エラーはアプリ側で処理）
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
