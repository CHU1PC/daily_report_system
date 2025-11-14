# 日報システム (Daily Report System)

Linear Issueと連携したタイムトラッキング・日報管理システム

## 概要

Linear Issueをタスクとして同期し、作業時間を計測・記録できるシステムです。計測した時間は自動的にGoogle Sheetsに出力され、チームやプロジェクトごとの工数管理が可能です。

## 主な機能

- **タイムトラッキング**: タスクごとに作業時間を計測
- **週次カレンダー**: 週単位で作業履歴を可視化
- **Linear連携**: Linear IssueをタスクとしてインポートしてTracking
- **Google Sheets連携**: 作業記録を自動的にスプレッドシートに出力
- **チーム・プロジェクト管理**: メンバーをTeamやProjectに割り当て
- **承認フロー**: 新規ユーザーは管理者による承認が必要
- **タイムゾーン対応**: 複数のタイムゾーンに対応

## 技術スタック

- **フロントエンド**: Next.js 15 (App Router), React, TypeScript, TailwindCSS
- **UI**: shadcn/ui
- **バックエンド**: Next.js API Routes
- **データベース**: Supabase (PostgreSQL)
- **認証**: Supabase Auth
- **外部連携**: Linear API, Google Sheets API

## セットアップ

### 1. 前提条件

- Node.js 18以上
- pnpm (推奨) または npm
- Supabaseアカウント
- Linear APIキー
- Google Cloud Platformアカウント (Sheets連携用、オプション)

### 2. リポジトリのクローン

```bash
git clone <repository-url>
cd daily_report_system
```

### 3. 依存関係のインストール

```bash
pnpm install
```

### 4. 環境変数の設定

`.env.local.example`をコピーして`.env.local`を作成:

```bash
cp .env.local.example .env.local
```

`.env.local`を編集して以下の環境変数を設定:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# サイトのベースURL
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Linear API
LINEAR_API_KEY=your-linear-api-key

# Linear Webhook (オプション)
LINEAR_WEBHOOK_SECRET=your-webhook-secret

# Google Sheets (オプション)
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
```

### 5. Supabaseのセットアップ

#### 5.1 Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com/)でプロジェクトを作成
2. Project URLとAPI Keysを取得し、`.env.local`に設定

#### 5.2 データベースマイグレーション

Supabaseダッシュボードの**SQL Editor**で、`supabase/migrations/001_init.sql`の内容を実行:

1. Supabaseダッシュボードにログイン
2. 左メニューから「SQL Editor」を選択
3. 「New query」をクリック
4. `supabase/migrations/001_init.sql`の内容をコピー&ペースト
5. 「Run」をクリックして実行

または、Supabase CLIを使用:

```bash
# Supabase CLIをインストール
npm install -g supabase

# Supabaseにログイン
supabase login

# プロジェクトにリンク
supabase link --project-ref <your-project-ref>

# マイグレーションを適用
supabase db push
```

### 6. 開発サーバーの起動

```bash
pnpm dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## 初回セットアップフロー

### 1. 管理者ユーザーの作成

1. `/signup` にアクセスしてユーザー登録
2. Supabaseダッシュボードの**Table Editor**で `user_approvals` テーブルを開く
3. 登録したユーザーの `approved` を `true`、`role` を `admin` に変更:

```sql
UPDATE user_approvals
SET approved = true, role = 'admin'
WHERE email = 'your-email@example.com';
```

### 2. LinearからTeam・Projectを同期

1. 管理者でログイン
2. 画面右上の「管理画面」または「Team管理」に移動
3. 「Linearから同期」ボタンをクリック
4. Linear上のTeamとProjectがデータベースに同期されます

### 3. Team・Projectにメンバーを割り当て

1. 「Team管理」画面で各Teamの「メンバー編集」をクリック
2. 承認済みユーザーを選択して保存
3. Project管理でも同様にメンバーを割り当て

### 4. タスクの同期と作業開始

1. メインページに戻る
2. 「Linearタスク同期」ボタンをクリック
3. 自分にアサインされたLinear Issueがタスクとして表示されます
4. タスクを選択して「開始」ボタンで作業時間の計測を開始

## Google Sheets連携（オプション）

### 1. Google Cloud Platformの設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **APIs & Services** → **Enable APIs and services**
3. 「Google Sheets API」を検索して有効化
4. **APIs & Services** → **Credentials** → **Create Credentials** → **Service account**
5. サービスアカウントを作成し、JSONキーをダウンロード
6. JSONキーの内容を1行にまとめて `.env.local` の `GOOGLE_SERVICE_ACCOUNT_KEY` に設定

### 2. スプレッドシートの準備

1. Google Sheetsで新しいスプレッドシートを作成
2. スプレッドシートのIDをURLから取得: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
3. `.env.local` の `GOOGLE_SPREADSHEET_ID` に設定
4. サービスアカウントのメールアドレス（JSONキーの`client_email`）に、スプレッドシートの**編集権限**を付与

### 3. シートの作成

スプレッドシート内に以下のシートを作成:

- `Daily Report` - 日次レポート用（自動で時間エントリが追加されます）

## 使い方

### タイムトラッキング

1. メインページでタスクを選択
2. 「開始」ボタンでタイマーを開始
3. 作業終了時に「停止」ボタンをクリック
4. コメントを入力して「保存」
5. Google Sheets連携が有効な場合、自動的にスプレッドシートに記録されます

### 週次カレンダー

- 週単位で作業履歴を可視化
- エントリをクリックして編集・削除が可能
- 日付をまたぐエントリも正しく表示
- 矢印ボタンで週を切り替え

### 手動エントリ追加

週次カレンダーの右上にある小さな「手動追加」ボタン（意図的に目立たないデザイン）から、忘れた作業を後から追加できます。

### 管理機能（管理者のみ）

- **ユーザー管理**: 新規ユーザーの承認・権限設定・削除
- **Team管理**: Teamの同期とメンバーの割り当て
- **Project管理**: Projectの同期とメンバーの割り当て

## プロジェクト構成

```
daily_report_system/
├── app/                      # Next.js App Router
│   ├── api/                  # APIルート
│   │   ├── admin/           # 管理者用API
│   │   ├── linear/          # Linear連携API
│   │   ├── spreadsheet/     # Google Sheets連携API
│   │   └── webhooks/        # Webhook受信
│   ├── admin/               # 管理画面
│   ├── auth/                # 認証関連
│   ├── login/               # ログイン画面
│   ├── signup/              # サインアップ画面
│   └── page.tsx             # メインページ
├── components/              # Reactコンポーネント
│   ├── ui/                  # shadcn/ui コンポーネント
│   ├── task-management.tsx  # タスク管理
│   ├── task-timer.tsx       # タイマー
│   ├── weekly-calendar.tsx  # 週次カレンダー
│   ├── time-entry-dialog.tsx # エントリ編集
│   ├── manual-time-entry-dialog.tsx # 手動エントリ追加
│   ├── members-manager.tsx  # メンバー管理（統一コンポーネント）
│   └── ...
├── lib/                     # ユーティリティ・ロジック
│   ├── linear/             # Linear API クライアント（モジュール化）
│   │   ├── types.ts        # 型定義
│   │   ├── issues.ts       # Issue操作
│   │   ├── teams.ts        # Team操作
│   │   ├── projects.ts     # Project操作
│   │   └── index.ts        # エクスポート
│   ├── contexts/           # React Context
│   ├── hooks/              # カスタムフック
│   ├── supabase.ts         # Supabaseクライアント
│   ├── supabase-server.ts  # サーバーサイドSupabaseクライアント
│   ├── google-sheets.ts    # Google Sheets操作
│   └── types.ts            # 型定義
├── supabase/
│   └── migrations/         # DBマイグレーション
│       └── 001_init.sql    # 統合初期化スクリプト
├── scripts/                # ユーティリティスクリプト
└── public/                 # 静的ファイル
```

## データベーススキーマ

主要なテーブル:

- `user_approvals`: ユーザー承認管理（email, approved, role, name）
- `tasks`: タスク（Linear Issue連携）
- `time_entries`: 作業時間記録
- `linear_teams`: Linear Team情報
- `linear_projects`: Linear Project情報
- `user_team_memberships`: Teamメンバー関連（多対多）
- `user_project_memberships`: Projectメンバー関連（多対多）

詳細は `supabase/migrations/001_init.sql` を参照してください。

## トラブルシューティング

### Linear連携がうまくいかない

1. `LINEAR_API_KEY` が正しく設定されているか確認
2. Linear APIキーに適切な権限があるか確認（Settings → API → Personal API keys）
3. ブラウザのコンソールでエラーメッセージを確認

### Google Sheets連携でエラーが出る

1. サービスアカウントにスプレッドシートの**編集権限**があるか確認
2. `GOOGLE_SERVICE_ACCOUNT_KEY` が正しいJSON形式か確認
3. `GOOGLE_SPREADSHEET_ID` がURLから正しく取得できているか確認
4. スプレッドシートに`Daily Report`シートが存在するか確認

### ユーザーがログインできない

1. Supabaseダッシュボードで認証設定を確認
2. メール確認が必要な場合、確認メールが届いているか確認
3. `user_approvals` テーブルで `approved = true` になっているか確認
4. ブラウザのキャッシュをクリアして再度試す

### タイムゾーンがずれる

1. ブラウザのタイムゾーン設定を確認
2. タイマー画面右上のタイムゾーン選択で適切なタイムゾーンを選択
3. タイムゾーン設定はlocalStorageに保存されます

### データベースマイグレーションのエラー

1. Supabaseダッシュボードの**SQL Editor**でエラーメッセージを確認
2. RLS（Row Level Security）が有効になっているか確認
3. 既存のテーブルがある場合、`DROP TABLE IF EXISTS`を使用するか手動で削除

## 開発

### ビルド

```bash
pnpm build
```

### 型チェック

```bash
pnpm type-check
```

### Linting

```bash
pnpm lint
```

### 開発時のTips

- `console.log`はデバッグ用に多数残されています（本番環境でも問題診断に有用）
- コンポーネントは機能ごとに分割されています
- Linear APIクライアントは`lib/linear/`にモジュール化されています

## セキュリティ

### 環境変数の管理

**重要**: 以下のファイルは絶対にGitにコミットしないでください:

- `.env.local` - 実際の環境変数
- `*-service-account.json` - Google認証情報
- `*.key`, `*.pem` - 秘密鍵

`.gitignore`で以下がすでに除外されています:

- `.env*.local`
- `*-service-account.json`
- `*.key`, `*.pem`, `*.p12`
- `secrets.json`, `.secrets/`

### 推奨事項

1. `.env.local.example`をテンプレートとして使用
2. 本番環境では環境変数を環境に直接設定
3. APIキーは定期的にローテーション
4. Supabase Service Role Keyは慎重に管理（データベース全体への管理者権限）

## デプロイ

### Vercelへのデプロイ（推奨）

1. [Vercel](https://vercel.com/)にプロジェクトをインポート
2. 環境変数を設定（`.env.local`の内容をVercelの環境変数に設定）
3. デプロイ

**注意**: 環境変数の設定を忘れずに行ってください。

### その他のプラットフォーム

Next.js 15のデプロイガイドを参照:
https://nextjs.org/docs/app/building-your-application/deploying

## ライセンス

このプロジェクトはMITライセンスに従います。

## 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずIssueを開いて変更内容を議論してください。

### 開発の流れ

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## サポート

問題が発生した場合は、GitHubのIssueを作成してください。
