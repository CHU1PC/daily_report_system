import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  // 環境変数から正しいベースURLを取得
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin

  console.log('🔍 Callback - requestUrl.origin:', requestUrl.origin)
  console.log('🔍 Callback - NEXT_PUBLIC_SITE_URL:', process.env.NEXT_PUBLIC_SITE_URL)
  console.log('🔍 Callback - Using baseUrl:', baseUrl)

  if (code) {
    const supabase = await createServerSupabaseClient()

    // Exchange the code for a session
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('❌ Error exchanging code for session:', error)
      // エラーの場合はログインページにリダイレクト
      return NextResponse.redirect(`${baseUrl}/login?error=認証に失敗しました`)
    }

    // 承認状態を確認
    if (data.user) {
      const { data: approvalData } = await supabase
        .from('user_approvals')
        .select('approved')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (approvalData && approvalData.approved) {
        console.log('✅ User is approved, redirecting to:', `${baseUrl}/`)
        return NextResponse.redirect(`${baseUrl}/`)
      } else {
        console.log('⏳ User is not approved yet, redirecting to pending-approval')
        return NextResponse.redirect(`${baseUrl}/pending-approval`)
      }
    }

    console.log('✅ Code exchange successful, redirecting to:', `${baseUrl}/`)
    return NextResponse.redirect(`${baseUrl}/`)
  }

  console.log('⚠️ No code provided, redirecting to login')
  // codeがない場合はログインページにリダイレクト
  return NextResponse.redirect(`${baseUrl}/login`)
}
