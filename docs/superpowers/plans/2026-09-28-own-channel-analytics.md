# 自分のチャンネルの分析 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** どのチャンネルでも、新しい視聴者／リピーター別の数字・公開後の推移・維持率と離脱場所・流入元・文字起こしを揃えて、全動画と1本ごとの振り返りレポートを出し、スキルの手順で「伸びた理由」を仮説検証できるようにする。

**Architecture:** 既存の `scripts/*.mjs` を TypeScript に移し、Node の型の除去でビルドなしに実行する。データの取得（Analytics API・Studio CSV・文字起こし）は CLI ごとに分け、計算と表示は `scripts/own/` の純粋な関数に置いてテストする。仮説を立てて検証するのはスクリプトではなく、SKILL.md のパートCの手順で行う。

**Tech Stack:** Node 22.18以上（`.ts` を直接実行）、TypeScript 7（型の確認のみ）、`node:test`、`youtube-transcript-plus`、YouTube Analytics API v2（OAuth、`yt-analytics.readonly`）

**Spec:** `docs/superpowers/specs/2026-09-28-own-channel-analytics-design.md`

## Global Constraints

- 動作環境は Node 22.18以上（`package.json` の `engines.node` は `>=22.18`）
- 実行時の依存は `youtube-transcript-plus` のみ。開発時の依存は `typescript` と `@types/node` のみ
- `tsconfig.json` は `strict`、`noEmit`、`allowImportingTsExtensions`、`erasableSyntaxOnly`、`verbatimModuleSyntax`。`enum`・名前空間・引数プロパティは使わない
- import は拡張子まで書く（`./lib.ts`）。型だけの import は `import type` か `type` 修飾子を使う
- OAuth のスコープは `https://www.googleapis.com/auth/yt-analytics.readonly` のみ
- トークン・シークレット・APIキーは、画面にもログにも出さない。`.env` に書くだけ
- `.env` と `data/` はコミットしない（既存の `.gitignore` のまま）
- 通常動画・ショート・ライブを混ぜて中央値や比較を出さない
- 本数による切り替えの基準は `MIN_GROUP_VIDEOS = 10`（`scripts/own/metrics.ts` の1か所だけに置く）
- 文字起こしの取得は、ネットワークに行く本数が 20 本を超えるときは `--yes` がないと止まる
- レポートの数字には出典を付ける（`[Studio]` / `[API]` / `[文字起こし]`）
- コメント・メッセージ・レポートは日本語。既存のスクリプトの書き方（先頭の使い方コメント、`console.error` で進み具合、`console.log` で結果）に合わせる
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける

## Review Focus

1. **公開直後の動画・集計の遅れ**：公開から2日未満、または Analytics API がまだその日を集計していない動画でも、レポートは落ちずに「未到達」と出す（Task 2・Task 9 のテスト）
2. **尺が短い・尺0の動画**：30秒以下の動画は冒頭30秒の維持率を出さない。尺0（取得できない動画）で割り算しない（Task 2・Task 3 のテスト）
3. **Studio CSV の揺れ**：「合計」「Total」の行、千区切り（`"1,234"`）、全角の括弧（`（%）`）、空欄・「—」、BOM、英語UI の列名を正しく読む（Task 5 のテスト）
4. **概要欄の本文中の時刻**：「詳しくは 1:23 で」のように行の途中にある時刻をチャプターと誤認しない（Task 4 のテスト）
5. **既存の `.env` を壊さない**：末尾に改行がない、同じキーがすでにある、値に `$` を含む場合でも、ほかの行を残して1行だけ書き換える（Task 6 のテスト）

## 設計書からの変更点（実装上の判断）

- Analytics API の保存先は、設計書の `own/retention/` `own/daily/` `own/traffic/` の3つではなく、動画ごとに1ファイル `own/analytics/<id>.json` にまとめる。どの日までデータがあるかは `own/meta.json` に置く。読み込みが1か所で済むため
- `getAccessToken()` と `ytAnalytics()` は `lib.ts` ではなく `scripts/own/analytics_api.ts` に置く。`lib.ts` は既存のスクリプトと共有する小さな道具に留める
- 維持率の曲線は `creatorContentType` で絞れない（APIの制約）。動画の種類は別のリクエストで取る
- ブラウジング機能の流入元の値は `BROWSE`（`SUBSCRIBER` は「登録チャンネル」）

## ファイル構成

| ファイル | 役割 |
|---|---|
| `package.json`, `tsconfig.json`, `package-lock.json` | 新規。依存・型の確認・テストのコマンド |
| `scripts/lib.ts` | `lib.mjs` から移す。`Channel`・`Video` の型を足す |
| `scripts/lib.mjs` | `export * from './lib.ts';` の1行だけ（`data/*/why/classify.mjs` のため） |
| `scripts/{fetch_channel,analyze_channel,correlate,rakko_cache,search_compare,find_similar}.ts` | `.mjs` から移す。振る舞いは変えない |
| `examples/classify.example.ts` | `.mjs` から移す（型の確認の対象外。コピーして使うひな形） |
| `scripts/own/types.ts` | 自分のチャンネル分析で使う型 |
| `scripts/own/metrics.ts` | 日付（太平洋時間）、公開後N日の累計、中央値との比較、本数による切り替え、上位・下位 |
| `scripts/own/retention.ts` | 冒頭の維持率、見返し、離脱場所（`detectDrops` はユーザーが書く） |
| `scripts/own/transcript.ts` | 字幕ファイルの変換、チャプター、秒から発言を引く |
| `scripts/own/studio_csv.ts` | Studio CSV の列の対応づけと値の変換 |
| `scripts/own/analytics_api.ts` | アクセストークン、Analytics API の呼び出し |
| `scripts/own/oauth.ts` | PKCE、承認URL、`.env` の1行の書き換え |
| `scripts/own/analytics_parse.ts` | Analytics API の行を型に変換、取り直しの判断 |
| `scripts/own/targets.ts` | 対象の動画の選び方、引数、確認の要否 |
| `scripts/own/load.ts` | `data/<slug>` から全データを読む |
| `scripts/own/report.ts` | 全動画・1本のレポートの文章を作る |
| `scripts/own_auth.ts` | 初回だけのOAuth |
| `scripts/fetch_own_analytics.ts` | Analytics API から取って保存 |
| `scripts/fetch_transcript.ts` | 文字起こしを取って保存 |
| `scripts/import_studio.ts` | Studio CSV を取り込む |
| `scripts/analyze_own.ts` | レポートを出す |
| `tests/own/*.test.ts` | 純粋な関数のテスト |
| `tests/fixtures/sample-channel/` | 移行の確認に使う合成データ |
| `README.md`, `CLAUDE.md`, `.env.example`, `skills/youtube-channel-research/SKILL.md` | 手順とコマンドの更新、パートC |

---

### Task 1: TypeScript の土台と既存スクリプトの移行

**Files:**
- Create: `package.json`, `tsconfig.json`, `tests/fixtures/sample-channel/{channel.json,videos.json,keywords.csv,volumes.csv}`
- Move: `scripts/*.mjs` → `scripts/*.ts`、`examples/classify.example.mjs` → `examples/classify.example.ts`
- Create: `scripts/lib.mjs`（1行の中継）
- Modify: `scripts/lib.ts`（型を付ける）、ほかの `scripts/*.ts`（型の確認が通る最小限の注釈）、`README.md`、`CLAUDE.md`、`skills/youtube-channel-research/SKILL.md`

**Interfaces:**
- Produces: `scripts/lib.ts` の `ROOT: string`、`interface Channel`、`interface Video`、`loadEnv(): void`、`requireApiKey(): string`、`yt(key, endpoint, params): Promise<any>`、`quotaUsed(): number`、`parseChannelArg(arg): { id?: string; handle?: string } | null`、`isoDurationToSec(d): number`、`median(a: readonly (number | null | undefined)[]): number | null`、`fmt(n: number | null | undefined): string`、`toCsv(rows, cols): string`、`parseCsv(text): Record<string, string>[]`、`spearman(x, y): { rho: number; n: number; p: number | null }`、`slug(s): string`

- [ ] **Step 1: Node のバージョンを確かめる**

Run: `node -v`
Expected: `v22.18.0` 以上。低ければ `nvm install 22 && nvm use 22`（または環境の方法で22.18以上にする）

- [ ] **Step 2: 移行前の出力と比べるための合成データを作る**

```bash
mkdir -p tests/fixtures/sample-channel && node - <<'EOF'
const fs = require('fs');
const dir = 'tests/fixtures/sample-channel';
const titles = ['【決算】トヨタの決算を解説', '【用語】PERとは何か', '【速報】日経平均が急落', '【決算】ソニーの決算', '【用語】配当性向の違い', '【速報】円安が加速', '【決算】任天堂の決算', '【用語】ROEの本質', '【速報】利下げの影響', '【決算】キーエンスの決算', 'ショート：PER', 'ライブ：質問に答える'];
const videos = titles.map((title, i) => {
  const id = ('vid' + String(i).padStart(2, '0')).padEnd(11, 'x');
  return {
    id, url: 'https://www.youtube.com/watch?v=' + id,
    publishedAt: new Date(Date.UTC(2026, i % 9, 1 + i, 9)).toISOString(),
    title, views: 1000 * (i + 1) * ((i % 3) + 1), likes: 10 * i, comments: i,
    durationSec: i === 10 ? 45 : 600 + 30 * i, isShortLikely: i === 10, isLive: i === 11,
    tags: ['株', '投資'], categoryId: '27', description: '0:00 はじめに\n1:30 本題\nhttps://example.com',
  };
}).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
const channel = { id: 'UCxxxxxxxxxxxxxxxxxxxxxx', handle: '@sample', title: 'サンプルチャンネル', description: 'テスト用', publishedAt: '2025-01-01T00:00:00Z', country: 'JP', subscriberCount: 12000, viewCount: 500000, videoCount: 12, keywords: '株', fetchedAt: '2026-09-28T00:00:00.000Z' };
fs.writeFileSync(dir + '/channel.json', JSON.stringify(channel, null, 2));
fs.writeFileSync(dir + '/videos.json', JSON.stringify(videos, null, 2));
const kw = [['vid00xxxxxx', 'トヨタ 株価', '銘柄名'], ['vid03xxxxxx', 'ソニー 株価', '銘柄名'], ['vid06xxxxxx', '任天堂 株価', '銘柄名'], ['vid09xxxxxx', 'キーエンス 株価', '銘柄名'], ['vid01xxxxxx', 'PER', '用語'], ['vid04xxxxxx', '配当性向', '用語'], ['vid07xxxxxx', 'ROE', '用語'], ['vid02xxxxxx', '日経平均', '時事']];
fs.writeFileSync(dir + '/keywords.csv', 'video_id,keyword,type\n' + kw.map((r) => r.join(',')).join('\n') + '\n');
const vol = [['トヨタ 株価', 450000], ['ソニー 株価', 300000], ['任天堂 株価', 200000], ['キーエンス 株価', 90000], ['PER', 60000], ['配当性向', 40000], ['ROE', 50000], ['日経平均', 900000]];
fs.writeFileSync(dir + '/volumes.csv', 'keyword,search_volume\n' + vol.map((r) => r.join(',')).join('\n') + '\n');
EOF
```

- [ ] **Step 3: 移行前の出力を保存する**

```bash
M="${TMPDIR:-/tmp}/own-migration" && rm -rf "$M" && mkdir -p "$M" && cp -r tests/fixtures/sample-channel "$M/before" \
  && node scripts/analyze_channel.mjs "$M/before" \
  && node scripts/correlate.mjs "$M/before" --since 2026-01 \
  && node scripts/rakko_cache.mjs missing "$M/before" > "$M/before/missing.json" 2> "$M/before/missing.err" \
  && ls "$M/before"
```

Expected: `summary.md`、`correlation.md`、`missing.json` がある

- [ ] **Step 4: `package.json` と `tsconfig.json` を作り、依存を入れる**

`package.json`:

```json
{
  "name": "channel-research",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.18" },
  "scripts": {
    "test": "node --test \"tests/**/*.test.ts\"",
    "typecheck": "tsc -p ."
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["scripts/**/*.ts", "tests/**/*.ts"]
}
```

`examples/` は `data/<slug>/why/` にコピーして使うひな形で、相対パスがコピー先を前提にしているため、型の確認から外す。

```bash
npm install youtube-transcript-plus@^2.0.3 && npm install -D typescript @types/node
```

- [ ] **Step 5: `.mjs` を `.ts` に移し、import と使い方の表記を直す**

```bash
for f in scripts/*.mjs; do git mv "$f" "${f%.mjs}.ts"; done
git mv examples/classify.example.mjs examples/classify.example.ts
sed -i.bak 's/\.mjs/.ts/g' scripts/*.ts examples/classify.example.ts && rm -f scripts/*.bak examples/*.bak
```

`sed` は import（`./lib.mjs` → `./lib.ts`）と、先頭コメントの使い方（`node scripts/xxx.mjs` → `.ts`）の両方を直す。

- [ ] **Step 6: `scripts/lib.ts` に型を付ける**

`scripts/lib.ts` 全体を次にする（振る舞いは `lib.mjs` と同じ。`yt` の `URLSearchParams` だけ、数値を `String()` で文字列にしてから渡す。実行結果は同じ）:

```ts
// 共通ユーティリティ（Node 22.18+。.ts をビルドなしで直接実行する）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// fetch_channel.ts が保存するチャンネル情報（data/<slug>/channel.json）
export interface Channel {
  id: string;
  handle: string;
  title: string;
  description: string;
  publishedAt: string;
  country?: string;
  subscriberCount: number | null;
  viewCount: number;
  videoCount: number;
  keywords: string;
  fetchedAt: string;
}

// fetch_channel.ts が保存する動画（data/<slug>/videos.json の1件）
export interface Video {
  id: string;
  url: string;
  publishedAt: string;
  title: string;
  views: number;
  likes: number | null;
  comments: number | null;
  durationSec: number;
  isShortLikely: boolean;
  isLive: boolean;
  tags: string[];
  categoryId: string;
  description: string;
}

// .env を読み込む（既に環境変数があればそちらを優先）
export function loadEnv(): void {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

export function requireApiKey(): string {
  loadEnv();
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.error('YOUTUBE_API_KEY が見つかりません。.env に YOUTUBE_API_KEY=... を書いてください（README参照）。');
    process.exit(1);
  }
  return key;
}

// YouTube Data API v3 呼び出し。キーはURLではなくヘッダーで渡す
// 戻り値の形は endpoint ごとに違うため、呼び出し側で必要な所だけを読む
let unitsUsed = 0;
const UNIT_COST: Record<string, number> = { search: 100 };
export async function yt(key: string, endpoint: string, params: Record<string, string | number>): Promise<any> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const url = 'https://www.googleapis.com/youtube/v3/' + endpoint + '?' + query;
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': key } });
  const json: any = await res.json();
  unitsUsed += UNIT_COST[endpoint] ?? 1;
  if (!res.ok || json.error) {
    const msg = json.error?.message || res.statusText;
    throw new Error(`YouTube API エラー (${endpoint}, HTTP ${res.status}): ${msg}`);
  }
  return json;
}
export const quotaUsed = (): number => unitsUsed;

// "@handle" / URL / チャンネルID(UC...) を受け付ける
export function parseChannelArg(arg: string | undefined): { id?: string; handle?: string } | null {
  if (!arg) return null;
  const s = arg.trim();
  const idMatch = s.match(/(UC[0-9A-Za-z_-]{22})/);
  if (idMatch) return { id: idMatch[1] };
  const h = s.match(/@([^/?#\s]+)/);
  if (h) return { handle: '@' + decodeURIComponent(h[1]) };
  return { handle: s.startsWith('@') ? s : '@' + s };
}

// ISO 8601 の再生時間 (PT1H2M3S) を秒に
export function isoDurationToSec(d: string | undefined): number {
  const m = (d || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}

export const median = (a: readonly (number | null | undefined)[]): number | null => {
  const s = a.filter((x): x is number => Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export const fmt = (n: number | null | undefined): string =>
  n == null ? '-' : n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n).toLocaleString('ja-JP');

export function toCsv(rows: readonly Record<string, unknown>[], cols: readonly string[]): string {
  const esc = (v: unknown): string => {
    const s = Array.isArray(v) ? v.join('|') : v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

// 簡易CSVパーサ（ダブルクォート対応）
export function parseCsv(text: string): Record<string, string>[] {
  text = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((x) => x !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

// スピアマン順位相関（同順位は平均順位）
export function spearman(x: number[], y: number[]): { rho: number; n: number; p: number | null } {
  const rank = (a: number[]): number[] => {
    const idx = a.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(a.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x), ry = rank(y), n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  const rho = num / Math.sqrt(dx * dy);
  // t近似による両側p値（n>=10目安）
  const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
  const p = n > 3 ? 2 * (1 - studentTCdf(Math.abs(t), n - 2)) : null;
  return { rho, n, p };
}

function studentTCdf(t: number, df: number): number {
  // 正則化不完全ベータ関数で t分布CDF
  const x = df / (df + t * t);
  return 1 - 0.5 * incBeta(x, df / 2, 0.5);
}
function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta);
  if (x < (a + 1) / (a + b + 2)) return (front * cf(x, a, b)) / a;
  return 1 - (front * cf(1 - x, b, a)) / b;
}
function cf(x: number, a: number, b: number): number {
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d);
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d);
    c = 1 + aa / c; c = Math.abs(c) < 1e-30 ? 1e-30 : c;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d);
    c = 1 + aa / c; c = Math.abs(c) < 1e-30 ? 1e-30 : c;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function lgamma(z: number): number {
  const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function slug(s: string): string {
  return String(s).replace(/^@/, '').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'channel';
}
```

注意：`toCsv` と `parseCsv` の `'﻿'` は、元のファイルと同じく BOM（U+FEFF）の1文字。コピーで消えないよう、元の `lib.mjs` の該当行から写す。

- [ ] **Step 7: 型の確認を回し、ほかのスクリプトの型エラーを直す**

Run: `npm run typecheck`
Expected: 初回は、`analyze_channel.ts`・`correlate.ts`・`find_similar.ts`・`search_compare.ts`・`rakko_cache.ts`・`fetch_channel.ts` で型エラーが出る（lib.ts を型付けしたあとで約120件の見込み。大半は「引数の型がない」）

直し方（**振る舞いを変える修正はしない**）:
- `videos.json` を読む所は `const all: Video[] = JSON.parse(...)`、`channel.json` は `Channel` にする（`import { ..., type Video, type Channel } from './lib.ts'`）
- コールバックの引数は、元になる配列に型が付けば推論される。付かない所だけ注釈する（例：`(v: Video) => ...`）
- 集計用の辞書は `Record<string, number>` / `Record<string, Video[]>` などにする
- `JSON.parse` の結果で形が決まらないもの（ラッコのキャッシュ、Data API の検索結果）は、使う項目だけを持つ `interface` を各ファイルの中に書く。`any` は `yt()` の戻り値を受ける所だけに留める
- `process.argv` から取る値は `string | undefined` になる。元の動きが「なければ null」なら `?? null` で揃える

もう一度 Run: `npm run typecheck`
Expected: エラー0件で終わる

- [ ] **Step 8: `scripts/lib.mjs` を1行の中継として残す**

`scripts/lib.mjs`:

```js
// 互換用：data/<slug>/why/classify.mjs（git管理外）が ../../../scripts/lib.mjs を読んでいるため残す。中身は lib.ts
export * from './lib.ts';
```

確認:

```bash
M="${TMPDIR:-/tmp}/own-migration" && mkdir -p "$M/shim" && printf "import { median } from '%s/scripts/lib.mjs';\nconsole.log(median([3, 1, 2]));\n" "$PWD" > "$M/shim/check.mjs" && node "$M/shim/check.mjs"
```

Expected: `2`

- [ ] **Step 9: 移行後の出力が移行前と同じかを確かめる**

```bash
M="${TMPDIR:-/tmp}/own-migration" && rm -rf "$M/after" && cp -r tests/fixtures/sample-channel "$M/after" \
  && node scripts/analyze_channel.ts "$M/after" \
  && node scripts/correlate.ts "$M/after" --since 2026-01 \
  && node scripts/rakko_cache.ts missing "$M/after" > "$M/after/missing.json" 2> "$M/after/missing.err" \
  && diff -r "$M/before" "$M/after" && echo SAME
```

Expected: `SAME`（差分があれば、移行で振る舞いが変わっている。Step 7 の修正を見直す）

- [ ] **Step 10: ドキュメントのコマンドを `.ts` に直す**

```bash
sed -i.bak 's/\.mjs/.ts/g' README.md CLAUDE.md skills/youtube-channel-research/SKILL.md && rm -f README.md.bak CLAUDE.md.bak skills/youtube-channel-research/SKILL.md.bak
```

`README.md` のセットアップの「1. **Node 18以上**が必要です。依存パッケージはありません」を次に置き換える:

```markdown
1. **Node 22.18以上**が必要です（`.ts` のスクリプトをビルドなしで直接実行します）。このディレクトリで `npm install` を実行し、依存パッケージ（文字起こし用の `youtube-transcript-plus`）を入れます
```

`README.md` のセットアップの手順0（スキルを配置）の末尾に、次の1行を足す:

```markdown
   - このリポジトリを更新したら、配置済みのスキルもコピーし直してください（古いコマンドのままになるため）
```

- [ ] **Step 11: コミット**

```bash
git add -A package.json package-lock.json tsconfig.json scripts examples tests README.md CLAUDE.md skills
git commit -m "既存のスクリプトをTypeScriptに移す

node で .ts を直接実行する（Node 22.18以上）。振る舞いは変えず、合成データで移行前後の出力が同じことを確かめた。
data/*/why/classify.mjs のために scripts/lib.mjs は lib.ts への中継として残す。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 型と、公開後の累計・中央値との比較

**Files:**
- Create: `scripts/own/types.ts`, `scripts/own/metrics.ts`
- Test: `tests/own/metrics.test.ts`

**Interfaces:**
- Consumes: `lib.ts` の `Channel`, `Video`
- Produces:
  - `types.ts`: `ContentType`, `DailyRow`, `RetentionPoint`, `TrafficRow`, `TrafficDetailRow`, `OwnAnalytics`, `OwnMeta`, `ViewerType`, `StudioRow`, `StudioFile`, `Segment`, `TranscriptFile`, `Chapter`, `VideoData`, `OwnData`（定義は Step 3）
  - `metrics.ts`: `MIN_GROUP_VIDEOS = 10`, `WINDOWS = [2, 7, 28]`, `WINDOW_LABEL: Record<number, string>`, `toPtDate(iso: string): string`, `addDays(ymd: string, n: number): string`, `interface Cumulative`, `cumulativeAt(daily, publishedPt, days, durationSec, dataThrough): Cumulative | null`, `type Mark`, `markVsMedian(value, med, tolerance?): Mark`, `type AnalysisMode = 'single' | 'group'`, `analysisMode(n): AnalysisMode`, `topBottom<T>(items, score, mode): { top: T[]; bottom: T[] }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/own/metrics.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, analysisMode, cumulativeAt, markVsMedian, MIN_GROUP_VIDEOS, topBottom, toPtDate } from '../../scripts/own/metrics.ts';
import type { DailyRow } from '../../scripts/own/types.ts';

const day = (d: string, views: number, minutes: number, subs = 0): DailyRow => ({
  day: d, views, estimatedMinutesWatched: minutes, averageViewDuration: 0, averageViewPercentage: 0, subscribersGained: subs,
});

test('toPtDate: 日本の朝の公開は、太平洋時間では前日になる', () => {
  assert.equal(toPtDate('2026-09-10T00:30:00Z'), '2026-09-09');
  assert.equal(toPtDate('2026-01-10T12:00:00Z'), '2026-01-10');
});

test('addDays: 月をまたぐ', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-09-09', 27), '2026-10-06');
  assert.equal(addDays('2026-09-09', -10), '2026-08-30');
});

const daily = [day('2026-09-09', 100, 200, 3), day('2026-09-10', 50, 100, 1), day('2026-09-11', 10, 20)];

test('cumulativeAt: 公開日を含む2日間の累計と、視聴時間から計算した平均', () => {
  const c = cumulativeAt(daily, '2026-09-09', 2, 600, '2026-09-20');
  assert.deepEqual(c, { views: 150, minutes: 300, avgViewDurationSec: 120, avgViewPercentage: 20, subscribersGained: 4 });
});

test('cumulativeAt: まだその日数分のデータがなければ null（未到達）', () => {
  assert.equal(cumulativeAt(daily, '2026-09-09', 28, 600, '2026-09-20'), null);
  assert.equal(cumulativeAt([], '2026-09-27', 2, 600, '2026-09-27'), null);
});

test('cumulativeAt: 再生0なら平均は null。尺0なら平均視聴率は null（割り算しない）', () => {
  assert.deepEqual(cumulativeAt([], '2026-09-01', 2, 600, '2026-09-20'), { views: 0, minutes: 0, avgViewDurationSec: null, avgViewPercentage: null, subscribersGained: 0 });
  assert.equal(cumulativeAt(daily, '2026-09-09', 2, 0, '2026-09-20')?.avgViewPercentage, null);
});

test('markVsMedian: 5%を超えて上下したら矢印', () => {
  assert.equal(markVsMedian(110, 100), '↑');
  assert.equal(markVsMedian(90, 100), '↓');
  assert.equal(markVsMedian(103, 100), '→');
  assert.equal(markVsMedian(null, 100), '');
  assert.equal(markVsMedian(5, null), '');
  assert.equal(markVsMedian(5, 0), '↑');
});

test('analysisMode: MIN_GROUP_VIDEOS 本から群の比較', () => {
  assert.equal(analysisMode(MIN_GROUP_VIDEOS - 1), 'single');
  assert.equal(analysisMode(MIN_GROUP_VIDEOS), 'group');
});

test('topBottom: 少ないときは最大3本ずつ、多いときは4分の1ずつ。下位は悪い順。null は外す', () => {
  const s = (xs: (number | null)[]) => xs;
  const few = topBottom(s([3, 5, null, 1, 4, 2]), (x) => x, 'single');
  assert.deepEqual(few, { top: [5, 4], bottom: [1, 2] });
  const many = topBottom(s([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), (x) => x, 'group');
  assert.deepEqual(many, { top: [12, 11, 10], bottom: [1, 2, 3] });
  assert.deepEqual(topBottom(s([7]), (x) => x, 'single'), { top: [], bottom: [] });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/own/metrics.test.ts`
Expected: FAIL（`Cannot find module '.../scripts/own/metrics.ts'`）

- [ ] **Step 3: 型を書く**

`scripts/own/types.ts`:

```ts
// 自分のチャンネル分析で使う型（data/<slug>/own/ などに保存する形）
import type { Channel, Video } from '../lib.ts';

// Analytics API の creatorContentType
export type ContentType = 'VIDEO_ON_DEMAND' | 'SHORTS' | 'LIVE_STREAM' | 'STORY' | 'UNSPECIFIED';

// 動画の日ごとの数字（dimensions=day）。day は太平洋時間の YYYY-MM-DD
export interface DailyRow {
  day: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
}

// 維持率の曲線の1点。ratio は動画の位置（0.01〜1.00）、watchRatio はその位置で見ている人の割合（1を超えることもある）
export interface RetentionPoint {
  ratio: number;
  watchRatio: number;
  relative: number | null; // relativeRetentionPerformance（同じ長さの動画との比較。0.5が平均）
}

export interface TrafficRow { source: string; views: number; minutes: number; }
export interface TrafficDetailRow { detail: string; views: number; }

// own/analytics/<videoId>.json
export interface OwnAnalytics {
  videoId: string;
  fetchedAt: string;
  dailyThrough: string; // 取得した時点で、どの日までデータがあったか（太平洋時間）
  contentType: ContentType;
  daily: DailyRow[]; // 公開日から最大28日分
  retention: RetentionPoint[] | null; // 再生が少ないと null
  traffic: TrafficRow[];
  trafficDetail: { YT_SEARCH: TrafficDetailRow[]; RELATED_VIDEO: TrafficDetailRow[] };
}

// own/meta.json
export interface OwnMeta { dataThrough: string; fetchedAt: string; }

export type ViewerType = 'all' | 'new' | 'returning';

// own/studio.json の1行。値は Studio の表示のまま（平均視聴率・クリック率は％）
export interface StudioRow {
  videoId: string;
  viewerType: ViewerType;
  views: number | null;
  avgViewDurationSec: number | null;
  avgViewPercentage: number | null;
  impressions: number | null;
  ctr: number | null;
}
export interface StudioFile { importedAt: string; rows: StudioRow[]; warnings: string[]; }

// 文字起こしの1行（秒）
export interface Segment { start: number; dur: number; text: string; }
// transcripts/<videoId>.json
export interface TranscriptFile { videoId: string; source: string; lang: string; fetchedAt: string; segments: Segment[]; }

export interface Chapter { start: number; title: string; }

// レポートの入力（load.ts が作る）
export interface VideoData {
  video: Video;
  analytics: OwnAnalytics | null;
  studio: Partial<Record<ViewerType, StudioRow>>;
  transcript: Segment[] | null;
  chapters: Chapter[];
  tag: string | null; // own/tags.csv の型
}
export interface OwnData {
  channel: Channel;
  videos: VideoData[];
  dataThrough: string | null;
  studioImportedAt: string | null;
  now: Date;
}
```

- [ ] **Step 4: 最小の実装を書く**

`scripts/own/metrics.ts`:

```ts
// 公開後の累計、中央値との比較、本数による分析の切り替え
import type { DailyRow } from './types.ts';

// 公開7日のデータがある動画がこの本数以上なら、上位・下位の群の比較と型ごとのまとめを出す
export const MIN_GROUP_VIDEOS = 10;
// 公開後の推移を見る日数。「48時間」は公開日（太平洋時間）を含む2日間
export const WINDOWS = [2, 7, 28] as const;
export const WINDOW_LABEL: Record<number, string> = { 2: '48時間', 7: '7日', 28: '28日' };

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

// ISO日時 → 米国太平洋時間の日付（Analytics API の日付はこれ）
export function toPtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface Cumulative {
  views: number;
  minutes: number;
  avgViewDurationSec: number | null;
  avgViewPercentage: number | null; // 視聴時間と尺から計算（％）
  subscribersGained: number;
}

// 公開日（太平洋時間）から days 日間の累計。dataThrough までに届いていなければ null（未到達）
export function cumulativeAt(daily: DailyRow[], publishedPt: string, days: number, durationSec: number, dataThrough: string): Cumulative | null {
  const end = addDays(publishedPt, days - 1);
  if (end > dataThrough) return null;
  const rows = daily.filter((r) => r.day >= publishedPt && r.day <= end);
  const views = sum(rows.map((r) => r.views));
  const minutes = sum(rows.map((r) => r.estimatedMinutesWatched));
  const avgViewDurationSec = views > 0 ? (minutes * 60) / views : null;
  const avgViewPercentage = avgViewDurationSec != null && durationSec > 0 ? Math.min(100, (avgViewDurationSec / durationSec) * 100) : null;
  return { views, minutes, avgViewDurationSec, avgViewPercentage, subscribersGained: sum(rows.map((r) => r.subscribersGained)) };
}

export type Mark = '↑' | '↓' | '→' | '';

// 中央値より tolerance（割合）を超えて高い／低いか
export function markVsMedian(value: number | null, med: number | null, tolerance = 0.05): Mark {
  if (value == null || med == null) return '';
  if (med === 0) return value > 0 ? '↑' : '→';
  const r = value / med - 1;
  return r > tolerance ? '↑' : r < -tolerance ? '↓' : '→';
}

export type AnalysisMode = 'single' | 'group';
export const analysisMode = (n: number): AnalysisMode => (n >= MIN_GROUP_VIDEOS ? 'group' : 'single');

// 上位と下位。single は最大3本ずつ（半分を超えない）、group は4分の1ずつ。bottom は悪い順
export function topBottom<T>(items: readonly T[], score: (t: T) => number | null, mode: AnalysisMode): { top: T[]; bottom: T[] } {
  const scored = items
    .map((t) => ({ t, s: score(t) }))
    .filter((x): x is { t: T; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s);
  const k = mode === 'group' ? Math.floor(scored.length / 4) : Math.min(3, Math.floor(scored.length / 2));
  return {
    top: scored.slice(0, k).map((x) => x.t),
    bottom: scored.slice(scored.length - k).reverse().map((x) => x.t),
  };
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `node --test tests/own/metrics.test.ts && npm run typecheck`
Expected: PASS（8件）、型エラー0件

- [ ] **Step 6: コミット**

```bash
git add scripts/own/types.ts scripts/own/metrics.ts tests/own/metrics.test.ts
git commit -m "自分のチャンネル分析の型と、公開後の累計・中央値との比較を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 維持率（冒頭・見返し・離脱場所の枠）

**Files:**
- Create: `scripts/own/retention.ts`
- Test: `tests/own/retention.test.ts`

**Interfaces:**
- Consumes: `types.ts` の `RetentionPoint`
- Produces: `OPENING_SEC = 30`, `interface Drop { atSec: number; from: number; to: number; deltaPt: number }`, `interface Rise { atSec: number; from: number; to: number; risePt: number }`, `pointAtSec(points, durationSec, sec): RetentionPoint | null`, `openingRetention(points, durationSec): number | null`, `detectRewatches(points, durationSec, minRisePt?, limit?): Rise[]`, `detectDrops(points, durationSec): Drop[] | null`（**中身はユーザーが書く**。この Task では `null` を返す枠だけを作る）

- [ ] **Step 1: 失敗するテストを書く**

`tests/own/retention.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDrops, detectRewatches, openingRetention, pointAtSec } from '../../scripts/own/retention.ts';
import type { RetentionPoint } from '../../scripts/own/types.ts';

// 100点の曲線。f(ratio) で watchRatio を決める
const curve = (f: (r: number) => number): RetentionPoint[] =>
  Array.from({ length: 100 }, (_, i) => {
    const ratio = Math.round((i + 1)) / 100;
    return { ratio, watchRatio: f(ratio), relative: 0.5 };
  });

// 冒頭で大きく落ち、40%の位置で12pt落ち、それ以外はゆるやかに下がる曲線
const withDrop = curve((r) => (r <= 0.03 ? 1 - r * 8 : 0.76 - r * 0.2 - (r > 0.4 && r <= 0.43 ? (r - 0.4) * 4 : r > 0.43 ? 0.12 : 0)));

test('pointAtSec: いちばん近い位置の点を返す。尺0なら null', () => {
  const pts = curve((r) => 1 - r / 2);
  assert.equal(pointAtSec(pts, 600, 30)?.ratio, 0.05);
  assert.equal(pointAtSec(pts, 0, 30), null);
  assert.equal(pointAtSec([], 600, 30), null);
});

test('openingRetention: 30秒時点の割合。30秒以下の動画は null', () => {
  const pts = curve((r) => 1 - r / 2);
  assert.equal(openingRetention(pts, 600), 1 - 0.05 / 2);
  assert.equal(openingRetention(pts, 30), null);
  assert.equal(openingRetention(pts, 25), null);
});

test('detectRewatches: 曲線が上がった所を、上がった幅の大きい順に返す', () => {
  const pts = curve((r) => (r >= 0.5 && r < 0.55 ? 0.65 : 0.6));
  const rises = detectRewatches(pts, 600);
  assert.equal(rises.length, 1);
  assert.equal(rises[0].atSec, 294); // 0.49 の位置から上がり始める
  assert.ok(Math.abs(rises[0].risePt - 5) < 1e-9);
});

test('detectRewatches: 平らな曲線では何も返さない', () => {
  assert.deepEqual(detectRewatches(curve(() => 0.5), 600), []);
});

// detectDrops はユーザーが実装する。実装するまでは todo として扱う（失敗しても全体は落ちない）
const todo = { todo: 'detectDrops はユーザーが実装する（scripts/own/retention.ts）' };

test('detectDrops: 途中の大きな離脱（40%の位置で約12pt）を見つける', todo, () => {
  const drops = detectDrops(withDrop, 600);
  assert.ok(Array.isArray(drops));
  assert.ok(drops.some((d) => d.atSec >= 230 && d.atSec <= 270 && d.deltaPt <= -8), JSON.stringify(drops));
});

test('detectDrops: 冒頭30秒の落ち込みは、途中の離脱に入れない', todo, () => {
  const drops = detectDrops(withDrop, 600);
  assert.ok(Array.isArray(drops));
  assert.ok(drops.every((d) => d.atSec >= 30), JSON.stringify(drops));
});

test('detectDrops: ±0.5pt の揺れだけの曲線では何も返さない', todo, () => {
  const noisy = curve((r) => 0.6 - r * 0.1 + (Math.round(r * 100) % 2 ? 0.005 : -0.005));
  assert.deepEqual(detectDrops(noisy, 600), []);
});

test('detectDrops: 最大3件で、落ちた幅の大きい順', todo, () => {
  const stairs = curve((r) => 0.9 - (r > 0.2 ? 0.05 : 0) - (r > 0.4 ? 0.1 : 0) - (r > 0.6 ? 0.15 : 0) - (r > 0.8 ? 0.08 : 0));
  const drops = detectDrops(stairs, 1000);
  assert.ok(Array.isArray(drops));
  assert.ok(drops.length <= 3);
  for (let i = 1; i < drops.length; i++) assert.ok(drops[i - 1].deltaPt <= drops[i].deltaPt);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/own/retention.test.ts`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: 実装を書く（`detectDrops` は枠だけ）**

`scripts/own/retention.ts`:

```ts
// 維持率の曲線から、冒頭の維持率・見返された場所・離脱場所を出す
import type { RetentionPoint } from './types.ts';

export const OPENING_SEC = 30;

export interface Drop {
  atSec: number; // 落ち始めの秒
  from: number; // 落ちる前の watchRatio
  to: number; // 落ちた後の watchRatio
  deltaPt: number; // 落ちた幅（％ポイント。負の数）
}
export interface Rise {
  atSec: number;
  from: number;
  to: number;
  risePt: number; // 上がった幅（％ポイント）
}

// sec 秒にいちばん近い位置の点
export function pointAtSec(points: RetentionPoint[], durationSec: number, sec: number): RetentionPoint | null {
  if (!points.length || durationSec <= 0) return null;
  const target = sec / durationSec;
  let best = points[0];
  for (const p of points) if (Math.abs(p.ratio - target) < Math.abs(best.ratio - target)) best = p;
  return best;
}

// 冒頭 OPENING_SEC 秒の時点で残っている割合。OPENING_SEC 秒以下の動画は出さない
export function openingRetention(points: RetentionPoint[], durationSec: number): number | null {
  if (durationSec <= OPENING_SEC) return null;
  return pointAtSec(points, durationSec, OPENING_SEC)?.watchRatio ?? null;
}

// 隣の点より minRisePt 以上上がった所（見返された場所の候補）
export function detectRewatches(points: RetentionPoint[], durationSec: number, minRisePt = 2, limit = 3): Rise[] {
  const out: Rise[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const risePt = (b.watchRatio - a.watchRatio) * 100;
    if (risePt >= minRisePt) out.push({ atSec: Math.round(a.ratio * durationSec), from: a.watchRatio, to: b.watchRatio, risePt });
  }
  return out.sort((x, y) => y.risePt - x.risePt).slice(0, limit);
}

/**
 * 維持率の曲線から、途中で大きく離脱している場所を見つける（ユーザーが実装する）
 *
 * points: 動画の長さを100等分した点。ratio は 0.01〜1.00（動画のどの位置か）、
 *         watchRatio はその位置でまだ見ている人の割合（見返しがあると1を超えることもある）
 * durationSec: 動画の長さ（秒）
 * 戻り値: 落ちた幅の大きい順に最大3件。atSec は落ち始めの秒、deltaPt は落ちた幅（％ポイント、負の数）。
 *         まだ実装していないときは null を返す（レポートに「未実装」と出る）
 *
 * 決めること:
 *  - 窓の幅：何点ぶん（動画の何％ぶん）の変化で見るか。狭いとノイズを拾い、広いと場所がぼやける
 *  - 冒頭の範囲：どこまでを「冒頭」として除くか（例：OPENING_SEC 秒まで、または最初の数％）
 *  - しきい値：何ポイント落ちたら「離脱」とみなすか
 *  - 重なり：近い場所の候補をどうまとめるか
 * テスト: tests/own/retention.test.ts の detectDrops（実装したら todo を外す）
 */
export function detectDrops(points: RetentionPoint[], durationSec: number): Drop[] | null {
  void points;
  void durationSec;
  return null;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `node --test tests/own/retention.test.ts && npm run typecheck`
Expected: pass 4、todo 4、fail 0。型エラー0件

- [ ] **Step 5: コミット**

```bash
git add scripts/own/retention.ts tests/own/retention.test.ts
git commit -m "維持率の冒頭・見返しと、離脱場所の判定の枠を追加

離脱場所の判定（detectDrops）はユーザーが実装する。テストは todo として先に置く。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 文字起こしとチャプター

**Files:**
- Create: `scripts/own/transcript.ts`
- Test: `tests/own/transcript.test.ts`

**Interfaces:**
- Consumes: `types.ts` の `Segment`, `Chapter`
- Produces: `parseSrt(text): Segment[]`, `parseSbv(text): Segment[]`, `fromLibrary(segs: { offset: number; duration: number; text: string }[]): Segment[]`, `decodeEntities(s): string`, `parseChapters(description): Chapter[]`, `chapterAt(chapters, sec): Chapter | null`, `linesAround(segs, sec, before?, after?): Segment[]`, `fmtSec(sec): string`

- [ ] **Step 1: 失敗するテストを書く**

`tests/own/transcript.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterAt, decodeEntities, fmtSec, fromLibrary, linesAround, parseChapters, parseSbv, parseSrt } from '../../scripts/own/transcript.ts';

test('parseSrt: BOM・CRLF・複数行のテキスト', () => {
  const srt = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nこんにちは\r\n\r\n2\r\n00:00:03,500 --> 00:00:06,000\r\n今日は決算の話です\r\n二行目\r\n';
  assert.deepEqual(parseSrt(srt), [
    { start: 1, dur: 2.5, text: 'こんにちは' },
    { start: 3.5, dur: 2.5, text: '今日は決算の話です 二行目' },
  ]);
});

test('parseSbv', () => {
  const sbv = '0:00:01.000,0:00:03.500\nこんにちは\n\n0:01:03.500,0:01:06.000\n今日は\n';
  assert.deepEqual(parseSbv(sbv), [
    { start: 1, dur: 2.5, text: 'こんにちは' },
    { start: 63.5, dur: 2.5, text: '今日は' },
  ]);
});

test('decodeEntities / fromLibrary: 二重に符号化された記号も戻す', () => {
  assert.equal(decodeEntities('A &amp;#39;B&amp;#39; &quot;C&quot; &lt;D&gt;'), 'A \'B\' "C" <D>');
  assert.deepEqual(fromLibrary([{ offset: 1.2, duration: 2, text: 'それは&amp;#39;PER&amp;#39;\nです' }]), [{ start: 1.2, dur: 2, text: 'それは\'PER\' です' }]);
});

test('parseChapters: 行頭の時刻だけを拾う。区切りの記号と時間つきにも対応', () => {
  const desc = '今日の動画です。詳しくは 1:23 で話します\n0:00 はじめに\n1:30 - 決算のポイント\n12:05 まとめ\n1:02:03 おまけ\nhttps://example.com';
  assert.deepEqual(parseChapters(desc), [
    { start: 0, title: 'はじめに' },
    { start: 90, title: '決算のポイント' },
    { start: 725, title: 'まとめ' },
    { start: 3723, title: 'おまけ' },
  ]);
  assert.deepEqual(parseChapters('チャプターなし'), []);
});

test('chapterAt: その秒を含むチャプター。最初より前なら null', () => {
  const ch = [{ start: 10, title: 'A' }, { start: 90, title: 'B' }];
  assert.equal(chapterAt(ch, 100)?.title, 'B');
  assert.equal(chapterAt(ch, 90)?.title, 'B');
  assert.equal(chapterAt(ch, 5), null);
});

test('linesAround: その秒の行と前後。最後より後なら最後の行の周り', () => {
  const segs = [
    { start: 0, dur: 2, text: 'a' }, { start: 2, dur: 2, text: 'b' },
    { start: 4, dur: 2, text: 'c' }, { start: 6, dur: 2, text: 'd' },
  ];
  assert.deepEqual(linesAround(segs, 4).map((s) => s.text), ['b', 'c', 'd']);
  assert.deepEqual(linesAround(segs, 100).map((s) => s.text), ['c', 'd']);
  assert.deepEqual(linesAround([], 4), []);
});

test('fmtSec', () => {
  assert.equal(fmtSec(75), '1:15');
  assert.equal(fmtSec(3723), '1:02:03');
  assert.equal(fmtSec(0), '0:00');
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/own/transcript.test.ts`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: 実装を書く**

`scripts/own/transcript.ts`:

```ts
// 文字起こし（字幕ファイル・ライブラリの結果）とチャプターを扱う
import type { Chapter, Segment } from './types.ts';

const clean = (s: string) => s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const toSec = (h: string, m: string, s: string, frac: string) => +h * 3600 + +m * 60 + +s + +('0.' + frac);

// SubRip（.srt）
export function parseSrt(text: string): Segment[] {
  const out: Segment[] = [];
  for (const block of clean(text).split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const m = lines[i].match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!m) continue;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    out.push({ start: round3(start), dur: round3(end - start), text: lines.slice(i + 1).join(' ').trim() });
  }
  return out;
}

// YouTube の .sbv
export function parseSbv(text: string): Segment[] {
  const out: Segment[] = [];
  for (const block of clean(text).split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const m = lines[0]?.match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,3}),(\d+):(\d{2}):(\d{2})\.(\d{1,3})$/);
    if (!m) continue;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    out.push({ start: round3(start), dur: round3(end - start), text: lines.slice(1).join(' ').trim() });
  }
  return out;
}

// &amp; を先に戻すので、二重に符号化された &amp;#39; も1回で戻る
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(+d));
}

// youtube-transcript-plus の結果（offset・duration は秒）
export function fromLibrary(segs: { offset: number; duration: number; text: string }[]): Segment[] {
  return segs.map((s) => ({ start: s.offset, dur: s.duration, text: decodeEntities(s.text).replace(/\s+/g, ' ').trim() }));
}

// 概要欄のチャプター。行頭の時刻だけを拾う（本文中の「1:23 で」は拾わない）
const CHAPTER = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—:：|]?\s*(.+?)\s*$/;
export function parseChapters(description: string): Chapter[] {
  const out: Chapter[] = [];
  for (const line of clean(description).split('\n')) {
    const m = line.match(CHAPTER);
    if (!m) continue;
    const start = m[1].split(':').map(Number).reduce((s, x) => s * 60 + x, 0);
    out.push({ start, title: m[2] });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function chapterAt(chapters: Chapter[], sec: number): Chapter | null {
  let hit: Chapter | null = null;
  for (const c of chapters) if (c.start <= sec) hit = c;
  return hit;
}

// sec 秒に話していた行と、その前後
export function linesAround(segs: Segment[], sec: number, before = 1, after = 1): Segment[] {
  if (!segs.length) return [];
  let idx = segs.findIndex((s) => s.start <= sec && sec < s.start + s.dur);
  if (idx < 0) {
    idx = 0;
    segs.forEach((s, i) => { if (s.start <= sec) idx = i; });
  }
  return segs.slice(Math.max(0, idx - before), idx + after + 1);
}

export function fmtSec(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `node --test tests/own/transcript.test.ts && npm run typecheck`
Expected: PASS（7件）、型エラー0件

- [ ] **Step 5: コミット**

```bash
git add scripts/own/transcript.ts tests/own/transcript.test.ts
git commit -m "文字起こし（字幕ファイル・ライブラリの結果）とチャプターの処理を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Studio CSV の取り込み

**Files:**
- Create: `scripts/own/studio_csv.ts`, `scripts/import_studio.ts`
- Test: `tests/own/studio_csv.test.ts`

**Interfaces:**
- Consumes: `lib.ts` の `parseCsv`, `ROOT`, `Video`、`types.ts` の `StudioRow`, `StudioFile`, `ViewerType`
- Produces: `STUDIO_TABLE_NAMES: string[]`, `STUDIO_COLUMNS: Record<StudioField, string[]>`, `type StudioField`, `parseNum(s): number | null`, `parseHms(s): number | null`, `normalizeStudioRows(rows, viewerType): { rows: StudioRow[]; missingColumns: StudioField[] }`。CLI は `own/studio.json`（`StudioFile`）を出す

入力の置き方（README と SKILL.md にも書く）: `data/<slug>/own/studio/all/`（フィルタなし）、`new/`（視聴者の種類＝新しい視聴者）、`returning/`（リピーター）に、Studio の書き出しを zip のまま、または展開した `表データ.csv`（英語UIは `Table data.csv`）を置く。**列名は実際の書き出しで確かめる（ローカルの作業 L2）。** この Task では、日本語UI・英語UIの既知の列名で作る。

- [ ] **Step 1: 失敗するテストを書く**

`tests/own/studio_csv.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../scripts/lib.ts';
import { normalizeStudioRows, parseHms, parseNum } from '../../scripts/own/studio_csv.ts';

test('parseNum: 千区切り・％・空欄・ダッシュ', () => {
  assert.equal(parseNum('1,000'), 1000);
  assert.equal(parseNum('6.1'), 6.1);
  assert.equal(parseNum('42.0%'), 42);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum('—'), null);
  assert.equal(parseNum(undefined), null);
});

test('parseHms: 時:分:秒 と 分:秒', () => {
  assert.equal(parseHms('0:04:12'), 252);
  assert.equal(parseHms('4:12'), 252);
  assert.equal(parseHms('1:00:00'), 3600);
  assert.equal(parseHms(''), null);
  assert.equal(parseHms('—'), null);
});

const JA = '﻿コンテンツ,動画のタイトル,動画公開時刻,長さ,視聴回数,総再生時間（単位: 時間）,平均視聴時間,平均再生率 (%),インプレッション数,インプレッションのクリック率 (%)\n'
  + '合計,,,,"1,500",100.5,0:04:00,40.1,"20,000",5.2\n'
  + 'abcdefghijk,動画A,"Sep 1, 2026",600,"1,000",70.0,0:04:12,42.0,"12,000",6.1\n'
  + 'lmnopqrs-_v,"動画B, 続き","Sep 8, 2026",480,500,30.5,0:03:40,45.8,"8,000",\n';

test('normalizeStudioRows: 日本語UI。合計の行を外し、値をそろえる', () => {
  const r = normalizeStudioRows(parseCsv(JA), 'new');
  assert.deepEqual(r.missingColumns, []);
  assert.deepEqual(r.rows, [
    { videoId: 'abcdefghijk', viewerType: 'new', views: 1000, avgViewDurationSec: 252, avgViewPercentage: 42, impressions: 12000, ctr: 6.1 },
    { videoId: 'lmnopqrs-_v', viewerType: 'new', views: 500, avgViewDurationSec: 220, avgViewPercentage: 45.8, impressions: 8000, ctr: null },
  ]);
});

test('normalizeStudioRows: 英語UIと全角の括弧', () => {
  const en = 'Content,Video title,Views,Average view duration,Average percentage viewed (%),Impressions,Impressions click-through rate (%)\nTotal,,10,0:01:00,50,100,1\nabcdefghijk,A,10,0:01:00,50,100,1\n';
  assert.equal(normalizeStudioRows(parseCsv(en), 'all').rows[0].ctr, 1);
  const zen = 'コンテンツ,視聴回数,平均視聴時間,平均再生率（%）,インプレッション数,インプレッションのクリック率（%）\nabcdefghijk,10,0:01:00,50,100,1\n';
  const r = normalizeStudioRows(parseCsv(zen), 'all');
  assert.deepEqual(r.missingColumns, []);
  assert.equal(r.rows[0].avgViewPercentage, 50);
});

test('normalizeStudioRows: 列がなければ missingColumns に出し、値は null', () => {
  const csv = 'コンテンツ,視聴回数,平均視聴時間,平均再生率 (%)\nabcdefghijk,10,0:01:00,50\n';
  const r = normalizeStudioRows(parseCsv(csv), 'returning');
  assert.deepEqual(r.missingColumns, ['impressions', 'ctr']);
  assert.equal(r.rows[0].impressions, null);
  assert.equal(r.rows[0].ctr, null);
});

test('normalizeStudioRows: 動画の列がなければ行は0で、videoId を missingColumns に出す', () => {
  const r = normalizeStudioRows(parseCsv('日付,視聴回数\n2026-09-01,10\n'), 'all');
  assert.deepEqual(r.rows, []);
  assert.ok(r.missingColumns.includes('videoId'));
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/own/studio_csv.test.ts`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: `scripts/own/studio_csv.ts` を書く**

```ts
// YouTube Studio（詳細モード）の書き出し CSV を、動画ごとの値にそろえる
import type { StudioRow, ViewerType } from './types.ts';

// 書き出しの zip に入っている表のファイル名
export const STUDIO_TABLE_NAMES = ['表データ.csv', 'Table data.csv'];

export type StudioField = 'videoId' | 'views' | 'avgViewDurationSec' | 'avgViewPercentage' | 'impressions' | 'ctr';

// Studio の列名（日本語UI・英語UI）。実際の書き出しで違っていたら、ここに足す
export const STUDIO_COLUMNS: Record<StudioField, string[]> = {
  videoId: ['コンテンツ', 'Content'],
  views: ['視聴回数', 'Views'],
  avgViewDurationSec: ['平均視聴時間', 'Average view duration'],
  avgViewPercentage: ['平均再生率 (%)', 'Average percentage viewed (%)'],
  impressions: ['インプレッション数', 'Impressions'],
  ctr: ['インプレッションのクリック率 (%)', 'Impressions click-through rate (%)'],
};

// 全角・半角、空白の違いを無視して列名を比べる
const key = (h: string) => h.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseNum(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.replace(/[,%\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

// "0:04:12" / "4:12" → 秒
export function parseHms(s: string | undefined): number | null {
  const m = s?.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function normalizeStudioRows(rows: Record<string, string>[], viewerType: ViewerType): { rows: StudioRow[]; missingColumns: StudioField[] } {
  const headers = Object.keys(rows[0] ?? {});
  const col = {} as Record<StudioField, string | null>;
  const missingColumns: StudioField[] = [];
  for (const f of Object.keys(STUDIO_COLUMNS) as StudioField[]) {
    const wanted = STUDIO_COLUMNS[f].map(key);
    col[f] = headers.find((h) => wanted.includes(key(h))) ?? null;
    if (!col[f]) missingColumns.push(f);
  }
  const get = (r: Record<string, string>, f: StudioField): string | undefined => {
    const c = col[f];
    return c ? r[c] : undefined;
  };
  const out: StudioRow[] = [];
  for (const r of rows) {
    const id = get(r, 'videoId')?.trim() ?? '';
    if (!VIDEO_ID.test(id)) continue; // 「合計」「Total」の行など
    const dur = get(r, 'avgViewDurationSec');
    out.push({
      videoId: id,
      viewerType,
      views: parseNum(get(r, 'views')),
      avgViewDurationSec: parseHms(dur) ?? parseNum(dur),
      avgViewPercentage: parseNum(get(r, 'avgViewPercentage')),
      impressions: parseNum(get(r, 'impressions')),
      ctr: parseNum(get(r, 'ctr')),
    });
  }
  return { rows: out, missingColumns };
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `node --test tests/own/studio_csv.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: CLI `scripts/import_studio.ts` を書く**

```ts
#!/usr/bin/env node
// YouTube Studio（詳細モード）から書き出した CSV を、「動画 × 視聴者の種類」にそろえて own/studio.json に保存する（APIは使わない）
// 使い方: node scripts/import_studio.ts data/<slug>
// 入力: data/<slug>/own/studio/ の下に、Studio の書き出し（zip のまま、または展開した「表データ.csv」）を置く
//   all/        … フィルタなし
//   new/        … 視聴者の種類「新しい視聴者」で絞ったもの
//   returning/  … 視聴者の種類「リピーター」で絞ったもの
// 出力: data/<slug>/own/studio.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, parseCsv, type Video } from './lib.ts';
import { normalizeStudioRows, STUDIO_TABLE_NAMES } from './own/studio_csv.ts';
import type { StudioFile, StudioRow, ViewerType } from './own/types.ts';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('使い方: node scripts/import_studio.ts data/<slug>');
  process.exit(1);
}
const dir = path.resolve(ROOT, dirArg);
const videosPath = path.join(dir, 'videos.json');
if (!fs.existsSync(videosPath)) {
  console.error(`${path.relative(ROOT, videosPath)} がありません。先に node scripts/fetch_channel.ts @handle を実行してください`);
  process.exit(1);
}
const videos: Video[] = JSON.parse(fs.readFileSync(videosPath, 'utf8'));

// フォルダの中の表の CSV を探す。zip があれば、いちばん新しいものを一時フォルダに展開する
function findTableCsv(folder: string): string | null {
  const zips = fs.readdirSync(folder)
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .sort((a, b) => fs.statSync(path.join(folder, b)).mtimeMs - fs.statSync(path.join(folder, a)).mtimeMs);
  let base = folder;
  if (zips.length) {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
    execFileSync('unzip', ['-o', '-q', path.join(folder, zips[0]), '-d', base]);
  }
  const names = fs.readdirSync(base);
  const csvs = names.filter((n) => n.toLowerCase().endsWith('.csv'));
  const hit = names.find((n) => STUDIO_TABLE_NAMES.includes(n.normalize('NFC'))) ?? (csvs.length === 1 ? csvs[0] : undefined);
  return hit ? path.join(base, hit) : null;
}

const rows: StudioRow[] = [];
const warnings: string[] = [];
for (const vt of ['all', 'new', 'returning'] as ViewerType[]) {
  const folder = path.join(dir, 'own', 'studio', vt);
  if (!fs.existsSync(folder)) {
    warnings.push(`own/studio/${vt}/ がありません（${vt === 'all' ? 'クリック率' : '新規／リピーター別の数字'}が空欄になります）`);
    continue;
  }
  const csv = findTableCsv(folder);
  if (!csv) {
    warnings.push(`own/studio/${vt}/ に ${STUDIO_TABLE_NAMES.join(' / ')} が見つかりません`);
    continue;
  }
  const r = normalizeStudioRows(parseCsv(fs.readFileSync(csv, 'utf8')), vt);
  if (r.missingColumns.length) warnings.push(`${vt}: 列が見つかりません → ${r.missingColumns.join(', ')}（レポートでは空欄。列名が違うなら scripts/own/studio_csv.ts の STUDIO_COLUMNS に足す）`);
  rows.push(...r.rows);
  console.error(`${vt}: ${r.rows.length} 本`);
}

const known = new Set(videos.map((v) => v.id));
const unknown = [...new Set(rows.map((r) => r.videoId).filter((id) => !known.has(id)))];
if (unknown.length) warnings.push(`videos.json にない動画が ${unknown.length} 本あります（${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ' など' : ''}）。node scripts/fetch_channel.ts を実行し直してください`);
for (const w of warnings) console.error('⚠ ' + w);
if (!rows.length) {
  console.error('取り込める行がありませんでした');
  process.exit(1);
}

const out: StudioFile = { importedAt: new Date().toISOString(), rows, warnings };
const outPath = path.join(dir, 'own', 'studio.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`${rows.length} 行を取り込み → ${path.relative(ROOT, outPath)}`);
```

- [ ] **Step 6: CLI を合成データで確かめる**

```bash
M="${TMPDIR:-/tmp}/own-studio" && rm -rf "$M" && cp -r tests/fixtures/sample-channel "$M" && mkdir -p "$M/own/studio/new" "$M/own/studio/all" \
  && printf 'コンテンツ,視聴回数,平均視聴時間,平均再生率 (%%),インプレッション数,インプレッションのクリック率 (%%)\n合計,30,0:02:00,40,1000,3\nvid00xxxxxx,20,0:02:10,41,800,3.5\nvid01xxxxxx,10,0:01:50,39,200,2\n' > "$M/own/studio/new/表データ.csv" \
  && (cd "$M/own/studio/new" && zip -q ../all/export.zip 表データ.csv) \
  && node scripts/import_studio.ts "$M" && node -e "const s=require('$M/own/studio.json'); console.log(s.rows.length, s.rows.map(r=>r.viewerType).join(','))"
```

Expected: `⚠ own/studio/returning/ がありません…` の警告のあと、`4 行を取り込み …`、最後の行が `4 all,all,new,new`

- [ ] **Step 7: 型を確かめてコミット**

Run: `npm run typecheck`
Expected: 型エラー0件

```bash
git add scripts/own/studio_csv.ts scripts/import_studio.ts tests/own/studio_csv.test.ts
git commit -m "YouTube Studio の CSV を新規／リピーター別に取り込む import_studio.ts を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: OAuth と Analytics API の呼び出し

**Files:**
- Create: `scripts/own/analytics_api.ts`, `scripts/own/oauth.ts`, `scripts/own_auth.ts`
- Modify: `.env.example`
- Test: `tests/own/oauth.test.ts`

**Interfaces:**
- Consumes: `lib.ts` の `loadEnv`, `ROOT`
- Produces:
  - `analytics_api.ts`: `SCOPE`, `AUTH_URL`, `TOKEN_URL`, `class AuthError extends Error`, `type ApiRow = Record<string, string | number>`, `interface ReportResponse`, `rowsToObjects(res): ApiRow[]`, `requireOAuthClient(): { clientId: string; clientSecret: string }`, `getAccessToken(): Promise<string>`, `ytAnalytics(params: Record<string, string | number>): Promise<ApiRow[]>`
  - `oauth.ts`: `pkcePair(): { verifier: string; challenge: string }`, `buildAuthUrl(o: { clientId: string; redirectUri: string; challenge: string; state: string }): string`, `upsertEnvText(text: string, key: string, value: string): string`

- [ ] **Step 1: 失敗するテストを書く**

`tests/own/oauth.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rowsToObjects, SCOPE } from '../../scripts/own/analytics_api.ts';
import { buildAuthUrl, pkcePair, upsertEnvText } from '../../scripts/own/oauth.ts';

test('rowsToObjects: 列名で対応づける。rows がなければ空', () => {
  const res = { columnHeaders: [{ name: 'day' }, { name: 'views' }], rows: [['2026-09-01', 10], ['2026-09-02', 5]] };
  assert.deepEqual(rowsToObjects(res), [{ day: '2026-09-01', views: 10 }, { day: '2026-09-02', views: 5 }]);
  assert.deepEqual(rowsToObjects({ columnHeaders: [{ name: 'day' }] }), []);
});

test('pkcePair: challenge は verifier の SHA-256（base64url）', () => {
  const { verifier, challenge } = pkcePair();
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
});

test('buildAuthUrl: 読み取り専用のスコープ、オフライン、同意、PKCE', () => {
  const u = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:5555', challenge: 'ch', state: 'st' }));
  assert.equal(u.searchParams.get('scope'), SCOPE);
  assert.equal(SCOPE, 'https://www.googleapis.com/auth/yt-analytics.readonly');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:5555');
  assert.equal(u.searchParams.get('state'), 'st');
});

test('upsertEnvText: 末尾に改行がなくても、ほかの行を残して足す', () => {
  assert.equal(upsertEnvText('# コメント\nYOUTUBE_API_KEY=abc', 'YOUTUBE_OAUTH_REFRESH_TOKEN', 'r1'), '# コメント\nYOUTUBE_API_KEY=abc\nYOUTUBE_OAUTH_REFRESH_TOKEN=r1\n');
  assert.equal(upsertEnvText('', 'K', 'v'), 'K=v\n');
});

test('upsertEnvText: 同じキーは1行だけ書き換える。値の $ はそのまま', () => {
  const before = 'A=1\nYOUTUBE_OAUTH_REFRESH_TOKEN=old\nB=2\n';
  assert.equal(upsertEnvText(before, 'YOUTUBE_OAUTH_REFRESH_TOKEN', 'x$1y$&'), 'A=1\nYOUTUBE_OAUTH_REFRESH_TOKEN=x$1y$&\nB=2\n');
  assert.equal(upsertEnvText('XK=1\n', 'K', '2'), 'XK=1\nK=2\n');
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/own/oauth.test.ts`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: `scripts/own/analytics_api.ts` を書く**

```ts
// YouTube Analytics API（自分のチャンネル）の呼び出し。トークンは画面にもエラーにも出さない
import { loadEnv } from '../lib.ts';

export const SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REPORTS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';

// 認証の問題。どの動画でも同じ結果になるので、呼び出し側は止める
export class AuthError extends Error {}

export type ApiRow = Record<string, string | number>;
export interface ReportResponse {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
}

export function rowsToObjects(res: ReportResponse): ApiRow[] {
  const names = (res.columnHeaders ?? []).map((h) => h.name);
  return (res.rows ?? []).map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])) as ApiRow);
}

export function requireOAuthClient(): { clientId: string; clientSecret: string } {
  loadEnv();
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AuthError('YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET が .env にありません。README の「自分のチャンネルを分析する」の手順で作ってください');
  }
  return { clientId, clientSecret };
}

let cached: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { clientId, clientSecret } = requireOAuthClient();
  const refresh = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!refresh) throw new AuthError('YOUTUBE_OAUTH_REFRESH_TOKEN が .env にありません。node scripts/own_auth.ts を実行してください');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    if (json.error === 'invalid_grant') {
      throw new AuthError('リフレッシュトークンが失効しています。node scripts/own_auth.ts をもう一度実行してください（OAuth同意画面が「テスト」のままだと7日で失効します。README参照）');
    }
    throw new AuthError(`アクセストークンを取得できません（${json.error ?? `HTTP ${res.status}`}）`);
  }
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

// ids=channel==MINE を付けて reports を呼ぶ。行は列名つきのオブジェクトで返す
export async function ytAnalytics(params: Record<string, string | number>): Promise<ApiRow[]> {
  const token = await getAccessToken();
  const query = new URLSearchParams({ ids: 'channel==MINE', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const res = await fetch(`${REPORTS_URL}?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as ReportResponse & { error?: { message?: string } };
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? res.statusText;
    if (res.status === 401) throw new AuthError(`Analytics API の認証エラー: ${msg}。node scripts/own_auth.ts をやり直してください`);
    throw new Error(`Analytics API エラー（${params.dimensions ?? ''}, HTTP ${res.status}）: ${msg}${res.status === 403 ? '（YouTube Analytics API が有効か、承認したアカウントがこのチャンネルの持ち主かを確認）' : ''}`);
  }
  return rowsToObjects(json);
}
```

- [ ] **Step 4: `scripts/own/oauth.ts` を書く**

```ts
// 初回ログイン（own_auth.ts）で使う、テストできる部分
import { createHash, randomBytes } from 'node:crypto';
import { AUTH_URL, SCOPE } from './analytics_api.ts';

// PKCE（S256）
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function buildAuthUrl(o: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  return AUTH_URL + '?' + new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // リフレッシュトークンを受け取る
    prompt: 'consent', // 2回目以降もリフレッシュトークンを受け取る
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
    state: o.state,
  });
}

// .env の KEY= の行だけを書き換える（なければ末尾に足す）。ほかの行はそのまま
export function upsertEnvText(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, () => line); // 値の $ を置換の記号として扱わない
  const base = text === '' || text.endsWith('\n') ? text : text + '\n';
  return base + line + '\n';
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `node --test tests/own/oauth.test.ts`
Expected: PASS（5件）

- [ ] **Step 6: CLI `scripts/own_auth.ts` を書く**

```ts
#!/usr/bin/env node
// 自分のチャンネルの YouTube Analytics API を使うための、初回だけのログイン
// 使い方: node scripts/own_auth.ts
// 事前に .env に YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET を書く（README参照）
// ブラウザで承認すると、リフレッシュトークンを .env の YOUTUBE_OAUTH_REFRESH_TOKEN に書き込む（画面には出さない）
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { ROOT } from './lib.ts';
import { requireOAuthClient, TOKEN_URL } from './own/analytics_api.ts';
import { buildAuthUrl, pkcePair, upsertEnvText } from './own/oauth.ts';

let client: { clientId: string; clientSecret: string };
try {
  client = requireOAuthClient();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

const { verifier, challenge } = pkcePair();
const state = randomBytes(16).toString('hex');
const server = http.createServer();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const url = buildAuthUrl({ clientId: client.clientId, redirectUri, challenge, state });

console.log('ブラウザで次のURLを開き、分析したいチャンネルのアカウントで承認してください:\n' + url);
// 自動で開けなくても、上のURLを手で開けばよい
execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], () => {});

let code: string;
try {
  code = await new Promise<string>((resolve, reject) => {
    server.on('request', (req, res) => {
      const u = new URL(req.url ?? '/', redirectUri);
      const err = u.searchParams.get('error');
      const c = u.searchParams.get('code');
      if (!err && !c) {
        res.writeHead(404).end(); // favicon など
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      if (err || !c || u.searchParams.get('state') !== state) {
        res.end('承認できませんでした。ターミナルを確認してください。');
        reject(new Error(`承認できませんでした（${err ?? 'state が一致しません'}）`));
        return;
      }
      res.end('承認しました。このタブは閉じてかまいません。');
      resolve(c);
    });
  });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
} finally {
  server.close();
}

const res = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code, client_id: client.clientId, client_secret: client.clientSecret,
    redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
  }),
});
const json = (await res.json()) as { refresh_token?: string; error?: string };
if (!json.refresh_token) {
  console.error(`リフレッシュトークンを受け取れませんでした（${json.error ?? `HTTP ${res.status}`}）。OAuth クライアントの種類が「デスクトップ アプリ」か確認してください`);
  process.exit(1);
}
const envPath = path.join(ROOT, '.env');
const before = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
fs.writeFileSync(envPath, upsertEnvText(before, 'YOUTUBE_OAUTH_REFRESH_TOKEN', json.refresh_token));
console.log('.env に YOUTUBE_OAUTH_REFRESH_TOKEN を保存しました。次は node scripts/fetch_own_analytics.ts data/<slug>');
```

- [ ] **Step 7: `.env.example` に足す**

`.env.example` の末尾に追記:

```
# 自分のチャンネルの分析（README「自分のチャンネルを分析する」）
# Google Cloud で作る OAuth クライアント（デスクトップ アプリ）
YOUTUBE_OAUTH_CLIENT_ID=
YOUTUBE_OAUTH_CLIENT_SECRET=
# node scripts/own_auth.ts が書き込む（手で書かない）
YOUTUBE_OAUTH_REFRESH_TOKEN=
```

- [ ] **Step 8: 型を確かめ、クライアントがないときの動きを見る**

Run: `npm run typecheck && env -u YOUTUBE_OAUTH_CLIENT_ID node scripts/own_auth.ts; echo "exit=$?"`
Expected: 型エラー0件。`YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET が .env にありません…` と `exit=1`（手元の `.env` にクライアントがある場合は、ブラウザのURLが出るので Ctrl+C で止める）

- [ ] **Step 9: コミット**

```bash
git add scripts/own/analytics_api.ts scripts/own/oauth.ts scripts/own_auth.ts tests/own/oauth.test.ts .env.example
git commit -m "自分のチャンネル用のOAuth（own_auth.ts）とAnalytics APIの呼び出しを追加

スコープは yt-analytics.readonly のみ。リフレッシュトークンは .env にだけ書き、表示しない。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Analytics API から動画ごとのデータを取る

**Files:**
- Create: `scripts/own/analytics_parse.ts`, `scripts/own/targets.ts`, `scripts/fetch_own_analytics.ts`
- Test: `tests/own/analytics_parse.test.ts`, `tests/own/targets.test.ts`

**Interfaces:**
- Consumes: `ytAnalytics`, `AuthError`, `ApiRow`（Task 6）、`toPtDate`, `addDays`（Task 2）、`OwnAnalytics` ほか（Task 2）
- Produces:
  - `analytics_parse.ts`: `parseDaily(rows): DailyRow[]`, `parseRetention(rows): RetentionPoint[] | null`, `parseTraffic(rows): TrafficRow[]`, `parseDetail(rows): TrafficDetailRow[]`, `pickContentType(rows): ContentType`, `dailyIsFinal(prev, publishedPt): prev is OwnAnalytics`, `latestDay(rows): string | null`
  - `targets.ts`: `argValue(argv, name): string | null`, `defaultSince(now): string`, `selectVideos(videos, { video, ids, since }): Video[]`, `CONFIRM_OVER = 20`, `needsConfirmation(n, yes): boolean`
  - CLI: `own/meta.json`（`OwnMeta`）、`own/analytics/<id>.json`（`OwnAnalytics`）

- [ ] **Step 1: 失敗するテストを書く**

`tests/own/analytics_parse.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyIsFinal, latestDay, parseDaily, parseDetail, parseRetention, parseTraffic, pickContentType } from '../../scripts/own/analytics_parse.ts';
import type { OwnAnalytics } from '../../scripts/own/types.ts';

test('parseDaily: 数に直し、日付順にする', () => {
  const rows = [
    { day: '2026-09-02', views: 5, estimatedMinutesWatched: 10, averageViewDuration: 120, averageViewPercentage: 30, subscribersGained: 1 },
    { day: '2026-09-01', views: '10', estimatedMinutesWatched: '20', averageViewDuration: '120', averageViewPercentage: '30', subscribersGained: '0' },
  ];
  const d = parseDaily(rows);
  assert.deepEqual(d.map((r) => r.day), ['2026-09-01', '2026-09-02']);
  assert.equal(d[0].views, 10);
});

test('parseRetention: 行がなければ null。位置の順にする', () => {
  assert.equal(parseRetention([]), null);
  const r = parseRetention([
    { elapsedVideoTimeRatio: 0.02, audienceWatchRatio: 0.9, relativeRetentionPerformance: 0.6 },
    { elapsedVideoTimeRatio: 0.01, audienceWatchRatio: 1.0, relativeRetentionPerformance: 0.5 },
  ]);
  assert.deepEqual(r, [{ ratio: 0.01, watchRatio: 1, relative: 0.5 }, { ratio: 0.02, watchRatio: 0.9, relative: 0.6 }]);
});

test('parseTraffic / parseDetail: 再生の多い順', () => {
  assert.deepEqual(parseTraffic([
    { insightTrafficSourceType: 'YT_SEARCH', views: 3, estimatedMinutesWatched: 6 },
    { insightTrafficSourceType: 'BROWSE', views: 9, estimatedMinutesWatched: 20 },
  ]).map((t) => t.source), ['BROWSE', 'YT_SEARCH']);
  assert.deepEqual(parseDetail([{ insightTrafficSourceDetail: 'トヨタ 決算', views: 4 }]), [{ detail: 'トヨタ 決算', views: 4 }]);
});

test('pickContentType: いちばん再生の多い種類。大文字・キャメルケースの両方を受ける', () => {
  assert.equal(pickContentType([{ creatorContentType: 'SHORTS', views: 10 }]), 'SHORTS');
  assert.equal(pickContentType([{ creatorContentType: 'videoOnDemand', views: 10 }, { creatorContentType: 'liveStream', views: 2 }]), 'VIDEO_ON_DEMAND');
  assert.equal(pickContentType([]), 'UNSPECIFIED');
  assert.equal(pickContentType([{ creatorContentType: 'SOMETHING_NEW', views: 1 }]), 'UNSPECIFIED');
});

test('dailyIsFinal: 公開28日目までのデータを取り終えていれば、取り直さない', () => {
  const prev = { dailyThrough: '2026-10-06' } as OwnAnalytics;
  assert.equal(dailyIsFinal(prev, '2026-09-09'), true);
  assert.equal(dailyIsFinal({ dailyThrough: '2026-10-05' } as OwnAnalytics, '2026-09-09'), false);
  assert.equal(dailyIsFinal(null, '2026-09-09'), false);
});

test('latestDay', () => {
  assert.equal(latestDay([{ day: '2026-09-20' }, { day: '2026-09-25' }, { day: '2026-09-22' }]), '2026-09-25');
  assert.equal(latestDay([]), null);
});
```

`tests/own/targets.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Video } from '../../scripts/lib.ts';
import { argValue, CONFIRM_OVER, defaultSince, needsConfirmation, selectVideos } from '../../scripts/own/targets.ts';

const v = (id: string, publishedAt: string) => ({ id, publishedAt }) as Video;
const videos = [v('aaaaaaaaaaa', '2026-09-01T00:00:00Z'), v('bbbbbbbbbbb', '2025-08-01T00:00:00Z'), v('ccccccccccc', '2025-10-01T00:00:00Z')];

test('defaultSince: 直近12か月', () => {
  assert.equal(defaultSince(new Date('2026-09-28T00:00:00Z')), '2025-09');
  assert.equal(defaultSince(new Date('2026-01-05T00:00:00Z')), '2025-01');
});

test('selectVideos: since で絞る。--video と --ids は期間に関係なく選ぶ', () => {
  assert.deepEqual(selectVideos(videos, { video: null, ids: null, since: '2025-09' }).map((x) => x.id), ['aaaaaaaaaaa', 'ccccccccccc']);
  assert.deepEqual(selectVideos(videos, { video: 'bbbbbbbbbbb', ids: null, since: '2025-09' }).map((x) => x.id), ['bbbbbbbbbbb']);
  assert.deepEqual(selectVideos(videos, { video: null, ids: ['ccccccccccc', 'bbbbbbbbbbb'], since: '2026-09' }).map((x) => x.id), ['ccccccccccc', 'bbbbbbbbbbb']);
});

test('selectVideos: videos.json にない動画は、fetch_channel を促すエラー', () => {
  assert.throws(() => selectVideos(videos, { video: 'zzzzzzzzzzz', ids: null, since: '2025-09' }), /fetch_channel\.ts/);
  assert.throws(() => selectVideos(videos, { video: null, ids: ['aaaaaaaaaaa', 'yyyyyyyyyyy'], since: '2025-09' }), /yyyyyyyyyyy/);
});

test('needsConfirmation: CONFIRM_OVER 本を超え、--yes がないときだけ止める', () => {
  assert.equal(needsConfirmation(CONFIRM_OVER, false), false);
  assert.equal(needsConfirmation(CONFIRM_OVER + 1, false), true);
  assert.equal(needsConfirmation(CONFIRM_OVER + 1, true), false);
});

test('argValue', () => {
  assert.equal(argValue(['node', 'x', 'data/a', '--video', 'abc'], '--video'), 'abc');
  assert.equal(argValue(['node', 'x', 'data/a'], '--video'), null);
  assert.equal(argValue(['node', 'x', 'data/a', '--video'], '--video'), null);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/own/analytics_parse.test.ts tests/own/targets.test.ts`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: `scripts/own/analytics_parse.ts` を書く**

```ts
// Analytics API の行を、保存する形に変える
import type { ApiRow } from './analytics_api.ts';
import { addDays } from './metrics.ts';
import type { ContentType, DailyRow, OwnAnalytics, RetentionPoint, TrafficDetailRow, TrafficRow } from './types.ts';

const n = (x: string | number | undefined) => Number(x ?? 0);

export function parseDaily(rows: ApiRow[]): DailyRow[] {
  return rows
    .map((r) => ({
      day: String(r.day),
      views: n(r.views),
      estimatedMinutesWatched: n(r.estimatedMinutesWatched),
      averageViewDuration: n(r.averageViewDuration),
      averageViewPercentage: n(r.averageViewPercentage),
      subscribersGained: n(r.subscribersGained),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// 再生が少ないと行が返らない → null
export function parseRetention(rows: ApiRow[]): RetentionPoint[] | null {
  if (!rows.length) return null;
  return rows
    .map((r) => ({
      ratio: n(r.elapsedVideoTimeRatio),
      watchRatio: n(r.audienceWatchRatio),
      relative: r.relativeRetentionPerformance == null ? null : n(r.relativeRetentionPerformance),
    }))
    .sort((a, b) => a.ratio - b.ratio);
}

export function parseTraffic(rows: ApiRow[]): TrafficRow[] {
  return rows
    .map((r) => ({ source: String(r.insightTrafficSourceType), views: n(r.views), minutes: n(r.estimatedMinutesWatched) }))
    .sort((a, b) => b.views - a.views);
}

export function parseDetail(rows: ApiRow[]): TrafficDetailRow[] {
  return rows.map((r) => ({ detail: String(r.insightTrafficSourceDetail), views: n(r.views) })).sort((a, b) => b.views - a.views);
}

const KNOWN: ContentType[] = ['VIDEO_ON_DEMAND', 'SHORTS', 'LIVE_STREAM', 'STORY', 'UNSPECIFIED'];

// いちばん再生の多い種類。値は "SHORTS" でも "videoOnDemand" でも受ける
export function pickContentType(rows: ApiRow[]): ContentType {
  const best = [...rows].sort((a, b) => n(b.views) - n(a.views))[0];
  const t = best ? String(best.creatorContentType).replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase() : '';
  return (KNOWN as string[]).includes(t) ? (t as ContentType) : 'UNSPECIFIED';
}

// 公開28日目までのデータを取り終えていれば、日ごとの数字は取り直さない
export function dailyIsFinal(prev: OwnAnalytics | null, publishedPt: string): prev is OwnAnalytics {
  return prev != null && addDays(publishedPt, 27) <= prev.dailyThrough;
}

export function latestDay(rows: ApiRow[]): string | null {
  return rows.map((r) => String(r.day)).sort().at(-1) ?? null;
}
```

- [ ] **Step 4: `scripts/own/targets.ts` を書く**

```ts
// 対象の動画の選び方と、引数の読み方（fetch_own_analytics / fetch_transcript / analyze_own で共通）
import type { Video } from '../lib.ts';

// 文字起こしを、確認なしで取る本数の上限
export const CONFIRM_OVER = 20;

export function argValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  const v = i > 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : null;
}

// 既定の対象期間：直近12か月（YYYY-MM）
export function defaultSince(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1)).toISOString().slice(0, 7);
}

// --video / --ids は期間に関係なく選ぶ。どちらもなければ since 以降に公開した動画
export function selectVideos(videos: Video[], o: { video: string | null; ids: string[] | null; since: string }): Video[] {
  const wanted = o.video ? [o.video] : o.ids;
  if (wanted) {
    const byId = new Map(videos.map((v) => [v.id, v]));
    const missing = wanted.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`videos.json にない動画があります: ${missing.join(', ')}。node scripts/fetch_channel.ts を実行し直してください`);
    return wanted.map((id) => byId.get(id) as Video);
  }
  return videos.filter((v) => v.publishedAt.slice(0, 7) >= o.since);
}

export const needsConfirmation = (n: number, yes: boolean): boolean => n > CONFIRM_OVER && !yes;
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `node --test tests/own/analytics_parse.test.ts tests/own/targets.test.ts`
Expected: PASS（11件）

- [ ] **Step 6: CLI `scripts/fetch_own_analytics.ts` を書く**

```ts
#!/usr/bin/env node
// 自分のチャンネルの動画ごとに、種類・公開後の日ごとの数字・維持率の曲線・流入元を YouTube Analytics API で取る
// 使い方: node scripts/fetch_own_analytics.ts data/<slug> [--video <id>] [--since YYYY-MM]
//   --since の既定は直近12か月。--video はその1本だけ
// 出力: data/<slug>/own/meta.json, data/<slug>/own/analytics/<videoId>.json
// 事前に node scripts/own_auth.ts でログインしておく。Data API のクォータは使わない
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, type Video } from './lib.ts';
import { AuthError, ytAnalytics } from './own/analytics_api.ts';
import { dailyIsFinal, latestDay, parseDaily, parseDetail, parseRetention, parseTraffic, pickContentType } from './own/analytics_parse.ts';
import { addDays, toPtDate } from './own/metrics.ts';
import { argValue, defaultSince, selectVideos } from './own/targets.ts';
import type { OwnAnalytics, OwnMeta, TrafficDetailRow, TrafficRow } from './own/types.ts';

const dirArg = process.argv[2];
if (!dirArg || dirArg.startsWith('--')) {
  console.error('使い方: node scripts/fetch_own_analytics.ts data/<slug> [--video <id>] [--since YYYY-MM]');
  process.exit(1);
}
const dir = path.resolve(ROOT, dirArg);
const videosPath = path.join(dir, 'videos.json');
if (!fs.existsSync(videosPath)) {
  console.error(`${path.relative(ROOT, videosPath)} がありません。先に node scripts/fetch_channel.ts @handle を実行してください`);
  process.exit(1);
}
const videos: Video[] = JSON.parse(fs.readFileSync(videosPath, 'utf8'));
const since = argValue(process.argv, '--since') ?? defaultSince(new Date());
let targets: Video[];
try {
  targets = selectVideos(videos, { video: argValue(process.argv, '--video'), ids: null, since });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

const minDate = (a: string, b: string) => (a < b ? a : b);
const today = toPtDate(new Date().toISOString());

// チャンネル全体で、どの日までデータがあるか（集計は2〜3日遅れる）
let dataThrough: string;
try {
  const recent = await ytAnalytics({ startDate: addDays(today, -10), endDate: today, metrics: 'views', dimensions: 'day', sort: 'day' });
  dataThrough = latestDay(recent) ?? addDays(today, -3);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const ownDir = path.join(dir, 'own');
fs.mkdirSync(path.join(ownDir, 'analytics'), { recursive: true });
const meta: OwnMeta = { dataThrough, fetchedAt: new Date().toISOString() };
fs.writeFileSync(path.join(ownDir, 'meta.json'), JSON.stringify(meta, null, 2));
console.error(`対象 ${targets.length} 本（${since} 以降${argValue(process.argv, '--video') ? '、1本指定' : ''}）。データは ${dataThrough}（太平洋時間）まで`);

async function detail(filters: string, pub: string, traffic: TrafficRow[], source: 'YT_SEARCH' | 'RELATED_VIDEO'): Promise<TrafficDetailRow[]> {
  if (!traffic.some((t) => t.source === source)) return [];
  return parseDetail(await ytAnalytics({
    startDate: pub, endDate: today, metrics: 'views', dimensions: 'insightTrafficSourceDetail',
    filters: `${filters};insightTrafficSourceType==${source}`, sort: '-views', maxResults: 25,
  }));
}

let ok = 0, failed = 0;
for (const v of targets) {
  const file = path.join(ownDir, 'analytics', `${v.id}.json`);
  const prev: OwnAnalytics | null = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const pub = toPtDate(v.publishedAt);
  const f = `video==${v.id}`;
  try {
    const contentType = prev && prev.contentType !== 'UNSPECIFIED'
      ? prev.contentType
      : pickContentType(await ytAnalytics({ startDate: pub, endDate: today, metrics: 'views', dimensions: 'creatorContentType', filters: f }));
    const daily = dailyIsFinal(prev, pub)
      ? prev.daily
      : parseDaily(await ytAnalytics({
          startDate: pub, endDate: minDate(today, addDays(pub, 27)),
          metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained',
          dimensions: 'day', filters: f, sort: 'day',
        }));
    const retention = parseRetention(await ytAnalytics({
      startDate: pub, endDate: today, metrics: 'audienceWatchRatio,relativeRetentionPerformance',
      dimensions: 'elapsedVideoTimeRatio', filters: `${f};audienceType==ORGANIC`, sort: 'elapsedVideoTimeRatio',
    }));
    const traffic = parseTraffic(await ytAnalytics({
      startDate: pub, endDate: today, metrics: 'views,estimatedMinutesWatched', dimensions: 'insightTrafficSourceType', filters: f, sort: '-views',
    }));
    const out: OwnAnalytics = {
      videoId: v.id,
      fetchedAt: new Date().toISOString(),
      dailyThrough: dataThrough,
      contentType,
      daily,
      retention,
      traffic,
      trafficDetail: { YT_SEARCH: await detail(f, pub, traffic, 'YT_SEARCH'), RELATED_VIDEO: await detail(f, pub, traffic, 'RELATED_VIDEO') },
    };
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    ok++;
    console.error(`✓ ${v.id} ${v.title.slice(0, 30)}${retention ? '' : '（維持率の曲線なし：再生が少ない）'}`);
  } catch (e) {
    if (e instanceof AuthError) {
      console.error(e.message); // 認証の問題は全動画で同じなので止める
      process.exit(1);
    }
    failed++;
    console.error(`✗ ${v.id}: ${(e as Error).message}`);
  }
}
console.log(`${ok} 本を保存 → ${path.relative(ROOT, path.join(ownDir, 'analytics'))}/（失敗 ${failed} 本）。データは ${dataThrough}（太平洋時間）まで`);
```

- [ ] **Step 7: 型と、引数の誤りの動きを確かめる**

Run: `npm run typecheck && node scripts/fetch_own_analytics.ts; echo "exit=$?"; node scripts/fetch_own_analytics.ts tests/fixtures/sample-channel --video zzzzzzzzzzz; echo "exit=$?"`
Expected: 型エラー0件。1つ目は使い方と `exit=1`。2つ目は `videos.json にない動画があります: zzzzzzzzzzz…` と `exit=1`

- [ ] **Step 8: コミット**

```bash
git add scripts/own/analytics_parse.ts scripts/own/targets.ts scripts/fetch_own_analytics.ts tests/own/analytics_parse.test.ts tests/own/targets.test.ts
git commit -m "Analytics API から動画ごとの種類・日ごとの数字・維持率・流入元を取る fetch_own_analytics.ts を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 文字起こしを取る

**Files:**
- Create: `scripts/fetch_transcript.ts`

**Interfaces:**
- Consumes: `fromLibrary`, `parseSrt`, `parseSbv`（Task 4）、`argValue`, `defaultSince`, `selectVideos`, `needsConfirmation`, `CONFIRM_OVER`（Task 7）、`TranscriptFile`（Task 2）、`youtube-transcript-plus` の `fetchTranscript`, `YoutubeTranscriptTooManyRequestError`, `YoutubeTranscriptNotAvailableLanguageError`
- Produces: `transcripts/<videoId>.json`（`TranscriptFile`）

純粋な部分は Task 4・Task 7 でテスト済み。この CLI はネットワークに行くので、モックは作らず、手元とクラウドで動きを確かめる。

- [ ] **Step 1: CLI を書く**

`scripts/fetch_transcript.ts`:

```ts
#!/usr/bin/env node
// 動画の文字起こし（秒つき）を取る。自分の動画にも、ベンチマークの動画にも使える
// 使い方: node scripts/fetch_transcript.ts data/<slug> [--video <id> | --ids a,b,c] [--since YYYY-MM] [--lang ja] [--yes]
//   指定がなければ対象期間（既定は直近12か月）の全動画。取りに行く本数が 20 本を超えるときは --yes が必要
// 出力: data/<slug>/transcripts/<videoId>.json（{ videoId, source, lang, fetchedAt, segments: [{ start, dur, text }] }）
// 取り方: youtube-transcript-plus（YouTubeの非公式の内部API）。YouTube側の変更で動かなくなることがある。
//   取れないときは、Studio から字幕ファイルを落として transcripts/<videoId>.srt（または .sbv）に置くと、それを使う
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fetchTranscript, YoutubeTranscriptNotAvailableLanguageError, YoutubeTranscriptTooManyRequestError } from 'youtube-transcript-plus';
import { ROOT, type Video } from './lib.ts';
import { fromLibrary, parseSbv, parseSrt } from './own/transcript.ts';
import { argValue, CONFIRM_OVER, defaultSince, needsConfirmation, selectVideos } from './own/targets.ts';
import type { Segment, TranscriptFile } from './own/types.ts';

const dirArg = process.argv[2];
if (!dirArg || dirArg.startsWith('--')) {
  console.error('使い方: node scripts/fetch_transcript.ts data/<slug> [--video <id> | --ids a,b,c] [--since YYYY-MM] [--lang ja] [--yes]');
  process.exit(1);
}
const dir = path.resolve(ROOT, dirArg);
const videosPath = path.join(dir, 'videos.json');
if (!fs.existsSync(videosPath)) {
  console.error(`${path.relative(ROOT, videosPath)} がありません。先に node scripts/fetch_channel.ts @handle を実行してください`);
  process.exit(1);
}
const videos: Video[] = JSON.parse(fs.readFileSync(videosPath, 'utf8'));
const lang = argValue(process.argv, '--lang') ?? 'ja';
const idsArg = argValue(process.argv, '--ids');
let targets: Video[];
try {
  targets = selectVideos(videos, {
    video: argValue(process.argv, '--video'),
    ids: idsArg ? idsArg.split(',').map((s) => s.trim()).filter(Boolean) : null,
    since: argValue(process.argv, '--since') ?? defaultSince(new Date()),
  });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

const outDir = path.join(dir, 'transcripts');
fs.mkdirSync(outDir, { recursive: true });
const localFile = (id: string) => ['srt', 'sbv'].map((ext) => path.join(outDir, `${id}.${ext}`)).find((p) => fs.existsSync(p));
const todo = targets.filter((v) => !fs.existsSync(path.join(outDir, `${v.id}.json`)));
const network = todo.filter((v) => !localFile(v.id));
if (needsConfirmation(network.length, process.argv.includes('--yes'))) {
  console.error(`${network.length} 本の文字起こしを取ろうとしています（${CONFIRM_OVER} 本を超えています）。非公式の通信なので、取り過ぎると制限されます。--video / --ids で絞るか、--yes を付けて続けてください`);
  process.exit(1);
}

async function fromYoutube(id: string): Promise<{ lang: string; segments: Segment[] }> {
  try {
    const segs = await fetchTranscript(id, { lang });
    return { lang, segments: fromLibrary(segs) };
  } catch (e) {
    if (!(e instanceof YoutubeTranscriptNotAvailableLanguageError)) throw e;
    const segs = await fetchTranscript(id); // 指定の言語がなければ、ある言語で取る
    return { lang: segs[0]?.lang ?? '', segments: fromLibrary(segs) };
  }
}

let saved = 0, missing = 0, first = true;
for (const v of todo) {
  const out = path.join(outDir, `${v.id}.json`);
  const local = localFile(v.id);
  let file: TranscriptFile | null = null;
  if (local) {
    const text = fs.readFileSync(local, 'utf8');
    file = { videoId: v.id, source: path.basename(local), lang: '', fetchedAt: new Date().toISOString(), segments: local.endsWith('.srt') ? parseSrt(text) : parseSbv(text) };
  } else {
    if (!first) await sleep(1500); // 間隔を空ける
    first = false;
    for (let attempt = 0; attempt < 2 && !file; attempt++) {
      try {
        const r = await fromYoutube(v.id);
        file = { videoId: v.id, source: 'youtube-transcript-plus', lang: r.lang, fetchedAt: new Date().toISOString(), segments: r.segments };
      } catch (e) {
        if (e instanceof YoutubeTranscriptTooManyRequestError && attempt === 0) {
          console.error('制限されました（429）。30秒待って、もう一度試します');
          await sleep(30_000);
          continue;
        }
        console.error(`✗ ${v.id} 文字起こしなし: ${(e as Error).message}。Studio から字幕ファイルを落として ${path.relative(ROOT, path.join(outDir, v.id + '.srt'))} に置けば使えます`);
        break;
      }
    }
  }
  if (file && file.segments.length) {
    fs.writeFileSync(out, JSON.stringify(file, null, 2));
    saved++;
    console.error(`✓ ${v.id} ${file.segments.length} 行（${file.source}）`);
  } else {
    if (file) console.error(`✗ ${v.id} 文字起こしが空でした`);
    missing++;
  }
}
console.log(`${saved} 本を保存、${missing} 本は取れず（保存済みの ${targets.length - todo.length} 本はそのまま）→ ${path.relative(ROOT, outDir)}/`);
```

- [ ] **Step 2: 型と、字幕ファイルを置いた場合の動きを確かめる**

```bash
npm run typecheck && M="${TMPDIR:-/tmp}/own-transcript" && rm -rf "$M" && cp -r tests/fixtures/sample-channel "$M" && mkdir -p "$M/transcripts" \
  && printf '1\n00:00:01,000 --> 00:00:03,000\nこんにちは\n' > "$M/transcripts/vid00xxxxxx.srt" \
  && node scripts/fetch_transcript.ts "$M" --video vid00xxxxxx && cat "$M/transcripts/vid00xxxxxx.json"
```

Expected: 型エラー0件。`✓ vid00xxxxxx 1 行（vid00xxxxxx.srt）`、JSON の `segments` が `[{ "start": 1, "dur": 2, "text": "こんにちは" }]`

- [ ] **Step 3: 20本を超えると確認で止まることを確かめる**

```bash
M="${TMPDIR:-/tmp}/own-transcript-many" && rm -rf "$M" && mkdir -p "$M" \
  && node -e "const v=Array.from({length:21},(_,i)=>({id:('m'+String(i).padStart(2,'0')).padEnd(11,'x'),publishedAt:'2026-09-01T00:00:00Z',title:'t',description:''}));require('fs').writeFileSync('$M/videos.json',JSON.stringify(v))" \
  && node scripts/fetch_transcript.ts "$M" --since 2026-01; echo "exit=$?"
```

Expected: `21 本の文字起こしを取ろうとしています（20 本を超えています）…` と `exit=1`。ネットワークには行かない

- [ ] **Step 4: 実際の公開動画で1本取れることを確かめる（ネットワークが使える環境のみ）**

```bash
M="${TMPDIR:-/tmp}/own-transcript-live" && rm -rf "$M" && mkdir -p "$M" \
  && printf '[{"id":"dQw4w9WgXcQ","publishedAt":"2009-10-25T06:57:33Z","title":"sample","description":"","url":"","views":0,"likes":null,"comments":null,"durationSec":213,"isShortLikely":false,"isLive":false,"tags":[],"categoryId":"10"}]' > "$M/videos.json" \
  && node scripts/fetch_transcript.ts "$M" --video dQw4w9WgXcQ --lang en
```

Expected: `✓ dQw4w9WgXcQ N 行（youtube-transcript-plus）`。取れない（非公式APIの変更・環境のネットワーク制限）場合は、その出力を記録して次へ進む（ローカルの作業 L5 で改めて確かめる）

- [ ] **Step 5: コミット**

```bash
git add scripts/fetch_transcript.ts
git commit -m "動画の文字起こしを取る fetch_transcript.ts を追加

youtube-transcript-plus（非公式の内部API）で取る。字幕ファイルを置けばそれを使う。20本を超えるときは --yes が必要。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: レポート（全動画・1本）

**Files:**
- Create: `scripts/own/load.ts`, `scripts/own/report.ts`, `scripts/analyze_own.ts`
- Test: `tests/own/report.test.ts`, `tests/own/load.test.ts`

**Interfaces:**
- Consumes: Task 2〜7 のすべて
- Produces:
  - `load.ts`: `loadOwnData(dir: string, now: Date, o: { since: string | null; include: string | null }): OwnData`
  - `report.ts`: `CONTENT_ORDER`, `CONTENT_LABEL`, `TRAFFIC_LABEL`, `interface VideoMetrics`, `contentTypeOf(d)`, `buildMetrics(d, dataThrough, now): VideoMetrics`, `trafficShare(m, source): number | null`, `renderChannelReport(data: OwnData): string`, `renderVideoReport(data: OwnData, videoId: string): string`
  - CLI: `own/report.md`、`own/videos/<id>.md`

- [ ] **Step 1: 失敗するテストを書く**

`tests/own/report.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, Video } from '../../scripts/lib.ts';
import { MIN_GROUP_VIDEOS, addDays, toPtDate } from '../../scripts/own/metrics.ts';
import { renderChannelReport, renderVideoReport } from '../../scripts/own/report.ts';
import type { OwnAnalytics, OwnData, RetentionPoint, VideoData } from '../../scripts/own/types.ts';

const NOW = new Date('2026-09-28T00:00:00Z');
const THROUGH = '2026-09-25';
const channel = { title: 'テストチャンネル' } as Channel;

const mkVideo = (id: string, publishedAt: string, o: Partial<Video> = {}): Video => ({
  id, url: 'https://www.youtube.com/watch?v=' + id, publishedAt, title: '動画 ' + id, views: 0, likes: null, comments: null,
  durationSec: 600, isShortLikely: false, isLive: false, tags: [], categoryId: '27', description: '', ...o,
});
const flat = (w: number): RetentionPoint[] => Array.from({ length: 100 }, (_, i) => ({ ratio: (i + 1) / 100, watchRatio: w, relative: 0.5 }));
const mkAnalytics = (v: Video, viewsPerDay: number, o: Partial<OwnAnalytics> = {}): OwnAnalytics => {
  const pub = toPtDate(v.publishedAt);
  return {
    videoId: v.id, fetchedAt: NOW.toISOString(), dailyThrough: THROUGH, contentType: 'VIDEO_ON_DEMAND',
    daily: Array.from({ length: 28 }, (_, i) => ({ day: addDays(pub, i), views: viewsPerDay, estimatedMinutesWatched: viewsPerDay * 4, averageViewDuration: 240, averageViewPercentage: 40, subscribersGained: 1 })),
    retention: flat(0.6), traffic: [{ source: 'BROWSE', views: 70, minutes: 200 }, { source: 'YT_SEARCH', views: 30, minutes: 90 }],
    trafficDetail: { YT_SEARCH: [{ detail: 'トヨタ 決算', views: 12 }], RELATED_VIDEO: [] }, ...o,
  };
};
const vd = (video: Video, analytics: OwnAnalytics | null, o: Partial<VideoData> = {}): VideoData => ({ video, analytics, studio: {}, transcript: null, chapters: [], tag: null, ...o });
const data = (videos: VideoData[], o: Partial<OwnData> = {}): OwnData => ({ channel, videos, dataThrough: THROUGH, studioImportedAt: '2026-09-27T00:00:00Z', now: NOW, ...o });

test('全動画: 種類ごとに節を分け、ない種類は出さない。出典の表記がある', () => {
  const a = mkVideo('aaaaaaaaaaa', '2026-08-01T00:00:00Z');
  const s = mkVideo('sssssssssss', '2026-08-02T00:00:00Z', { durationSec: 40 });
  const md = renderChannelReport(data([vd(a, mkAnalytics(a, 10)), vd(s, mkAnalytics(s, 50, { contentType: 'SHORTS' }))]));
  assert.match(md, /## 通常動画（1本）/);
  assert.match(md, /## ショート（1本）/);
  assert.doesNotMatch(md, /## ライブ/);
  assert.match(md, /\[Studio\]/);
  assert.match(md, /\[API\]/);
  assert.match(md, new RegExp(`${MIN_GROUP_VIDEOS}本未満`));
  assert.doesNotMatch(md, /上位・下位の比較/);
});

test('全動画: 公開7日のデータがある動画が MIN_GROUP_VIDEOS 本以上なら、上位・下位と型ごとを出す', () => {
  const vs = Array.from({ length: MIN_GROUP_VIDEOS + 2 }, (_, i) => {
    const v = mkVideo(('v' + String(i).padStart(2, '0')).padEnd(11, 'x'), `2026-0${1 + (i % 8)}-1${i % 9}T00:00:00Z`);
    return vd(v, mkAnalytics(v, 10 + i), { tag: i % 2 ? '決算' : '用語' });
  });
  const md = renderChannelReport(data(vs));
  assert.match(md, /上位・下位の比較/);
  assert.match(md, /### 型ごと/);
  assert.match(md, /\| 決算 \|/);
});

test('全動画: 公開直後の動画は「未到達」。データがなくても落ちない', () => {
  const fresh = mkVideo('fffffffffff', '2026-09-27T00:00:00Z');
  const md = renderChannelReport(data([vd(fresh, null)], { dataThrough: null, studioImportedAt: null }));
  assert.match(md, /未到達/);
  assert.match(md, /Studio の CSV を取り込んでいません/);
  assert.match(md, /Analytics API のデータがありません/);
});

test('全動画: タイトルの | は表を壊さないように置き換える', () => {
  const v = mkVideo('ppppppppppp', '2026-08-01T00:00:00Z', { title: 'A | B' });
  const md = renderChannelReport(data([vd(v, mkAnalytics(v, 10))]));
  assert.match(md, /A ｜ B/);
});

test('全動画: 新規／リピーターとクリック率を Studio から出す', () => {
  const v = mkVideo('nnnnnnnnnnn', '2026-08-01T00:00:00Z');
  const studio = {
    all: { videoId: v.id, viewerType: 'all' as const, views: 100, avgViewDurationSec: 200, avgViewPercentage: 33.3, impressions: 2000, ctr: 4.5 },
    new: { videoId: v.id, viewerType: 'new' as const, views: 75, avgViewDurationSec: 150, avgViewPercentage: 25, impressions: null, ctr: null },
    returning: { videoId: v.id, viewerType: 'returning' as const, views: 25, avgViewDurationSec: 300, avgViewPercentage: 50, impressions: null, ctr: null },
  };
  const md = renderChannelReport(data([vd(v, mkAnalytics(v, 10), { studio })]));
  assert.match(md, /新しい視聴者の割合 \[Studio\]: 75%/);
  assert.match(md, /4\.5%/);
});

test('1本: 見返された場所に、チャプターと発言を添える', () => {
  const v = mkVideo('rrrrrrrrrrr', '2026-08-01T00:00:00Z');
  const retention = flat(0.6).map((p) => (p.ratio >= 0.5 && p.ratio < 0.55 ? { ...p, watchRatio: 0.65 } : p));
  const d = vd(v, mkAnalytics(v, 10, { retention }), {
    chapters: [{ start: 0, title: 'はじめに' }, { start: 240, title: '本題' }],
    transcript: [{ start: 0, dur: 5, text: '今日は決算の話です' }, { start: 290, dur: 10, text: 'ここが大事です' }],
  });
  const md = renderVideoReport(data([d]), v.id);
  assert.match(md, /# 動画 rrrrrrrrrrr の振り返り/);
  assert.match(md, /チャプター「本題」/);
  assert.match(md, /ここが大事です/);
  assert.match(md, /冒頭30秒の発言/);
  assert.match(md, /今日は決算の話です/);
  assert.match(md, /トヨタ 決算/);
});

test('1本: 文字起こしがなければ、取り方を示す。対象にない動画はエラー', () => {
  const v = mkVideo('ttttttttttt', '2026-08-01T00:00:00Z');
  const md = renderVideoReport(data([vd(v, mkAnalytics(v, 10))]), v.id);
  assert.match(md, /fetch_transcript\.ts/);
  assert.throws(() => renderVideoReport(data([vd(v, null)]), 'zzzzzzzzzzz'), /zzzzzzzzzzz/);
});

test('1本: 公開直後で48時間に届いていなければ「未到達」', () => {
  const v = mkVideo('uuuuuuuuuuu', '2026-09-25T20:00:00Z');
  const md = renderVideoReport(data([vd(v, mkAnalytics(v, 10))]), v.id);
  assert.match(md, /\| 48時間 \| 未到達/);
});
```

`tests/own/load.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadOwnData } from '../../scripts/own/load.ts';

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-load-'));
  const videos = [
    { id: 'aaaaaaaaaaa', publishedAt: '2026-09-01T00:00:00Z', title: 'A', description: '0:00 はじめに\n1:00 本題', durationSec: 600, isShortLikely: false, isLive: false },
    { id: 'bbbbbbbbbbb', publishedAt: '2024-01-01T00:00:00Z', title: 'B', description: '', durationSec: 600, isShortLikely: false, isLive: false },
  ];
  fs.writeFileSync(path.join(dir, 'channel.json'), JSON.stringify({ title: 'C' }));
  fs.writeFileSync(path.join(dir, 'videos.json'), JSON.stringify(videos));
  fs.mkdirSync(path.join(dir, 'own', 'analytics'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'transcripts'));
  fs.writeFileSync(path.join(dir, 'own', 'meta.json'), JSON.stringify({ dataThrough: '2026-09-25', fetchedAt: 'x' }));
  fs.writeFileSync(path.join(dir, 'own', 'studio.json'), JSON.stringify({ importedAt: '2026-09-27', warnings: [], rows: [
    { videoId: 'aaaaaaaaaaa', viewerType: 'new', views: 3 }, { videoId: 'aaaaaaaaaaa', viewerType: 'returning', views: 1 },
  ] }));
  fs.writeFileSync(path.join(dir, 'own', 'tags.csv'), 'video_id,type\naaaaaaaaaaa,決算\n');
  fs.writeFileSync(path.join(dir, 'transcripts', 'aaaaaaaaaaa.json'), JSON.stringify({ segments: [{ start: 0, dur: 1, text: 'x' }] }));
  return dir;
}

test('loadOwnData: 期間で絞り、Studio・型・文字起こし・チャプターを動画ごとにまとめる', () => {
  const d = loadOwnData(makeDir(), new Date('2026-09-28T00:00:00Z'), { since: '2025-09', include: null });
  assert.equal(d.videos.length, 1);
  const a = d.videos[0];
  assert.equal(a.studio.new?.views, 3);
  assert.equal(a.studio.returning?.views, 1);
  assert.equal(a.tag, '決算');
  assert.equal(a.transcript?.[0].text, 'x');
  assert.deepEqual(a.chapters.map((c) => c.title), ['はじめに', '本題']);
  assert.equal(a.analytics, null);
  assert.equal(d.dataThrough, '2026-09-25');
});

test('loadOwnData: include の動画は期間外でも入れる', () => {
  const d = loadOwnData(makeDir(), new Date(), { since: '2025-09', include: 'bbbbbbbbbbb' });
  assert.deepEqual(d.videos.map((v) => v.video.id).sort(), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
});

test('loadOwnData: channel.json がなければ fetch_channel を促す', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-load-empty-'));
  assert.throws(() => loadOwnData(dir, new Date(), { since: null, include: null }), /fetch_channel\.ts/);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/own/report.test.ts tests/own/load.test.ts`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: `scripts/own/load.ts` を書く**

```ts
// data/<slug> から、自分のチャンネル分析に使うデータをまとめて読む（ないものは null・空）
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, type Channel, type Video } from '../lib.ts';
import { parseChapters } from './transcript.ts';
import type { OwnAnalytics, OwnData, OwnMeta, StudioFile, StudioRow, TranscriptFile, VideoData, ViewerType } from './types.ts';

const readJson = <T>(p: string): T | null => (fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as T) : null);

export function loadOwnData(dir: string, now: Date, o: { since: string | null; include: string | null }): OwnData {
  const channel = readJson<Channel>(path.join(dir, 'channel.json'));
  const videos = readJson<Video[]>(path.join(dir, 'videos.json'));
  if (!channel || !videos) throw new Error(`${dir} に channel.json / videos.json がありません。先に node scripts/fetch_channel.ts @handle を実行してください`);
  const meta = readJson<OwnMeta>(path.join(dir, 'own', 'meta.json'));
  const studio = readJson<StudioFile>(path.join(dir, 'own', 'studio.json'));
  const tagsPath = path.join(dir, 'own', 'tags.csv');
  const tags: Record<string, string> = fs.existsSync(tagsPath)
    ? Object.fromEntries(parseCsv(fs.readFileSync(tagsPath, 'utf8')).map((r) => [(r.video_id ?? '').trim(), (r.type ?? '').trim()]))
    : {};
  const byVideo = new Map<string, Partial<Record<ViewerType, StudioRow>>>();
  for (const r of studio?.rows ?? []) {
    const m = byVideo.get(r.videoId) ?? {};
    m[r.viewerType] = r;
    byVideo.set(r.videoId, m);
  }
  const list = videos
    .filter((v) => v.id === o.include || !o.since || v.publishedAt.slice(0, 7) >= o.since)
    .map((video): VideoData => ({
      video,
      analytics: readJson<OwnAnalytics>(path.join(dir, 'own', 'analytics', `${video.id}.json`)),
      studio: byVideo.get(video.id) ?? {},
      transcript: readJson<TranscriptFile>(path.join(dir, 'transcripts', `${video.id}.json`))?.segments ?? null,
      chapters: parseChapters(video.description ?? ''),
      tag: tags[video.id] || null,
    }));
  return { channel, videos: list, dataThrough: meta?.dataThrough ?? null, studioImportedAt: studio?.importedAt ?? null, now };
}
```

- [ ] **Step 4: `scripts/own/report.ts` を書く**

```ts
// 自分のチャンネルの振り返りレポート（Markdown）を作る。数字には出典を付ける
import { fmt, median } from '../lib.ts';
import { analysisMode, cumulativeAt, markVsMedian, MIN_GROUP_VIDEOS, topBottom, toPtDate, WINDOW_LABEL, WINDOWS, type Cumulative } from './metrics.ts';
import { detectDrops, detectRewatches, openingRetention, OPENING_SEC, pointAtSec, type Drop, type Rise } from './retention.ts';
import { chapterAt, fmtSec, linesAround } from './transcript.ts';
import type { ContentType, OwnData, VideoData, ViewerType } from './types.ts';

export const CONTENT_ORDER: ContentType[] = ['VIDEO_ON_DEMAND', 'SHORTS', 'LIVE_STREAM', 'STORY', 'UNSPECIFIED'];
export const CONTENT_LABEL: Record<ContentType, string> = {
  VIDEO_ON_DEMAND: '通常動画', SHORTS: 'ショート', LIVE_STREAM: 'ライブ', STORY: 'ストーリー', UNSPECIFIED: '種類不明',
};
export const TRAFFIC_LABEL: Record<string, string> = {
  BROWSE: 'ブラウジング', RELATED_VIDEO: '関連動画', YT_SEARCH: 'YouTube検索', SUBSCRIBER: '登録チャンネル', EXT_URL: '外部',
  NO_LINK_OTHER: '直接・不明', NO_LINK_EMBEDDED: '埋め込み', PLAYLIST: '再生リスト', SHORTS: 'ショートフィード', NOTIFICATION: '通知',
  YT_CHANNEL: 'チャンネルページ', YT_OTHER_PAGE: 'その他のYouTube', END_SCREEN: '終了画面', HASHTAGS: 'ハッシュタグ', ADVERTISING: '広告',
  PROMOTED: 'プロモーション', ANNOTATION: 'カード', CAMPAIGN_CARD: 'キャンペーンカード', LIVE_REDIRECT: 'ライブのリダイレクト',
  PRODUCT_PAGE: '商品ページ', SOUND_PAGE: 'サウンドページ', VIDEO_REMIXES: 'リミックス', WATCH_WITH: '一緒に視聴',
};
const trafficLabel = (s: string) => TRAFFIC_LABEL[s] ?? s;

export interface VideoMetrics {
  d: VideoData;
  type: ContentType;
  typeSource: 'API' | '推定';
  ageDays: number;
  windows: Record<number, Cumulative | null>;
  hasCurve: boolean;
  opening: number | null;
  drops: Drop[] | null; // null は detectDrops が未実装
  rises: Rise[];
  newShare: number | null; // 再生のうち新しい視聴者の割合（0〜1）
}

// Analytics API の種類があればそれ、なければ尺と配信の有無から推定
export function contentTypeOf(d: VideoData): { type: ContentType; source: 'API' | '推定' } {
  const t = d.analytics?.contentType;
  if (t && t !== 'UNSPECIFIED') return { type: t, source: 'API' };
  return { type: d.video.isLive ? 'LIVE_STREAM' : d.video.isShortLikely ? 'SHORTS' : 'VIDEO_ON_DEMAND', source: '推定' };
}

export function buildMetrics(d: VideoData, dataThrough: string | null, now: Date): VideoMetrics {
  const { type, source } = contentTypeOf(d);
  const pub = toPtDate(d.video.publishedAt);
  const windows: Record<number, Cumulative | null> = {};
  for (const w of WINDOWS) windows[w] = d.analytics && dataThrough ? cumulativeAt(d.analytics.daily, pub, w, d.video.durationSec, dataThrough) : null;
  const ret = d.analytics?.retention ?? null;
  const nv = d.studio.new?.views, rv = d.studio.returning?.views;
  return {
    d, type, typeSource: source, windows,
    ageDays: Math.floor((now.getTime() - Date.parse(d.video.publishedAt)) / 86400000),
    hasCurve: ret != null,
    opening: ret ? openingRetention(ret, d.video.durationSec) : null,
    drops: ret ? detectDrops(ret, d.video.durationSec) : null,
    rises: ret ? detectRewatches(ret, d.video.durationSec) : [],
    newShare: nv != null && rv != null && nv + rv > 0 ? nv / (nv + rv) : null,
  };
}

// 表示
const pctRatio = (x: number | null | undefined) => (x == null ? '-' : `${(x * 100).toFixed(0)}%`); // 0〜1 の割合
const pctValue = (x: number | null | undefined) => (x == null ? '-' : `${x.toFixed(1)}%`); // すでに％の値
const secText = (x: number | null | undefined) => (x == null ? '-' : fmtSec(x));
const esc = (s: string) => s.replace(/\|/g, '｜');
function withMark(text: string, value: number | null | undefined, med: number | null): string {
  const m = markVsMedian(value ?? null, med);
  return m ? `${text} ${m}` : text;
}
const fmtDrop = (x: Drop) => `${fmtSec(x.atSec)}（${pctRatio(x.from)}→${pctRatio(x.to)}、${x.deltaPt.toFixed(0)}pt）`;
const fmtRise = (x: Rise) => `${fmtSec(x.atSec)}（+${x.risePt.toFixed(0)}pt）`;

// 指標
type Metric = (m: VideoMetrics) => number | null;
const views7: Metric = (m) => m.windows[7]?.views ?? null;
const avgPct7: Metric = (m) => m.windows[7]?.avgViewPercentage ?? null;
const ctr: Metric = (m) => m.d.studio.all?.ctr ?? null;
const pctOf = (vt: ViewerType): Metric => (m) => m.d.studio[vt]?.avgViewPercentage ?? null;
const newPct = pctOf('new'), retPct = pctOf('returning');
const medOf = (ms: VideoMetrics[], f: Metric) => median(ms.map(f));

export function trafficShare(m: VideoMetrics, source: string): number | null {
  const t = m.d.analytics?.traffic ?? [];
  const total = t.reduce((s, x) => s + x.views, 0);
  if (!total) return null;
  return (t.find((x) => x.source === source)?.views ?? 0) / total;
}
function topTraffic(m: VideoMetrics, n = 2): string {
  const t = m.d.analytics?.traffic ?? [];
  const total = t.reduce((s, x) => s + x.views, 0);
  return total ? t.slice(0, n).map((x) => `${trafficLabel(x.source)} ${pctRatio(x.views / total)}`).join('、') : '-';
}
function retentionSummary(m: VideoMetrics): string {
  if (!m.hasCurve) return '曲線なし（再生が少ない、または未取得）';
  const parts = [`冒頭${OPENING_SEC}秒 ${pctRatio(m.opening)}`];
  parts.push(m.drops == null ? '離脱: 未実装（scripts/own/retention.ts の detectDrops）' : m.drops.length ? '離脱: ' + m.drops.map(fmtDrop).join('、') : '離脱: 目立つ所なし');
  if (m.rises.length) parts.push('見返し: ' + m.rises.map(fmtRise).join('、'));
  return parts.join('／');
}
const byNewest = (a: VideoMetrics, b: VideoMetrics) => b.d.video.publishedAt.localeCompare(a.d.video.publishedAt);

function header(p: (s?: string) => void, data: OwnData): void {
  p(`- 作成: ${data.now.toISOString()}`);
  p(`- データの範囲: Analytics API は ${data.dataThrough ?? '-'} まで（米国太平洋時間）／Studio の CSV は ${data.studioImportedAt ?? '-'} に取り込み`);
  p('- 出典: [Studio]=YouTube Studio の CSV（公開からの通算）、[API]=YouTube Analytics API、[文字起こし]=youtube-transcript-plus または字幕ファイル');
  p('- 「48時間」は公開日（太平洋時間）を含む2日間。[API] の平均視聴率は、視聴時間と尺から計算');
  if (!data.dataThrough) p('- ⚠ Analytics API のデータがありません（node scripts/fetch_own_analytics.ts data/<slug>）');
  if (!data.studioImportedAt) p('- ⚠ Studio の CSV を取り込んでいません（node scripts/import_studio.ts data/<slug>）。新規／リピーターとクリック率は空欄です');
}

function renderTypeSection(p: (s?: string) => void, type: ContentType, ms: VideoMetrics[]): void {
  const mature = ms.filter((m) => m.windows[7] != null);
  const mode = analysisMode(mature.length);
  const sorted = [...ms].sort(byNewest);
  p(`## ${CONTENT_LABEL[type]}（${ms.length}本）`);
  p();
  p(`- 公開7日のデータがある動画: ${mature.length}本 → ${mode === 'group' ? '上位・下位の比較と型ごとのまとめを出します' : `${MIN_GROUP_VIDEOS}本未満のため、1本ずつの比較が中心です`}`);
  if (ms.some((m) => m.typeSource === '推定')) p('- 種類の一部は、尺と配信の有無からの推定です（Analytics API のデータがない動画）');
  p();

  const sumViews = (vt: ViewerType) => ms.reduce((s, m) => s + (m.d.studio[vt]?.views ?? 0), 0);
  const sn = sumViews('new'), sr = sumViews('returning');
  p('### 全体');
  p();
  p(`- 再生のうち新しい視聴者の割合 [Studio]: ${sn + sr > 0 ? pctRatio(sn / (sn + sr)) : '-'}`);
  p(`- 平均視聴率の中央値 [Studio]: 新しい視聴者 ${pctValue(medOf(ms, newPct))}／リピーター ${pctValue(medOf(ms, retPct))}`);
  p(`- クリック率の中央値 [Studio]: ${pctValue(medOf(ms, ctr))}`);
  p(`- 7日の再生数の中央値 [API]: ${fmt(medOf(mature, views7))}`);
  p();

  const med = {
    v7: medOf(mature, views7), a7: medOf(mature, avgPct7), ns: medOf(ms, (m) => m.newShare),
    np: medOf(ms, newPct), rp: medOf(ms, retPct), ctr: medOf(ms, ctr), op: medOf(ms, (m) => m.opening),
  };
  p('### 動画ごと');
  p();
  p('↑↓ は、この種類の中央値より5%を超えて高い／低い。再生数は公開7日時点で比べる（通算の数は公開時期で大きさが変わるため）');
  p();
  p(`| 公開 | タイトル | 日数 | 尺 | 7日の再生 [API] | 7日の平均視聴率 [API] | 新規の割合 [Studio] | 平均視聴率 新規／リピーター [Studio] | クリック率 [Studio] | 冒頭${OPENING_SEC}秒 [API] | 流入元の上位 [API] |`);
  p('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|---|');
  for (const m of sorted) {
    const w7 = m.windows[7];
    p(`| ${m.d.video.publishedAt.slice(0, 10)} | ${esc(m.d.video.title)} | ${m.ageDays} | ${fmtSec(m.d.video.durationSec)} | ${w7 ? withMark(fmt(w7.views), w7.views, med.v7) : '未到達'} | ${w7 ? withMark(pctValue(w7.avgViewPercentage), w7.avgViewPercentage, med.a7) : '未到達'} | ${withMark(pctRatio(m.newShare), m.newShare, med.ns)} | ${withMark(pctValue(newPct(m)), newPct(m), med.np)}／${withMark(pctValue(retPct(m)), retPct(m), med.rp)} | ${withMark(pctValue(ctr(m)), ctr(m), med.ctr)} | ${withMark(pctRatio(m.opening), m.opening, med.op)} | ${topTraffic(m)} |`);
  }
  p();
  p('### 維持率 [API]');
  p();
  for (const m of sorted) p(`- **${esc(m.d.video.title)}**: ${retentionSummary(m)}`);
  p();

  if (mode !== 'group') return;
  const { top, bottom } = topBottom(mature, views7, mode);
  p(`### 上位・下位の比較（7日の再生数で上位${top.length}本・下位${bottom.length}本、各列は中央値）`);
  p();
  p('| 指標 | 上位 | 下位 |');
  p('|---|--:|--:|');
  const rows: [string, Metric, (x: number | null) => string][] = [
    ['7日の再生 [API]', views7, fmt],
    ['7日の平均視聴率 [API]', avgPct7, pctValue],
    ['新規の割合 [Studio]', (m) => m.newShare, pctRatio],
    ['新規の平均視聴率 [Studio]', newPct, pctValue],
    ['クリック率 [Studio]', ctr, pctValue],
    [`冒頭${OPENING_SEC}秒の維持率 [API]`, (m) => m.opening, pctRatio],
    ['ブラウジングの割合 [API]', (m) => trafficShare(m, 'BROWSE'), pctRatio],
    ['関連動画の割合 [API]', (m) => trafficShare(m, 'RELATED_VIDEO'), pctRatio],
    ['YouTube検索の割合 [API]', (m) => trafficShare(m, 'YT_SEARCH'), pctRatio],
  ];
  for (const [label, f, show] of rows) p(`| ${label} | ${show(medOf(top, f))} | ${show(medOf(bottom, f))} |`);
  p();

  const groups = new Map<string, VideoMetrics[]>();
  for (const m of ms) if (m.d.tag) groups.set(m.d.tag, [...(groups.get(m.d.tag) ?? []), m]);
  const shown = [...groups].filter(([, g]) => g.length >= 2);
  if (!shown.length) return;
  p('### 型ごと（own/tags.csv、2本以上の型）');
  p();
  p('| 型 | 本数 | 7日の再生 中央値 [API] | 新規の平均視聴率 中央値 [Studio] | クリック率 中央値 [Studio] |');
  p('|---|--:|--:|--:|--:|');
  for (const [tag, g] of shown) p(`| ${esc(tag)} | ${g.length} | ${fmt(medOf(g, views7))} | ${pctValue(medOf(g, newPct))} | ${pctValue(medOf(g, ctr))} |`);
  p();
}

export function renderChannelReport(data: OwnData): string {
  const L: string[] = [];
  const p = (s = '') => { L.push(s); };
  const all = data.videos.map((d) => buildMetrics(d, data.dataThrough, data.now));
  p(`# ${data.channel.title} 自分のチャンネルの振り返り`);
  p();
  header(p, data);
  p();
  for (const type of CONTENT_ORDER) {
    const ms = all.filter((m) => m.type === type);
    if (ms.length) renderTypeSection(p, type, ms);
  }
  return L.join('\n') + '\n';
}

export function renderVideoReport(data: OwnData, videoId: string): string {
  const all = data.videos.map((d) => buildMetrics(d, data.dataThrough, data.now));
  const m = all.find((x) => x.d.video.id === videoId);
  if (!m) throw new Error(`動画 ${videoId} が対象の動画にありません（videos.json と --since を確認してください）`);
  const peers = all.filter((x) => x.type === m.type && x.d.video.id !== videoId);
  const v = m.d.video;
  const L: string[] = [];
  const p = (s = '') => { L.push(s); };
  const context = (sec: number) => {
    const c = chapterAt(m.d.chapters, sec);
    return c ? `｜チャプター「${c.title}」` : '';
  };
  const quote = (sec: number) => {
    for (const s of linesAround(m.d.transcript ?? [], sec)) p(`  > ${fmtSec(s.start)} ${s.text}`);
  };

  p(`# ${v.title} の振り返り`);
  p();
  p(`- 公開: ${v.publishedAt.slice(0, 10)}（公開から${m.ageDays}日）／尺 ${fmtSec(v.durationSec)}／種類 ${CONTENT_LABEL[m.type]}${m.typeSource === '推定' ? '（尺と配信の有無からの推定）' : ' [API]'}`);
  p(`- ${v.url}`);
  p(`- 比べる相手: 同じ種類の他の動画 ${peers.length} 本の中央値`);
  header(p, data);
  p();

  p('## 公開後の推移 [API]');
  p();
  if (!m.d.analytics || !data.dataThrough) {
    p(`Analytics API のデータがありません（node scripts/fetch_own_analytics.ts data/<slug> --video ${v.id}）`);
  } else {
    p('| 時点 | 再生数 | 平均視聴時間 | 平均視聴率 | 登録者の増加 | 他の動画の中央値（再生数／平均視聴率） |');
    p('|---|--:|--:|--:|--:|--:|');
    for (const w of WINDOWS) {
      const c = m.windows[w];
      const pv = medOf(peers, (x) => x.windows[w]?.views ?? null);
      const pa = medOf(peers, (x) => x.windows[w]?.avgViewPercentage ?? null);
      p(c
        ? `| ${WINDOW_LABEL[w]} | ${withMark(fmt(c.views), c.views, pv)} | ${secText(c.avgViewDurationSec)} | ${withMark(pctValue(c.avgViewPercentage), c.avgViewPercentage, pa)} | ${c.subscribersGained} | ${fmt(pv)}／${pctValue(pa)} |`
        : `| ${WINDOW_LABEL[w]} | 未到達 | | | | ${fmt(pv)}／${pctValue(pa)} |`);
    }
  }
  p();

  p('## 新しい視聴者とリピーター [Studio]（公開からの通算）');
  p();
  if (!Object.keys(m.d.studio).length) {
    p('Studio の CSV がありません（node scripts/import_studio.ts data/<slug>）');
  } else {
    p('| | 再生数 | 平均視聴時間 | 平均視聴率（中央値） |');
    p('|---|--:|--:|--:|');
    for (const [vt, label] of [['new', '新しい視聴者'], ['returning', 'リピーター'], ['all', '全体']] as const) {
      const r = m.d.studio[vt];
      if (!r) continue;
      const med = medOf(peers, pctOf(vt));
      p(`| ${label} | ${fmt(r.views)} | ${secText(r.avgViewDurationSec)} | ${withMark(pctValue(r.avgViewPercentage), r.avgViewPercentage, med)}（${pctValue(med)}） |`);
    }
    const a = m.d.studio.all;
    if (a) p(`- インプレッション ${fmt(a.impressions)}／クリック率 ${withMark(pctValue(a.ctr), a.ctr, medOf(peers, ctr))}（中央値 ${pctValue(medOf(peers, ctr))}）`);
    if (m.newShare != null) p(`- 再生のうち新しい視聴者の割合: ${pctRatio(m.newShare)}（中央値 ${pctRatio(medOf(peers, (x) => x.newShare))}）`);
  }
  p();

  p('## 流入元 [API]');
  p();
  const traffic = m.d.analytics?.traffic ?? [];
  const total = traffic.reduce((s, x) => s + x.views, 0);
  if (!total) {
    p('データがありません');
  } else {
    p('| 流入元 | 再生数 | 割合 |');
    p('|---|--:|--:|');
    for (const t of traffic) p(`| ${trafficLabel(t.source)} | ${fmt(t.views)} | ${pctRatio(t.views / total)} |`);
    const search = m.d.analytics?.trafficDetail.YT_SEARCH ?? [];
    if (search.length) p(`- YouTube検索の語（上位）: ${search.slice(0, 10).map((x) => `${esc(x.detail)}（${fmt(x.views)}）`).join('、')}`);
    const related = m.d.analytics?.trafficDetail.RELATED_VIDEO ?? [];
    if (related.length) p(`- 関連動画として出た先（上位）: ${related.slice(0, 5).map((x) => `https://youtu.be/${x.detail}（${fmt(x.views)}）`).join('、')}`);
  }
  p();

  p('## 維持率 [API]');
  p();
  const ret = m.d.analytics?.retention ?? null;
  if (!ret) {
    p('曲線がありません（再生が少ないか、未取得）');
  } else {
    p(`- 冒頭${OPENING_SEC}秒の維持率: ${pctRatio(m.opening)}（中央値 ${pctRatio(medOf(peers, (x) => x.opening))}）`);
    const rel = v.durationSec > OPENING_SEC ? pointAtSec(ret, v.durationSec, OPENING_SEC)?.relative ?? null : null;
    if (rel != null) p(`- 同じ長さの動画との比較（参考。YouTube が算出、0.5が平均）: 冒頭${OPENING_SEC}秒で ${rel.toFixed(2)}`);
    p();
    p('### 離脱場所');
    p();
    if (m.drops == null) p('未実装（scripts/own/retention.ts の detectDrops）');
    else if (!m.drops.length) p('目立つ所はありません');
    else for (const x of m.drops) { p(`- **${fmtDrop(x)}**${context(x.atSec)}`); quote(x.atSec); }
    p();
    p('### 見返された場所');
    p();
    if (!m.rises.length) p('目立つ所はありません');
    else for (const x of m.rises) { p(`- **${fmtRise(x)}**${context(x.atSec)}`); quote(x.atSec); }
  }
  p();

  p(`## 冒頭${OPENING_SEC}秒の発言 [文字起こし]`);
  p();
  if (!m.d.transcript) p(`文字起こしがありません（node scripts/fetch_transcript.ts data/<slug> --video ${v.id}。取れない場合は transcripts/${v.id}.srt を置く）`);
  else p('> ' + m.d.transcript.filter((s) => s.start < OPENING_SEC).map((s) => s.text).join(' '));
  return L.join('\n') + '\n';
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `node --test tests/own/report.test.ts tests/own/load.test.ts && npm run typecheck`
Expected: PASS（11件）、型エラー0件

- [ ] **Step 6: CLI `scripts/analyze_own.ts` を書く**

```ts
#!/usr/bin/env node
// 自分のチャンネルの振り返りレポートを出す（APIは使わない）
// 使い方: node scripts/analyze_own.ts data/<slug> [--video <id>] [--since YYYY-MM]
// 入力: fetch_own_analytics.ts / import_studio.ts / fetch_transcript.ts の出力（ないものは空欄になる）。own/tags.csv（video_id,type）は任意
// 出力: data/<slug>/own/report.md、--video のときは data/<slug>/own/videos/<id>.md
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.ts';
import { loadOwnData } from './own/load.ts';
import { renderChannelReport, renderVideoReport } from './own/report.ts';
import { argValue, defaultSince } from './own/targets.ts';
import type { OwnData } from './own/types.ts';

const dirArg = process.argv[2];
if (!dirArg || dirArg.startsWith('--')) {
  console.error('使い方: node scripts/analyze_own.ts data/<slug> [--video <id>] [--since YYYY-MM]');
  process.exit(1);
}
const dir = path.resolve(ROOT, dirArg);
const video = argValue(process.argv, '--video');
const since = argValue(process.argv, '--since') ?? defaultSince(new Date());

let data: OwnData;
let md: string;
try {
  data = loadOwnData(dir, new Date(), { since, include: video });
  md = video ? renderVideoReport(data, video) : renderChannelReport(data);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const out = video ? path.join(dir, 'own', 'videos', `${video}.md`) : path.join(dir, 'own', 'report.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.log(`${data.videos.length} 本を集計 → ${path.relative(ROOT, out)}`);
```

- [ ] **Step 7: 合成データで、データがない状態でも出せることを確かめる**

```bash
M="${TMPDIR:-/tmp}/own-report" && rm -rf "$M" && cp -r tests/fixtures/sample-channel "$M" \
  && node scripts/analyze_own.ts "$M" --since 2026-01 && head -20 "$M/own/report.md" \
  && node scripts/analyze_own.ts "$M" --video vid00xxxxxx && grep -c "" "$M/own/videos/vid00xxxxxx.md"
```

Expected: `report.md` の先頭に「⚠ Analytics API のデータがありません」「⚠ Studio の CSV を取り込んでいません」があり、`## 通常動画` `## ショート` `## ライブ` の節が出る（種類は推定）。1本のレポートも書き出される

- [ ] **Step 8: 全テストと型を確かめてコミット**

Run: `npm test && npm run typecheck`
Expected: fail 0（todo 4 は detectDrops）、型エラー0件

```bash
git add scripts/own/load.ts scripts/own/report.ts scripts/analyze_own.ts tests/own/report.test.ts tests/own/load.test.ts
git commit -m "自分のチャンネルの振り返りレポート（全動画・1本）を出す analyze_own.ts を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README・CLAUDE.md・スキルのパートC

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `skills/youtube-channel-research/SKILL.md`

- [ ] **Step 1: README に「自分のチャンネルを分析する」を足す**

`README.md` の「## スクリプト」の直前に、次の節を足す:

````markdown
## 自分のチャンネルを分析する（初回だけ）

自分（またはクライアント）のチャンネルは、YouTube Analytics API（ログインが必要）と YouTube Studio の CSV で、新しい視聴者／リピーター別の数字・維持率・流入元まで見られます。チャンネルの持ち主の Google アカウントで行います。

1. **YouTube Analytics API を有効にする**：上で作った Google Cloud のプロジェクトで、https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com の「有効にする」を押す
2. **OAuth 同意画面を作る**：「Google Auth Platform」で、対象を「外部」にしてアプリ名などを入れる。「対象」でテストユーザーに自分のアカウントを足す
   - **そのあと「アプリを公開」で「本番環境」にする。**「テスト」のままだと、ログインが7日で切れます。個人で使う分には審査は不要です（ログインのときに「確認されていないアプリ」と出るので、「詳細」から進む）
3. **OAuth クライアントを作る**：https://console.cloud.google.com/apis/credentials の「認証情報を作成 → OAuth クライアント ID」で、種類を「**デスクトップ アプリ**」にする。クライアント ID とシークレットを `.env` の `YOUTUBE_OAUTH_CLIENT_ID=` と `YOUTUBE_OAUTH_CLIENT_SECRET=` に貼る
4. **ログインする**：`node scripts/own_auth.ts` を実行し、開いたブラウザで、分析したいチャンネルのアカウント（ブランドアカウントならそのチャンネル）を選んで承認する。`.env` に `YOUTUBE_OAUTH_REFRESH_TOKEN` が書き込まれます（画面には出ません）
5. **Studio の CSV を書き出す**（動画を出すたびに更新）：YouTube Studio →「アナリティクス」→「詳細モード」→「コンテンツ」タブで期間を選び、右上の書き出しボタンから「カンマ区切り値（.csv）」を選ぶ。できた zip を `data/<slug>/own/studio/all/` に置く。続けて、フィルタで「視聴者の種類：新しい視聴者」にして書き出したものを `new/` に、「リピーター」にしたものを `returning/` に置く

文字起こし（`fetch_transcript.ts`）は、YouTube の非公式の内部API（`youtube-transcript-plus`）を使います。YouTube 側の変更で動かなくなることがあります。取れないときは、Studio の「字幕」から字幕ファイルを落とし、`data/<slug>/transcripts/<動画ID>.srt` に置けば使えます。
````

`README.md` の「## スクリプト」の表の末尾に、次の行を足す:

```markdown
| `node scripts/own_auth.ts` | 自分のチャンネルの Analytics API に、初回だけログインする | 0 |
| `node scripts/fetch_own_analytics.ts data/<slug> [--video ID] [--since YYYY-MM]` | 動画ごとに、種類・公開後28日の日ごとの数字・維持率の曲線・流入元（検索語・関連動画）を取る | 0（Analytics API） |
| `node scripts/import_studio.ts data/<slug>` | Studio の CSV（`own/studio/{all,new,returning}/`）を取り込む | 0 |
| `node scripts/fetch_transcript.ts data/<slug> [--video ID \| --ids a,b] [--yes]` | 文字起こしを取る（自分・ベンチマークどちらの動画でも）。20本を超えるときは `--yes` が必要 | 0（非公式の通信） |
| `node scripts/analyze_own.ts data/<slug> [--video ID]` | 全動画の `own/report.md`、または1本の `own/videos/<ID>.md` を出す | 0 |
| `npm test` / `npm run typecheck` | テストと型の確認 | 0 |
```

- [ ] **Step 2: CLAUDE.md に足す**

`CLAUDE.md` の箇条書きの末尾に、次を足す:

```markdown
- 自分（クライアント）のチャンネルの振り返りは、スキルのパートCに従う。データは YouTube Analytics API（OAuth、`scripts/own_auth.ts`）と Studio の CSV で取る。`.env` の `YOUTUBE_OAUTH_*` も表示しない
- `fetch_transcript.ts` は非公式の通信を使う。取りに行く本数を決めてから実行し、20本を超えるときはユーザーに確認してから `--yes` を付ける
```

- [ ] **Step 3: SKILL.md にパートCを足す**

`skills/youtube-channel-research/SKILL.md` の frontmatter の `description` を次に置き換える:

```yaml
description: YouTubeの運用者を育てるためのリサーチ。①チャンネルが「なぜ伸びているか」を仮説として立て、データと4つの立場からの評価で検証する。②チャンネルから見つかったキーワードのYouTube検索結果を見て、誰がどんな動画で上位を取っているか、入る余地があるかを分析する。③自分（クライアント）のチャンネルを、新しい視聴者／リピーター・維持率・流入元・文字起こしで振り返り、「なぜこの動画は伸びたか」を仮説検証する。どれも、運用者が自分で考えられるように問いを添える。「このチャンネルを分析して」「伸びている理由」「このキーワードの検索結果を見て」「競合リサーチ」「自分のチャンネルを振り返って」「この動画の振り返り」で使う。
```

「## ゴール」の番号付きリストに、3つ目を足す:

```markdown
3. **自分（クライアント）のチャンネルで、なぜこの動画は伸びて、あの動画は伸びなかったのかを検証する**（パートC）
```

「## 準備（初回のみ）」の「**クライアント自身のチャンネルを分析する場合**」の箇条（その下の3つの小項目を含む）を、次の1項目に置き換える:

```markdown
- **クライアント自身のチャンネルを分析する場合**：パートCに従う。YouTube Studio のデータと Analytics API を、ラッコの相関より優先する
```

「## パートB：キーワードの検索結果を分析する」の節の終わり（「## 検証の幅を広げる」の直前）に、次を足す:

````markdown
---

## パートC：自分のチャンネルを振り返る

運用者自身（またはクライアント）のチャンネルを、新しい視聴者とリピーターに分けて振り返り、「なぜこの動画は伸びて、あの動画は伸びなかったか」を仮説として検証する。チャンネルの持ち主の協力（ログインと Studio の書き出し）が必要になる。

- **チャンネルの前提を決めつけない。** 目的・本数・動画の種類はチャンネルごとに違う。目的はヒアリングで聞き、C3 の「何を伸びたとするか」にだけ使う
- **通常動画・ショート・ライブを混ぜない。** レポートも種類ごとに分かれている
- 数字には出典を書く（[Studio]／[API]／[文字起こし]／ラッコ）

### C0：準備（初回のみ）

- ログイン：README「自分のチャンネルを分析する」の手順（ユーザーが行う）。`.env` の `YOUTUBE_OAUTH_CLIENT_ID`・`YOUTUBE_OAUTH_REFRESH_TOKEN` の有無だけを確かめ、値は表示しない
- ヒアリング（上の「準備」と同じ）。加えて「**このチャンネルで何を伸ばしたいか**」を聞く（例：新しい視聴者を増やしたい／リピーターを育てたい／登録者を増やしたい／案件の営業資料にしたい）

### C1：データを揃える

```bash
node scripts/fetch_channel.ts @handle
node scripts/fetch_own_analytics.ts data/<slug> [--since YYYY-MM]
node scripts/import_studio.ts data/<slug>      # Studio の CSV を own/studio/{all,new,returning}/ に置いてから（書き出しはユーザーに頼む）
node scripts/analyze_own.ts data/<slug>        # → own/report.md
```

`import_studio.ts` が「列が見つかりません」と出したら、実際の列名を確かめて `scripts/own/studio_csv.ts` の `STUDIO_COLUMNS` に足す。

### C2：1本を振り返る

ユーザーが動画を指定したとき、または C3 で比べる上位・下位の動画について行う。

```bash
node scripts/fetch_own_analytics.ts data/<slug> --video <id>
node scripts/fetch_transcript.ts data/<slug> --video <id>
node scripts/analyze_own.ts data/<slug> --video <id>   # → own/videos/<id>.md
```

**返答に入れるもの**

- 公開後の推移：48時間・7日・28日のどこで、同じ種類の中央値と差がついたか
- 流入元：どの経路で見られたか。検索なら語、関連動画ならどの動画の横か
- 新しい視聴者とリピーター：平均視聴率の差（どちらに刺さったか）、クリック率
- 離脱場所と見返された場所：そのとき話していた内容を文字起こしから引用する。**なぜ離脱したかは仮説として書く**
- 運用者への問い 1個

### C3：伸びた理由を仮説検証する

0. **何を「伸びた」とするかを決める**：C0 で聞いた目的から、重く見る指標を決めて書く（例：新しい視聴者を増やしたい → 新規の再生数とブラウジングからの流入、リピーターを育てたい → リピーターの平均視聴率、登録者を増やしたい → 登録者の増加）。既定は公開7日時点の再生数
1. **伸びた・伸びなかったを分ける**：同じ種類の動画の中で、公開7日時点の指標で並べる（同じ日数なので公平）。7日に達していない動画は外す。公開7日のデータがある動画が10本未満なら上位と下位の数本を、10本以上なら `report.md` の「上位・下位の比較」（4分の1ずつ）を使う
2. **差を並べる**：上位と下位で、流入元・新規の割合・クリック率・冒頭30秒の維持率・離脱場所とその時の発言・題材を並べる。文字起こしは比べる動画だけ取る（`fetch_transcript.ts --ids a,b,c`）。題材の検索数を見るときは、ラッコのキャッシュを先に見る
3. **仮説を立てる（O1〜）**：それぞれに「正しければ何が見えるはずか」を1行で書く。予測を書けない仮説は検証の対象にしない
   - まず流入元で絞る。ブラウジング・関連動画で伸びたならサムネ・タイトル・冒頭を、検索で伸びたなら検索語と題材を見る
4. **今あるデータで確かめる**：予測 → 結果（数字と出典）→ 判定（支持／否定／保留）→ 仮説の修正、を書く。本数が少ないと多くが「保留」になる。**そう正直に書く**
5. **返答の最後に**、運用者への問いを1〜2個置く

### C4：次の動画で確かめる

- 保留の仮説から1つ選び、次の動画の企画で試す
- **公開前に**台帳へ書く：仮説番号（O1〜）、次の動画で変えること、予測（指標・時点・中央値との差。例：「冒頭30秒の維持率が中央値より5pt高くなる」）
- 公開7日後に C2 を回して判定し、台帳を更新する。本数が少ないうちは、これがいちばん確かな検証になる

仮説は、パートA・Bと同じ台帳に、自分のチャンネルの仮説として記録する（番号は O1〜。ベンチマークの H・K と区別する）。
````

- [ ] **Step 4: 表記の漏れがないかを確かめる**

Run: `git grep -n "\.mjs" -- README.md CLAUDE.md skills scripts examples | grep -v "scripts/lib.mjs" ; npm test && npm run typecheck`
Expected: 1つ目は、`lib.mjs` の中継の説明と `data/<slug>/why/classify.mjs`（既存のローカルファイルの説明）以外に出ない。テスト fail 0、型エラー0件

- [ ] **Step 5: コミット**

```bash
git add README.md CLAUDE.md skills/youtube-channel-research/SKILL.md
git commit -m "自分のチャンネルの振り返り（パートC）の手順と、OAuth・Studio CSV の準備を書く

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## クラウドで実行したあとに、手元で行う作業

クラウドの環境には `.env`（APIキー・OAuth）、`data/`、ブラウザがないため、次は手元で行う。

- **L1：ログイン**（ユーザー）：README「自分のチャンネルを分析する」の1〜4。`node scripts/own_auth.ts`
- **L2：Studio の書き出しと列名の確認**（ユーザー → Claude）：README の5で `all/` `new/` `returning/` に置き、`node scripts/import_studio.ts data/<slug>` を回す。「列が見つかりません」が出たら、実際の列名を `STUDIO_COLUMNS` に足し、テストのフィクスチャにも同じ列名を足す。**「視聴者の種類」のフィルタが「コンテンツ」タブで使えない場合は、書き出し手順を README と SKILL.md で直し、設計書の「Studio CSVの列（未確定）」に結果を書く**
- **L3：`detectDrops` を書く**（ユーザー）：`scripts/own/retention.ts` の `detectDrops`（5〜10行）。書いたら `tests/own/retention.test.ts` の `todo` を外し、`npm test` が通ることを確かめる
- **L4：既存の分類スクリプトの確認**（Claude）：`data/tabbata/why/classify.mjs` と `data/izumidaizm/why/classify.mjs` が中継の `lib.mjs` で動くこと。`node scripts/analyze_channel.ts data/<既存のslug>` の出力が、移行前のコミットの `.mjs` と同じこと
- **L5：通しで確かめる**（Claude）：自分のチャンネルで `fetch_channel.ts` → `fetch_own_analytics.ts` → `import_studio.ts` → `fetch_transcript.ts --video` → `analyze_own.ts`（全動画と `--video`）。実際の API の値（`creatorContentType` の表記、流入元の値）がテストの前提と違えば直す
