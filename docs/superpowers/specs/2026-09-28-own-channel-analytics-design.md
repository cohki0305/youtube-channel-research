# 自分のチャンネルの分析（新しい視聴者／リピーター別・動画ごとの振り返り・仮説検証）設計書

- 日付：2026-09-28
- 状態：設計を承認済み（構成、レポート、エラーとテスト、動画ごとの振り返り、文字起こし、仮説検証、汎用化、TypeScriptへの統一）。実装計画は未作成

## 目的

運用者自身のチャンネルを、**新しい視聴者とリピーターに分けて**振り返り、**「なぜこの動画は伸びて、あの動画は伸びなかったか」を仮説として立てて検証する**。判断したいことは次のとおり。

1. 新しい視聴者を呼べる動画の型（題材・タイトル・サムネ）
2. リピーターの満足度（どの動画で期待を外したか）
3. サムネ・タイトルの改善（クリック率の低い動画を見つける）
4. 動画の中で視聴者が離脱している場所と、そのとき話していた内容
5. 1本を指定した詳しい振り返りと、公開後の推移（48時間・7日・28日）
6. 伸びた・伸びなかった理由の仮説検証と、次の動画での確認

## 前提

- **どのチャンネルにも使える道具にする。** 特定のチャンネルの目的・目標・本数を、スクリプトにも手順にも埋め込まない。チャンネルの目的は、スキルの既存のヒアリングで聞き、パートCで「どの指標を重く見るか」を決めるときにだけ使う（例：新しい視聴者を増やしたい → 新規の割合とブラウジングからの流入を重く見る）
- **本数に応じて、分析の仕方を切り替える。** 基準は「公開7日のデータがある通常動画」の本数（`MIN_GROUP_VIDEOS = 10`。定数として1か所に置く）
  - 10本未満：1本ずつの振り返り（中央値との比較）と、次の動画を実験にする検証を中心にする。型ごとのまとめは出さない
  - 10本以上：上位・下位の群どうしの比較と、型ごとのまとめを足す
- **通常動画・ショート・ライブを混ぜない。** Analytics API の `creatorContentType`（`VIDEO_ON_DEMAND` / `SHORTS` / `LIVE_STREAM`）で分け、中央値や比較はそれぞれの中で出す。維持率の見方がまったく違うため。既存の `fetch_channel` の尺による推定（`isShortLikely`）より正確
- **対象期間を決められるようにする。** 本数の多いチャンネルでも回せるよう、既定は直近12か月（パートAと同じ）とし、`--since YYYY-MM` で変えられる
- 動画を出すたびに回すので、繰り返しやすいことを優先する
- 依存パッケージは、実行時は `youtube-transcript-plus` の1つだけ、開発時は `typescript` と `@types/node` だけにする。ほかは標準機能だけを使う

## 言語と移行

新しいスクリプトは TypeScript で書き、**既存の `scripts/*.mjs` もこの作業の最初に `.ts` へ移して統一する。**

- **実行はビルドなし**：`node scripts/xxx.ts`。Node の型の除去（type stripping）で直接動かす。これが既定で有効な **Node 22.18以上** を動作環境にする（`package.json` の `engines`）
- **型の確認は別に行う**：`npm run typecheck`（`tsc --noEmit`）。`tsconfig.json` は `strict`、`allowImportingTsExtensions`、`noEmit`、`erasableSyntaxOnly`（型の除去だけで動く書き方に限る。`enum` などは使えない）
- **import は拡張子まで書く**：`import { median } from './lib.ts'`
- **移行は、機能を足す前に別のコミットで行う**：
  1. `git mv` で `.mjs` → `.ts`。中身の import の拡張子を直し、`lib.ts` の公開関数に型を付ける。ほかのスクリプトは、型の確認が通る最小限の型だけを付ける（振る舞いは変えない）
  2. **`scripts/lib.mjs` は、`export * from './lib.ts';` の1行だけを残す。** 手元の `data/<slug>/why/classify.mjs`（`data/tabbata`、`data/izumidaizm` など。gitの管理外）が `../../../scripts/lib.mjs` を読んでいるため。`.mjs` から `.ts` を import しても、Node 22.18以上なら動く
  3. `examples/classify.example.mjs` は `examples/classify.example.ts` にし、`lib.ts` を読む形にする
  4. README・CLAUDE.md・SKILL.md のコマンドを `.ts` に直す。配置済みのスキル（`.claude/skills/` や `~/.claude/skills/`）は古いコマンドのままなので、コピーし直すようREADMEに書く
  5. 確認：`npm run typecheck` が通ること。クォータを使わないスクリプト（`analyze_channel.ts`、`correlate.ts`、`rakko_cache.ts volumes`）を既存のデータで回し、移行前と出力が同じであること（`diff`）。`data/*/why/classify.mjs` が動くこと

## データの出どころ

1つの出どころで全部は揃わないため、取れる所から取る。

| ほしいもの | 出どころ | 備考 |
|---|---|---|
| 新しい視聴者／リピーターの別 | YouTube Studio のCSV（詳細モード） | Analytics API にはこの区分がない（`subscribedStatus` の登録者／非登録者のみ） |
| インプレッション数・クリック率 | YouTube Studio のCSV | Analytics API にはない。Reporting API（`channel_reach_basic_a1`）はジョブ登録後にしか溜まらないため使わない |
| 平均視聴時間・平均視聴率（新規／リピーター別） | YouTube Studio のCSV | 公開からの通算 |
| 離脱している場所（維持率の曲線） | YouTube Analytics API（OAuth） | `elapsedVideoTimeRatio` × `audienceWatchRatio`, `relativeRetentionPerformance`。**新規／リピーター別には取れない** |
| 公開後の推移（日ごと） | YouTube Analytics API（OAuth） | `dimensions=day`, `filters=video==<id>`。再生数・視聴時間・平均視聴率・登録者の増加。あとから、どの動画でも同じ日数で計算できる |
| 流入元 | YouTube Analytics API（OAuth） | `insightTrafficSourceType`。YouTube検索は `insightTrafficSourceDetail` で検索語、関連動画はどの動画の横に出たかまで取る |
| 文字起こし（秒つき） | `youtube-transcript-plus`（非公式の内部API） | APIキー・OAuth・クォータ不要。自動字幕と `ja` に対応。**ベンチマークの動画にも使える** |

OAuthのスコープは `https://www.googleapis.com/auth/yt-analytics.readonly` だけ（読み取り専用）。字幕をAPIで取ると編集権限（`youtube.force-ssl`）が必要になるため、使わない。

## 構成

```
[ユーザー] Studio詳細モードでCSV書き出し ─→ import_studio.ts ─→ own/studio.json ─┐
fetch_channel.ts(既存) ─→ videos.json ─┬───────────────────────────────────────┤
own_auth.ts(初回のみ) → .env           │                                        │
fetch_own_analytics.ts ─→ own/retention/<id>.json, own/daily/<id>.json,         │
                           own/traffic/<id>.json ────────────────────────────────┤
fetch_transcript.ts ─→ transcripts/<id>.json ───────────────────────────────────┤
                                                                                 ▼
                          analyze_own.ts ─→ own/report.md（全動画）
                                         └→ own/videos/<id>.md（--video 指定時）
```

出力は `data/<slug>/own/` に置く。文字起こしは自分・ベンチマークの両方で使うため `data/<slug>/transcripts/` に置く。

| ファイル | 役割 | 依存 |
|---|---|---|
| `package.json`・`tsconfig.json`（新規） | 実行時の依存は `youtube-transcript-plus` のみ。開発時は `typescript`・`@types/node`。`"type": "module"`、`engines.node >=22.18`、`scripts.typecheck` | — |
| `scripts/own_auth.ts`（新規） | 初回だけのOAuth。`node:http` でローカルサーバーを立て、ブラウザで承認を受け、リフレッシュトークンを `.env` の `YOUTUBE_OAUTH_REFRESH_TOKEN` に追記する。トークンは表示しない | `.env` の `YOUTUBE_OAUTH_CLIENT_ID` / `YOUTUBE_OAUTH_CLIENT_SECRET` |
| `scripts/lib.ts`（追加） | `getAccessToken()`（リフレッシュトークン → アクセストークン）、`ytAnalytics(params)`（`youtubeanalytics.googleapis.com/v2/reports` の呼び出し） | — |
| `scripts/fetch_own_analytics.ts`（新規） | 対象期間（既定は直近12か月、`--since YYYY-MM`）の動画ごとに、種類（`creatorContentType`）、維持率の曲線（100点、`audienceType==ORGANIC`）、公開日からの日ごとの数字、流入元（種類と詳細）を取って保存する。`--video <id>` でその1本だけ。保存済みで、公開から28日を過ぎた動画の日ごとの数字は取り直さない。Data APIのクォータは使わない | `videos.json`、OAuth |
| `scripts/fetch_transcript.ts`（新規） | `data/<slug>` の動画の文字起こしを取り、`transcripts/<id>.json`（`[{start, dur, text}]`）に保存する。対象は `--video <id>` / `--ids a,b,c` で指定する。指定がなければ対象期間の全動画とするが、**20本を超えるときは本数を示して止まる**（`--yes` で続行）。保存済みは取り直さない。1本ずつ間隔を空け、429のときはさらに間隔を空けて続ける。`transcripts/<id>.srt` / `.sbv` が置かれていれば、それを同じ形に変換して使う（ライブラリが動かないときの代わり） | `youtube-transcript-plus` |
| `scripts/import_studio.ts`（新規） | Studioの書き出し（zip または展開したフォルダ）を読み、「動画 × 視聴者の種類」に正規化して `own/studio.json` に保存する。列は**ヘッダー名で対応づける**（日本語UI・英語UIの両方）。見つからない列は警告だけ出す | CSV、`videos.json` |
| `scripts/analyze_own.ts`（新規） | 上をまとめて、全動画の `own/report.md` を出す。`--video <id>` のときは `own/videos/<id>.md` を出す | 上のすべて（ないものは空欄） |
| `skills/youtube-channel-research/SKILL.md`（追記） | 「パートC：自分のチャンネルを振り返る」を足す（下記）。「準備」の「クライアント自身のチャンネルを分析する場合」のCSVの項目は、パートCへの参照に置き換える | — |
| `README.md`（追記） | Node 22.18以上、`npm install`、OAuthクライアントの作り方、スクリプト表への追加、文字起こしが非公式APIであることの注意 | — |
| `.env.example`（追記） | `YOUTUBE_OAUTH_CLIENT_ID=` / `YOUTUBE_OAUTH_CLIENT_SECRET=` / `YOUTUBE_OAUTH_REFRESH_TOKEN=` | — |

### Studio CSVの列（未確定）

Studioが新規／リピーター別に、インプレッション数とクリック率まで書き出せるかは、実際の書き出しで決まる。**パーサーを書く前に、ユーザーに1回書き出してもらい、実際のヘッダーを確認する。** その結果で、`studio.json` の形と書き出し手順（どのタブ・どのフィルタで何回書き出すか）を確定する。

目標とする `studio.json` の1行：

```json
{ "videoId": "...", "viewerType": "new|returning|all", "views": 0, "avgViewDurationSec": 0, "avgViewPercentage": 0, "impressions": null, "ctr": null }
```

インプレッション数・クリック率が視聴者の種類別に取れない場合は、`viewerType: "all"` の行にだけ入れる。

### 公開後の推移の数え方

- Analytics API の日付は米国太平洋時間の日単位。「48時間」は「公開日（太平洋時間）を含む2日間」、「7日」は7日間、「28日」は28日間の累計とする
- 集計は2〜3日遅れる。まだ集計されていない、またはその日数に達していない時点は「未到達」とする
- 公開後の推移には、新規／リピーター別の数字とクリック率は入れない（APIで取れず、CSVを日数ごとに書き出すのは手間が大きすぎる）

## レポート

数字の列ごとに出典を書く（`[Studio]` / `[Analytics API]` / `[文字起こし]`）。

### 全動画（`own/report.md`）

通常動画・ショート・ライブは、それぞれ別の節にする（本数が0の種類は出さない）。

1. **チャンネル全体**：再生のうち新規の割合、平均視聴率の中央値（新規／リピーター）、クリック率の中央値
2. **動画ごとの表**：タイトル／公開からの日数／尺／7日時点の再生数／再生数（新規・リピーター、通算）／平均視聴時間・平均視聴率（新規・リピーター）／インプレッション数／クリック率／流入元の上位
   - 通算の数は公開時期で大きさが変わるため、**判断には率と「同じ日数の数」だけを使い、中央値と比べて↑↓をつける**
3. **動画ごとの維持率**：冒頭30秒の維持率、離脱場所の上位3つ、見返された場所、`relativeRetentionPerformance`（参考）
4. **型ごとのまとめ**（`MIN_GROUP_VIDEOS` 本以上のときだけ）：`own/tags.csv`（`video_id,type`）があれば、型ごとに新規の平均視聴率とクリック率を出す。2本以上ある型だけを出す
5. **上位・下位の比較**（`MIN_GROUP_VIDEOS` 本以上のときだけ）：7日時点の再生数の上位4分の1と下位4分の1で、各指標の中央値を並べる

### 1本の振り返り（`own/videos/<id>.md`）

| 項目 | 中身 | 出典 |
|---|---|---|
| 公開後の推移 | 48時間・7日・28日時点の再生数・平均視聴率・平均視聴時間・登録者の増加。同じ種類（通常／ショート／ライブ）の他の動画の、同じ時点の中央値と並べる | Analytics API |
| 新規／リピーター・クリック率 | 公開からの通算。チャンネルの中央値と比べる | Studio CSV |
| 流入元 | 種類ごとの割合。YouTube検索なら検索語の上位、関連動画ならどの動画の横に出たかの上位 | Analytics API |
| 維持率 | 冒頭30秒、離脱場所の上位3つ、見返された場所。**それぞれに、その時点のチャプター（概要欄から）と発言（文字起こしの前後数行）を添える** | Analytics API ＋ 文字起こし |
| 冒頭の発言 | 最初の30秒の文字起こし（何を言って、何を約束したか） | 文字起こし |

### 離脱場所の判定

- **冒頭と途中を分ける。** 冒頭の数％はどの動画でも大きく落ちるため、同じ順位に入れると毎回冒頭が1位になる
- **隣の点との差ではなく、数％幅の窓での変化で見る。** 100点の曲線は隣どうしの差がノイズで揺れる
- 窓の幅、冒頭とみなす範囲、「落ちた」とみなす大きさは、ユーザーが実装する（`detectDrops()`、5〜10行）。関数の形と周辺はClaudeが用意する

## 仮説検証（SKILL.md のパートC）

スクリプトはデータを揃えるまで。仮説を立てて検証するのは、スキルの手順（Claude と運用者）で行う。既存のパートAと同じく、仮説に番号をつけ、予測 → 結果 → 判定を書き、台帳に残す。

0. **何を「伸びた」とするかを決める**：ヒアリングで聞いたチャンネルの目的から、重く見る指標を決めて書く（例：新しい視聴者を増やしたい → 新規の再生数とブラウジングからの流入、リピーターを育てたい → リピーターの平均視聴率、登録者を増やしたい → 登録者の増加）。既定は7日時点の再生数
1. **伸びた・伸びなかったを分ける**：同じ種類の動画の中で、公開7日時点の指標で並べる（同じ日数なので公平）。7日に達していない動画は外す。`MIN_GROUP_VIDEOS` 本未満なら上位と下位の数本を、以上なら上位・下位の4分の1を比べる
2. **差を並べる**：上位と下位の動画で、流入元・新規の割合・クリック率・冒頭30秒の維持率・離脱場所とその時の発言・題材（ラッコの検索数はキャッシュを先に見る）を並べる
3. **仮説を立てる（H1〜）**：それぞれに「正しければ何が見えるはずか」を1行で書く。予測を書けない仮説は検証の対象にしない
   - まず流入元で絞る。ブラウジング・関連動画で伸びたならサムネ・タイトル・冒頭を、検索で伸びたなら検索語と題材を見る
4. **今あるデータで確かめる**：支持／否定／保留を判定する。本数が少ないと多くが「保留」になる。**そう正直に書く**
5. **次の動画で確かめる**：保留の仮説から1つ選び、次の動画の企画で試す。**公開前に**予測（例：「冒頭30秒の維持率が中央値より5pt高くなる」）を台帳に書き、公開7日後に判定する
6. 返答の最後に、運用者への問いを1〜2個置く（既存の原則どおり）

台帳は、既存のパートA・Bと同じ台帳に、自分のチャンネルの仮説として記録する（番号は `O1` 〜 とし、ベンチマークの仮説と区別する）。

## エラー時の扱い

| 状況 | 動き |
|---|---|
| `.env` にOAuthクライアントがない | 止めて、READMEの手順の場所を示す |
| リフレッシュトークンが失効（`invalid_grant`） | 止めて「`own_auth.ts` をもう一度実行」と出す |
| 再生が少なく、維持率の曲線が返らない | その動画は「曲線なし（再生が少ない）」とし、ほかは続ける |
| 文字起こしが取れない（字幕なし、ライブラリが動かない、429が続く） | その動画は「文字起こしなし」とし、ほかは続ける。字幕ファイルを置く代わりの方法を出す |
| CSVに想定した列がない | 見つからない列の名前を警告し、その項目はレポートで空欄にする |
| CSVの動画が `videos.json` にない | 警告し、`fetch_channel.ts` の再実行を促す |
| トークン・シークレット | ログにも画面にも出さない。`.env` に追記するだけ |

OAuthの同意画面が「テスト」状態だと、リフレッシュトークンは7日で失効する。個人で使う場合は「本番環境」にすれば失効しない（「確認されていないアプリ」の警告は出る）。READMEに書く。

文字起こしは非公式の内部APIを使うため、YouTube側の変更で動かなくなることがある。取り過ぎると制限されるため、保存済みは取り直さず、1本ずつ間隔を空ける。READMEに書く。

## テスト

- Node標準の `node:test` を使う。`node --test` で実行（`.ts` のテストもそのまま動く）。`npm run typecheck` も通す
- 純粋な関数だけを単体テストする：本数による切り替え（`MIN_GROUP_VIDEOS` の前後）、種類ごとの分け方、CSVの正規化（フィクスチャは実際の書き出しのヘッダー＋ダミー値）、離脱場所の判定（手で作った曲線）、中央値との比較、公開後N日の累計、字幕ファイル（.srt / .sbv）の変換、離脱の秒数から文字起こしの行を引く処理
- OAuth・Analytics API・文字起こしの取得は、ユーザーのチャンネルで一度通しで確かめる。モックは作らない

## やらないこと

- Reporting API（CTRのバルクレポート）
- 新規／リピーター別の維持率の曲線（APIが対応していない）
- CSVの書き出しの自動化（Studioにはそのための公開APIがない）
- 字幕の公式APIでの取得（編集権限が必要になるため）
- 仮説の自動生成（スクリプトはデータを揃えるまで。仮説はスキルの手順で立てる）
- ベンチマークとの比較（文字起こしはベンチマークにも使えるが、比較の手順は別の設計にする）

## 実装計画での変更

実装計画（`docs/superpowers/plans/2026-09-28-own-channel-analytics.md`）で、次のように決めた。

- Analytics API の保存先は、動画ごとに1ファイル `own/analytics/<id>.json` にまとめ、どの日までデータがあるかは `own/meta.json` に置く（上の構成図の `own/retention/` `own/daily/` `own/traffic/` の代わり）
- `getAccessToken()` と `ytAnalytics()` は `lib` ではなく `scripts/own/analytics_api.ts` に置く
- 維持率の曲線は `creatorContentType` で絞れないため、動画の種類は別のリクエストで取る
- ブラウジング機能の流入元の値は `BROWSE`
- Studio CSV は `own/studio/{all,new,returning}/` に置く（フィルタの情報がCSVに入らないため、フォルダで区別する）
