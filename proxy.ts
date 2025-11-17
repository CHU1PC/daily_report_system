import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  try {
    // 認証が不要なパス
    const publicPaths = ['/login', '/signup', '/auth', '/pending-approval']
    const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path))

    console.log('[Proxy] Path:', request.nextUrl.pathname, 'isPublicPath:', isPublicPath)

    // OAuth callbackは認証チェックをスキップして直接通す
    if (isPublicPath) {
      console.log('[Proxy] Allowing request (public path)')
      return NextResponse.next({ request })
    }

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

    // Refresh the Auth token
    // @ts-ignore - Type issue with @supabase/ssr 0.7.0
    const { data: { user } } = await supabase.auth.getUser()

    console.log('[Proxy] User:', user ? 'authenticated' : 'not authenticated')

    // 認証が必要なルートへのアクセス
    if (!user) {
      console.log('[Proxy] Redirecting to /login')
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    console.log('[Proxy] Allowing request')
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
