import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  console.log('[OAuth Callback] Request received:', { code: code ? 'present' : 'missing', next, origin })

  if (code) {
    // レスポンスオブジェクトを作成（Cookieを設定するため）
    let response = NextResponse.next({
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
            // レスポンスにCookieを設定
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { error, data } = await supabase.auth.exchangeCodeForSession(code)

    console.log('[OAuth Callback] exchangeCodeForSession result:', {
      hasError: !!error,
      hasUser: !!data?.user,
      userId: data?.user?.id
    })

    if (error) {
      console.error('❌ Error exchanging code for session:', error)
      return NextResponse.redirect(`${origin}/login?error=認証に失敗しました`)
    }

    // 承認状態を確認
    if (data.user) {
      const { data: approvalData, error: approvalError } = await supabase
        .from('user_approvals')
        .select('approved')
        .eq('user_id', data.user.id)
        .maybeSingle()

      console.log('[OAuth Callback] Approval check:', {
        hasApprovalData: !!approvalData,
        isApproved: approvalData?.approved,
        approvalError
      })

      if (approvalData && approvalData.approved) {
        console.log('✅ User is approved, redirecting to:', `${origin}/`)
        // リダイレクトレスポンスを作成し、既存のCookieを引き継ぐ
        const redirectResponse = NextResponse.redirect(`${origin}${next}`)

        // exchangeCodeForSessionで設定されたCookieをコピー
        response.cookies.getAll().forEach(cookie => {
          redirectResponse.cookies.set(cookie.name, cookie.value)
        })

        return redirectResponse
      } else {
        console.log('⏳ User is not approved yet, redirecting to pending-approval')
        // リダイレクトレスポンスを作成し、既存のCookieを引き継ぐ
        const redirectResponse = NextResponse.redirect(`${origin}/pending-approval`)

        // exchangeCodeForSessionで設定されたCookieをコピー
        response.cookies.getAll().forEach(cookie => {
          redirectResponse.cookies.set(cookie.name, cookie.value)
        })

        return redirectResponse
      }
    }

    console.log('[OAuth Callback] No user found in data, redirecting to:', `${origin}${next}`)
    return NextResponse.redirect(`${origin}${next}`)
  }

  // codeがない場合はログインページにリダイレクト
  console.log('[OAuth Callback] No code parameter, redirecting to /login')
  return NextResponse.redirect(`${origin}/login`)
}
