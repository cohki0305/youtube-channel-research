# channel-research

ベンチマークにするYouTubeチャンネルを分析するためのツール一式です。YouTube Data APIでデータを取り、ラッコで検索需要を裏付け、認知的多様性の手順で伸びた理由を評価します。

**Claude Code で使うことを前提にしています**（スキル・MCP・サブエージェントを使うため、ほかのツールでは手順どおりに動きません）。このディレクトリを開いて使います。「@xxx を分析して」と頼むと、スキル `youtube-channel-research` に沿って進みます。

## セットアップ

0. **スキルを配置します**（初回だけ。どちらか一方を実行）。`cognitive-diversity` は、伸びた理由を4つの立場で評価する段（A4）で使います

   ```bash
   # このリポジトリだけで使う場合
   mkdir -p .claude/skills && cp -r skills/youtube-channel-research skills/cognitive-diversity .claude/skills/
   # どのディレクトリからでも使う場合
   mkdir -p ~/.claude/skills && cp -r skills/youtube-channel-research skills/cognitive-diversity ~/.claude/skills/
   ```
   - このリポジトリを更新したら、配置済みのスキルもコピーし直してください（古いコマンドのままになるため）

1. **Node 22.18以上**が必要です（`.ts` のスクリプトをビルドなしで直接実行します）。このディレクトリで `npm install` を実行し、依存パッケージ（文字起こし用の `youtube-transcript-plus`）を入れます
2. **YouTube Data APIのキー**を用意します（無料。課金設定は不要です）
   1. https://console.cloud.google.com/ で新しいプロジェクトを作る
   2. https://console.cloud.google.com/apis/library/youtube.googleapis.com で「有効にする」を押す
   3. https://console.cloud.google.com/apis/credentials で「認証情報を作成」から「API キー」を作る
   4. キーの「API の制限」で、YouTube Data API v3 だけを許可する
   5. `cp .env.example .env` を実行し、`YOUTUBE_API_KEY=` の後ろにキーを貼る
3. **ラッコキーワードのMCP**を接続します。claude.ai の「設定 → コネクタ → コネクタを管理」で、[ラッコキーワードのコネクタ](https://claude.ai/directory/connectors/rakkokeyword)を追加し、ラッコIDでログインします。同じアカウントでログインしたClaude Codeから使えます
   - 使えるプランや設定の詳細は、ラッコの[AI連携ガイド](https://rakkokeyword.com/knowledge/9777/)を確認してください

## 自分のチャンネルを分析する（初回だけ）

自分（またはクライアント）のチャンネルは、YouTube Analytics API（ログインが必要）と YouTube Studio の CSV で、新しい視聴者／リピーター別の数字・維持率・流入元まで見られます。チャンネルの持ち主の Google アカウントで行います。

1. **YouTube Analytics API を有効にする**：上で作った Google Cloud のプロジェクトで、https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com の「有効にする」を押す
2. **OAuth 同意画面を作る**：「Google Auth Platform」で、対象を「外部」にしてアプリ名などを入れる。「対象」でテストユーザーに自分のアカウントを足す
   - **そのあと「アプリを公開」で「本番環境」にする。**「テスト」のままだと、ログインが7日で切れます。個人で使う分には審査は不要です（ログインのときに「確認されていないアプリ」と出るので、「詳細」から進む）
3. **OAuth クライアントを作る**：https://console.cloud.google.com/apis/credentials の「認証情報を作成 → OAuth クライアント ID」で、種類を「**デスクトップ アプリ**」にする。クライアント ID とシークレットを `.env` の `YOUTUBE_OAUTH_CLIENT_ID=` と `YOUTUBE_OAUTH_CLIENT_SECRET=` に貼る
4. **ログインする**：`node scripts/own_auth.ts` を実行し、開いたブラウザで、分析したいチャンネルのアカウント（ブランドアカウントならそのチャンネル）を選んで承認する。`.env` に `YOUTUBE_OAUTH_REFRESH_TOKEN` が書き込まれます（画面には出ません）
5. **Studio の CSV を書き出す**（動画を出すたびに更新）：YouTube Studio →「アナリティクス」→「詳細モード」→「コンテンツ」タブで期間を選び、右上の書き出しボタンから「カンマ区切り値（.csv）」を選ぶ。できた zip（または展開した `表データ.csv`）を `data/<slug>/own/studio/all/` に置く
   - **期間はすべての動画が入る長さにする**（レポートは Studio の数字を公開からの通算として扱います。既定の「過去28日間」のままだと、古い動画の数字が小さく出ます）
   - 表には動画ごとの「新しい視聴者数」「リピーター」（人数）が入ります。**ただし長い期間（365日など）では空欄になることがあります**（2026-09時点）。空欄なら、すべての動画が入る範囲で短い期間（90日など）を試してください
   - 任意：フィルタで「視聴者の種類」を絞れる場合は、「新しい視聴者」で書き出したものを `new/` に、「リピーター」を `returning/` に置くと、新規／リピーター別の平均視聴率も出ます

文字起こし（`fetch_transcript.ts`）は、YouTube の非公式の内部API（`youtube-transcript-plus`）を使います。YouTube 側の変更で動かなくなることがあります。取れないときは、Studio の「字幕」から字幕ファイルを落とし、`data/<slug>/transcripts/<動画ID>.srt` に置けば使えます。

## スクリプト

| コマンド | 内容 | クォータ |
|---|---|---|
| `node scripts/fetch_channel.ts @handle` | 全動画を取得し、`data/<slug>/` に JSON と CSV を保存 | 動画200本で十数ユニット |
| `node scripts/analyze_channel.ts data/<slug>` | 集計して `summary.md` を出力（月別、尺、上位・下位、タグ、【】ラベル、概要欄リンク） | 0 |
| `node scripts/correlate.ts data/<slug> --since YYYY-MM` | `keywords.csv` と `volumes.csv` から、再生数と検索数の相関を**題材語の種類ごとに**計算して `correlation.md` を出力 | 0 |
| `node scripts/search_compare.ts "検索語" --days 30 --highlight @handle` | 同じ題材の競合動画を、再生数と「再生÷登録者」で比べる | 1回 約100ユニット |
| `node scripts/find_similar.ts data/<slug> "語1" "語2" --days 365 --momentum 30` | 題材語でYouTube検索し、近いチャンネルの候補を `similar_candidates.md` に出す。上位30候補は、直近90日の再生÷登録者と伸びも測る | 1語 約100ユニット＋約60ユニット |
| `node scripts/rakko_cache.ts missing\|put\|volumes ...` | ラッコの月間検索数を `data/_cache/rakko/` にキャッシュし、未取得の語だけを出す。`volumes.csv` もキャッシュから作る | 0 |
| `node scripts/own_auth.ts` | 自分のチャンネルの Analytics API に、初回だけログインする | 0 |
| `node scripts/fetch_own_analytics.ts data/<slug> [--video ID] [--since YYYY-MM]` | 動画ごとに、種類・公開後28日の日ごとの数字・維持率の曲線・流入元（検索語・関連動画）を取る | 0（Analytics API） |
| `node scripts/import_studio.ts data/<slug>` | Studio の CSV（`own/studio/{all,new,returning}/`）を取り込む | 0 |
| `node scripts/fetch_transcript.ts data/<slug> [--video ID \| --ids a,b] [--yes]` | 文字起こしを取る（自分・ベンチマークどちらの動画でも）。20本を超えるときは `--yes` が必要 | 0（非公式の通信） |
| `node scripts/own_keywords.ts data/<slug> [--top 45]` | 自分の動画の YouTube検索語（Analytics API）を `keywords.csv` に書き出す（ラッコで検索数を取るため）。手で足した「題材語」の行は残す | 0 |
| `node scripts/analyze_own.ts data/<slug> [--video ID]` | 全動画の `own/report.md`、または1本の `own/videos/<ID>.md` を出す | 0 |
| `npm test` / `npm run typecheck` | テストと型の確認 | 0 |

クォータは1日10,000ユニットです。

### correlate.ts の入力

- `data/<slug>/keywords.csv`：`video_id,keyword,type`（動画ごとの題材語と、その種類。例：`abc123,トヨタ 株価,銘柄名`）。種類の違う語を1つの相関に混ぜると、逆向きの効果が打ち消し合うため、type ごとに相関を出す
- `data/<slug>/volumes.csv`：`keyword,search_volume`（ラッコの月間検索数）

## 注意

- ラッコの月間検索数はGoogle検索のものです。YouTube内の検索数ではありません
- `.env` と `data/` はgitの管理対象から外しています
- 以前使っていたCowork環境では、外部への通信が許可リストで制限されていて、googleapis.com に届きませんでした。Claude CodeはMac上で直接動くので、この制限はありません（サンドボックスを有効にしている場合は、許可ドメインに `www.googleapis.com` を追加してください）
