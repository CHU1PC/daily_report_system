import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import fs from 'fs'
import path from 'path'

/**
 * マイグレーションを実行（管理者のみ）
 * POST /api/admin/migrations/run
 * Body: { migrationFile: string }
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { migrationFile } = body as { migrationFile: string }

    if (!migrationFile) {
      return NextResponse.json(
        { error: 'migrationFile を指定してください' },
        { status: 400 }
      )
    }

    // マイグレーションファイルを読み込む
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
    const filePath = path.join(migrationsDir, migrationFile)

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `マイグレーションファイルが見つかりません: ${migrationFile}` },
        { status: 404 }
      )
    }

    const sql = fs.readFileSync(filePath, 'utf-8')

    // SQLを実行（注意: rpc経由での実行は制限があるため、複数のステートメントを分割する必要がある場合がある）
    console.log('Executing migration:', migrationFile)
    console.log('SQL length:', sql.length)

    // Supabase では複数のSQLステートメントを一度に実行できないので、
    // セミコロンで分割して個別に実行する
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    console.log('Number of statements:', statements.length)

    const results = []
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (!statement) continue

      console.log(`Executing statement ${i + 1}/${statements.length}`)

      try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement })

        if (error) {
          console.error(`Statement ${i + 1} failed:`, error)
          results.push({ index: i + 1, error: error.message, statement: statement.substring(0, 100) })
        } else {
          results.push({ index: i + 1, success: true })
        }
      } catch (err) {
        console.error(`Statement ${i + 1} exception:`, err)
        results.push({
          index: i + 1,
          error: err instanceof Error ? err.message : '不明なエラー',
          statement: statement.substring(0, 100)
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'マイグレーションを実行しました',
      migrationFile,
      results,
      totalStatements: statements.length,
    })
  } catch (error) {
    console.error('Migration execution error:', error)
    return NextResponse.json(
      {
        error: 'マイグレーションの実行に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 }
    )
  }
}
