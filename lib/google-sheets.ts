import { google } from 'googleapis'

// サービスアカウントの認証情報を使用してGoogle Sheets APIクライアントを作成
export function getGoogleSheetsClient() {
  try {
    // 環境変数から認証情報を取得
    const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!credentials) {
      console.warn('GOOGLE_SERVICE_ACCOUNT_KEY is not set - Google Sheets integration disabled')
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set')
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credentials),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    return google.sheets({ version: 'v4', auth })
  } catch (error) {
    console.error('Error creating Google Sheets client:', error)
    throw error
  }
}

// スプレッドシートIDを取得
export function getSpreadsheetId(): string {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set')
  }
  return spreadsheetId
}

// 月のシート名を生成（例: "2025年1月"）
export function getMonthlySheetName(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  return `${year}年${month}月`
}

// シートが存在するかチェックし、存在しない場合は作成
export async function ensureMonthlySheetExists(
  sheets: any,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  try {
    // スプレッドシートのメタデータを取得
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    })

    // 指定されたシート名が既に存在するかチェック
    const sheetExists = spreadsheet.data.sheets?.some(
      (sheet: any) => sheet.properties?.title === sheetName
    )

    if (!sheetExists) {
      // シートが存在しない場合は作成
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      })

      // ヘッダー行を追加
      const headerValues = [
        [
          'エントリーID',
          '日付',
          'Team名',
          'Project名',
          'Issue名',
          'Issue Description',
          'コメント',
          '稼働時間(時間)',
          'Assignee名',
          '開始時刻',
          '終了時刻',
        ],
      ]

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:K1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: headerValues,
        },
      })

      console.log(`Created new sheet: ${sheetName}`)
    }
  } catch (error) {
    console.error('Error ensuring sheet exists:', error)
    throw error
  }
}

// 時間エントリーをスプレッドシートに書き込む
export interface TimeEntryData {
  timeEntryId: string // 時間エントリーのID（編集・削除用）
  date: string // 日付
  teamName: string | null // Team名
  projectName: string | null // Project名
  issueName: string | null // Issue名
  issueDescription: string | null // Issue Description
  comment: string // コメント
  workingHours: number // 稼働時間(時間単位)
  assigneeName: string | null // Assignee名
  startTime: string // 開始時刻
  endTime: string // 終了時刻
}

export async function writeTimeEntryToSheet(
  data: TimeEntryData
): Promise<void> {
  try {
    const sheets = getGoogleSheetsClient()
    const spreadsheetId = getSpreadsheetId()

    // 日付からシート名を生成
    const entryDate = new Date(data.date)
    const sheetName = getMonthlySheetName(entryDate)

    // シートが存在することを確認（なければ作成）
    await ensureMonthlySheetExists(sheets, spreadsheetId, sheetName)

    // 書き込むデータを配列形式に変換
    const rowData = [
      [
        data.timeEntryId,
        data.date,
        data.teamName || '',
        data.projectName || '',
        data.issueName || '',
        data.issueDescription || '',
        data.comment,
        data.workingHours.toFixed(2), // 小数点2桁まで表示
        data.assigneeName || '',
        data.startTime,
        data.endTime,
      ],
    ]

    // シートに追加
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:K`,
      valueInputOption: 'RAW',
      requestBody: {
        values: rowData,
      },
    })

    console.log(`Time entry written to sheet: ${sheetName}`)
  } catch (error) {
    console.error('Error writing time entry to sheet:', error)
    throw error
  }
}

// 時間エントリーをスプレッドシートで更新
export async function updateTimeEntryInSheet(
  data: TimeEntryData
): Promise<void> {
  try {
    const sheets = getGoogleSheetsClient()
    const spreadsheetId = getSpreadsheetId()

    // 日付からシート名を生成
    const entryDate = new Date(data.date)
    const sheetName = getMonthlySheetName(entryDate)

    // シートが存在することを確認
    await ensureMonthlySheetExists(sheets, spreadsheetId, sheetName)

    // シート内の全データを取得してエントリーIDで検索
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:K`,
    })

    const rows = response.data.values
    if (!rows || rows.length <= 1) {
      throw new Error(`Time entry not found in sheet: ${sheetName}`)
    }

    // エントリーIDが一致する行を見つける（ヘッダー行をスキップ）
    const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === data.timeEntryId)

    const rowData = [
      [
        data.timeEntryId,
        data.date,
        data.teamName || '',
        data.projectName || '',
        data.issueName || '',
        data.issueDescription || '',
        data.comment,
        data.workingHours.toFixed(2),
        data.assigneeName || '',
        data.startTime,
        data.endTime,
      ],
    ]

    if (rowIndex === -1) {
      // 見つからない場合は新規追加（初回書き込み時の重複防止）
      console.warn('[updateTimeEntryInSheet] Entry ID not found in sheet. Appending new row:', data.timeEntryId)
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:K`,
        valueInputOption: 'RAW',
        requestBody: { values: rowData },
      })
      console.log(`Time entry appended to sheet: ${sheetName}`)
      return
    }

    // 該当行を更新（行番号は1-indexed）
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${rowIndex + 1}:K${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: rowData,
      },
    })

    console.log(`Time entry updated in sheet: ${sheetName}, row: ${rowIndex + 1}`)
  } catch (error) {
    console.error('Error updating time entry in sheet:', error)
    throw error
  }
}

// 時間エントリーをスプレッドシートから削除
export async function deleteTimeEntryFromSheet(
  timeEntryId: string,
  date: string
): Promise<void> {
  try {
    console.log('[deleteTimeEntryFromSheet] Starting deletion:', { timeEntryId, date })

    const sheets = getGoogleSheetsClient()
    const spreadsheetId = getSpreadsheetId()

    // 日付からシート名を生成
    const entryDate = new Date(date)
    const sheetName = getMonthlySheetName(entryDate)
    console.log('[deleteTimeEntryFromSheet] Sheet name:', sheetName)

    // シート内の全データを取得してエントリーIDで検索
    console.log('[deleteTimeEntryFromSheet] Fetching sheet data...')
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:K`,
    })

    const rows = response.data.values
    console.log('[deleteTimeEntryFromSheet] Rows found:', rows?.length || 0)

    if (!rows || rows.length <= 1) {
      console.warn(`[deleteTimeEntryFromSheet] No data rows in sheet: ${sheetName}`)
      throw new Error(`Time entry not found in sheet: ${sheetName}`)
    }

    // エントリーIDが一致する行を見つける（デバッグ情報を追加）
    console.log('[deleteTimeEntryFromSheet] Searching for entry ID:', timeEntryId)
    console.log('[deleteTimeEntryFromSheet] First 3 row IDs:', rows.slice(0, 3).map(r => r[0]))

    const rowIndex = rows.findIndex((row, index) => {
      if (index === 0) return false // ヘッダー行をスキップ
      const matches = row[0] === timeEntryId
      if (matches) {
        console.log('[deleteTimeEntryFromSheet] Found matching row at index:', index, 'value:', row[0])
      }
      return matches
    })

    console.log('[deleteTimeEntryFromSheet] Row index found:', rowIndex)

    if (rowIndex === -1) {
      console.warn('[deleteTimeEntryFromSheet] Entry ID not found in sheet. This entry may have been created before the ID column was added.')
      console.warn('[deleteTimeEntryFromSheet] Skipping spreadsheet deletion for entry:', timeEntryId)
      // エントリーIDが見つからない場合はスキップ（古いエントリーの可能性）
      return
    }

    // シートIDを取得
    console.log('[deleteTimeEntryFromSheet] Getting sheet metadata...')
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    })

    const sheet = spreadsheet.data.sheets?.find(
      (s: any) => s.properties?.title === sheetName
    )

    if (!sheet || !sheet.properties?.sheetId) {
      console.error('[deleteTimeEntryFromSheet] Sheet not found:', sheetName)
      throw new Error(`Sheet ${sheetName} not found`)
    }

    console.log('[deleteTimeEntryFromSheet] Sheet ID:', sheet.properties.sheetId)
    console.log('[deleteTimeEntryFromSheet] Deleting row:', rowIndex, '(1-indexed:', rowIndex + 1, ')')

    // 行を削除（batchUpdateを使用）
    const deleteRequest = {
      deleteDimension: {
        range: {
          sheetId: sheet.properties.sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex,
          endIndex: rowIndex + 1,
        },
      },
    }

    console.log('[deleteTimeEntryFromSheet] Delete request:', JSON.stringify(deleteRequest, null, 2))

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [deleteRequest],
      },
    })

    console.log(`[deleteTimeEntryFromSheet] ✓ Time entry deleted from sheet: ${sheetName}, row: ${rowIndex + 1}`)
  } catch (error) {
    console.error('[deleteTimeEntryFromSheet] Error deleting time entry from sheet:', error)
    if (error instanceof Error) {
      console.error('[deleteTimeEntryFromSheet] Error message:', error.message)
      console.error('[deleteTimeEntryFromSheet] Error stack:', error.stack)
    }
    throw error
  }
}
