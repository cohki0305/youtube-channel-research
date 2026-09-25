# CLAUDE.md

YouTubeのベンチマークチャンネルを分析するリポジトリ。

- 分析を頼まれたら、`youtube-channel-research` スキルの手順に従う。スキルが未配置の場合は、`skills/youtube-channel-research/SKILL.md` を読む。最初にヒアリングを行う
- データの取得はYouTube Data API（`scripts/`）、検索需要はラッコMCPで取る。キーワードや伸びた理由を、推測だけで出さない
- `.env` の中身（APIキー）は表示しない。コミットもしない
- `search_compare.mjs` はクォータを1回100ユニット以上使う。`find_similar.mjs` は検索語1つにつき約100ユニット使う。どちらも実行する前に回数を決める
- ラッコの月間検索数は、`scripts/rakko_cache.mjs` でキャッシュを確認してから、未取得の語だけを送る
- 出力は `data/<slug>/` 以下に置く。報告では、数字ごとに出典（YouTube APIかラッコか）を書く
