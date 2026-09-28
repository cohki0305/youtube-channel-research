# CLAUDE.md

YouTubeのベンチマークチャンネルを分析するリポジトリ。

- 分析を頼まれたら、`youtube-channel-research` スキルの手順に従う。スキルが未配置の場合は、`skills/youtube-channel-research/SKILL.md` を読む。最初にヒアリングを行う
- データの取得はYouTube Data API（`scripts/`）、検索需要はラッコMCPで取る。キーワードや伸びた理由を、推測だけで出さない
- `.env` の中身（APIキー）は表示しない。コミットもしない
- `search_compare.ts` はクォータを1回100ユニット以上使う。`find_similar.ts` は検索語1つにつき約100ユニット使う。YouTube API は、1日の上限（10,000ユニット）を超えない範囲なら、ユーザーに確認せずに使ってよい（2026-09-28 ユーザーの許可）。実行する前に回数を見積もり、報告で使ったユニット数を書く
- ラッコの月間検索数は、`scripts/rakko_cache.ts` でキャッシュを確認してから、未取得の語だけを送る
- 出力は `data/<slug>/` 以下に置く。報告では、数字ごとに出典（YouTube APIかラッコか）を書く
- 自分（クライアント）のチャンネルの振り返りは、スキルのパートCに従う。データは YouTube Analytics API（OAuth、`scripts/own_auth.ts`）と Studio の CSV で取る。`.env` の `YOUTUBE_OAUTH_*` も表示しない
- `fetch_transcript.ts` は非公式の通信を使う。取りに行く本数を決めてから実行し、20本を超えるときはユーザーに確認してから `--yes` を付ける
