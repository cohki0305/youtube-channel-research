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

1. **Node 18以上**が必要です。依存パッケージはありません
2. **YouTube Data APIのキー**を用意します（無料。課金設定は不要です）
   1. https://console.cloud.google.com/ で新しいプロジェクトを作る
   2. https://console.cloud.google.com/apis/library/youtube.googleapis.com で「有効にする」を押す
   3. https://console.cloud.google.com/apis/credentials で「認証情報を作成」から「API キー」を作る
   4. キーの「API の制限」で、YouTube Data API v3 だけを許可する
   5. `cp .env.example .env` を実行し、`YOUTUBE_API_KEY=` の後ろにキーを貼る
3. **ラッコキーワードのMCP**を接続します。claude.ai の「設定 → コネクタ → コネクタを管理」で、[ラッコキーワードのコネクタ](https://claude.ai/directory/connectors/rakkokeyword)を追加し、ラッコIDでログインします。同じアカウントでログインしたClaude Codeから使えます
   - 使えるプランや設定の詳細は、ラッコの[AI連携ガイド](https://rakkokeyword.com/knowledge/9777/)を確認してください

## スクリプト

| コマンド | 内容 | クォータ |
|---|---|---|
| `node scripts/fetch_channel.mjs @handle` | 全動画を取得し、`data/<slug>/` に JSON と CSV を保存 | 動画200本で十数ユニット |
| `node scripts/analyze_channel.mjs data/<slug>` | 集計して `summary.md` を出力（月別、尺、上位・下位、タグ、【】ラベル、概要欄リンク） | 0 |
| `node scripts/correlate.mjs data/<slug> --since YYYY-MM` | `keywords.csv` と `volumes.csv` から、再生数と検索数の相関を**題材語の種類ごとに**計算して `correlation.md` を出力 | 0 |
| `node scripts/search_compare.mjs "検索語" --days 30 --highlight @handle` | 同じ題材の競合動画を、再生数と「再生÷登録者」で比べる | 1回 約100ユニット |
| `node scripts/find_similar.mjs data/<slug> "語1" "語2" --days 365 --momentum 30` | 題材語でYouTube検索し、近いチャンネルの候補を `similar_candidates.md` に出す。上位30候補は、直近90日の再生÷登録者と伸びも測る | 1語 約100ユニット＋約60ユニット |
| `node scripts/rakko_cache.mjs missing\|put\|volumes ...` | ラッコの月間検索数を `data/_cache/rakko/` にキャッシュし、未取得の語だけを出す。`volumes.csv` もキャッシュから作る | 0 |

クォータは1日10,000ユニットです。

### correlate.mjs の入力

- `data/<slug>/keywords.csv`：`video_id,keyword,type`（動画ごとの題材語と、その種類。例：`abc123,トヨタ 株価,銘柄名`）。種類の違う語を1つの相関に混ぜると、逆向きの効果が打ち消し合うため、type ごとに相関を出す
- `data/<slug>/volumes.csv`：`keyword,search_volume`（ラッコの月間検索数）

## 注意

- ラッコの月間検索数はGoogle検索のものです。YouTube内の検索数ではありません
- `.env` と `data/` はgitの管理対象から外しています
- 以前使っていたCowork環境では、外部への通信が許可リストで制限されていて、googleapis.com に届きませんでした。Claude CodeはMac上で直接動くので、この制限はありません（サンドボックスを有効にしている場合は、許可ドメインに `www.googleapis.com` を追加してください）
