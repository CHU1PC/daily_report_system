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
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('❌ Error exchanging code for session:', error)
      // エラーの場合はログインページにリダイレクト
      return NextResponse.redirect(`${baseUrl}/login?error=認証に失敗しました`)
    }

    console.log('✅ Code exchange successful, redirecting to:', `${baseUrl}/`)
    // 認証成功後、ホームページにリダイレクト
    // AuthContextが承認状態をチェックして適切にリダイレクトする
    return NextResponse.redirect(`${baseUrl}/`)
  }

  console.log('⚠️ No code provided, redirecting to login')
  // codeがない場合はログインページにリダイレクト
  return NextResponse.redirect(`${baseUrl}/login`)
}
