#!/usr/bin/env node
// ラッコの月間検索数をキャッシュする（ラッコMCPはClaudeが直接呼ぶので、このスクリプトはファイルの出し入れだけを行う）
//
// 使い方:
//   node scripts/rakko_cache.ts missing data/<slug> [data/<slug2> ...]
//       → 各ディレクトリの keywords.csv の語のうち、キャッシュにない語・古い語を JSON 配列で出す。
//         複数チャンネル分をまとめて1回の search-volume-history に送るために使う
//   node scripts/rakko_cache.ts put <file.csv>
//       → ラッコの結果（列: keyword,search_volume,yoy,latest_month）をキャッシュに入れる
//   node scripts/rakko_cache.ts volumes data/<slug>
//       → キャッシュから data/<slug>/volumes.csv を作る（correlate.ts の入力）
//
// キャッシュ: data/_cache/rakko/volumes.json（地域 Japan・言語 Japanese のみ）
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseCsv } from './lib.ts';

// キャッシュの1件（data/_cache/rakko/volumes.json の値）
interface CacheEntry { searchVolume: number; yoy: number | null; latestMonth: string | null; fetchedAt: string }

const CACHE = path.join(ROOT, 'data', '_cache', 'rakko', 'volumes.json');
const load = (): Record<string, CacheEntry> => (fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {});
const save = (c: Record<string, CacheEntry>): void => {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(c, null, 2));
};
const norm = (k: string): string => k.trim().replace(/\s+/g, ' ');

// キャッシュの1件が、まだ使えるかどうかを返す
//   entry.latestMonth: ラッコの結果に含まれていた最新月（"YYYY-MM"）
//   entry.fetchedAt:   ラッコから取得した日時（ISO文字列）
//   now:               現在の Date
// 方針: 「新しい月のデータが出るまで」は使い続ける
export function isFresh(entry: CacheEntry, now: Date): boolean {
  // 仮の実装（Claude）: 今月に取得したものは使う。
  // 月初は、ラッコがまだ先月分を出していないことがある。取り直しても同じデータが返り、クレジットだけ減る。
  // そのため、最新月ではなく取得した月で判断する。月の途中でラッコが更新しても、次の月まで取り直さない
  const f = new Date(entry.fetchedAt);
  return f.getFullYear() === now.getFullYear() && f.getMonth() === now.getMonth();
}

const keywordsOf = (dir: string): string[] => {
  const p = path.resolve(ROOT, dir, 'keywords.csv');
  if (!fs.existsSync(p)) {
    console.error(`${path.relative(ROOT, p)} がありません`);
    process.exit(1);
  }
  return [...new Set(parseCsv(fs.readFileSync(p, 'utf8')).map((r) => norm(r.keyword || '')).filter(Boolean))];
};

const [cmd, ...rest] = process.argv.slice(2);
const cache = load();
const now = new Date();

if (cmd === 'missing') {
  const all = [...new Set(rest.flatMap(keywordsOf))];
  const miss = all.filter((k) => !cache[k] || !isFresh(cache[k], now));
  console.error(`対象 ${all.length} 語 / キャッシュ利用 ${all.length - miss.length} 語 / 取得が必要 ${miss.length} 語`);
  if (miss.length > 50) console.error('50語を超えています。ライトプランは50語ごとに最低50クレジットかかるので、分けて送るか語を絞ること');
  console.log(JSON.stringify(miss));
} else if (cmd === 'put') {
  const rows = parseCsv(fs.readFileSync(path.resolve(rest[0]), 'utf8'));
  for (const r of rows) {
    const k = norm(r.keyword || '');
    if (!k || r.search_volume === '' || r.search_volume == null) continue;
    cache[k] = {
      searchVolume: +r.search_volume,
      yoy: r.yoy === '' || r.yoy == null ? null : +r.yoy,
      latestMonth: r.latest_month || null,
      fetchedAt: now.toISOString(),
    };
  }
  save(cache);
  console.log(`${rows.length} 語をキャッシュに入れました → ${path.relative(ROOT, CACHE)}`);
} else if (cmd === 'volumes') {
  const kws = keywordsOf(rest[0]);
  const lines = ['keyword,search_volume,yoy'];
  const miss: string[] = [];
  for (const k of kws) {
    const e = cache[k];
    if (!e) {
      miss.push(k);
      continue;
    }
    lines.push(`${k},${e.searchVolume},${e.yoy ?? ''}`);
  }
  const out = path.resolve(ROOT, rest[0], 'volumes.csv');
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`${lines.length - 1} 語 → ${path.relative(ROOT, out)}`);
  if (miss.length) console.error(`キャッシュにない語（先に missing → ラッコ → put を行う）: ${miss.join(' / ')}`);
} else {
  console.error('使い方: node scripts/rakko_cache.ts missing|put|volumes ...（ファイル先頭のコメント参照）');
  process.exit(1);
}
