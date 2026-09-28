#!/usr/bin/env node
// 自分のチャンネルの YouTube検索語（Analytics API）を keywords.csv に書き出し、ラッコで月間検索数を取れるようにする（APIは使わない）
// 使い方: node scripts/own_keywords.ts data/<slug> [--min-views 2] [--top 45]
//   検索語は、チャンネル全体で再生の多い順に --top 語まで（ラッコは50語ごとにクレジットがかかるので、題材語のぶんを空けておく）
//   種類「題材語」の行（タイトルや内容から手で足したもの）は残す
// 入力: data/<slug>/own/analytics/*.json（fetch_own_analytics.ts の出力）
// 出力: data/<slug>/keywords.csv。次は node scripts/rakko_cache.ts missing data/<slug>
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseCsv, toCsv } from './lib.ts';
import { buildKeywordRows, SEARCH_TYPE, type KeywordRow } from './own/keywords.ts';
import { argValue } from './own/targets.ts';
import type { OwnAnalytics } from './own/types.ts';

const dirArg = process.argv[2];
if (!dirArg || dirArg.startsWith('--')) {
  console.error('使い方: node scripts/own_keywords.ts data/<slug> [--min-views 2] [--top 45]');
  process.exit(1);
}
const dir = path.resolve(ROOT, dirArg);
const analyticsDir = path.join(dir, 'own', 'analytics');
if (!fs.existsSync(analyticsDir)) {
  console.error(`${path.relative(ROOT, analyticsDir)} がありません。先に node scripts/fetch_own_analytics.ts ${dirArg} を実行してください`);
  process.exit(1);
}
const analytics: OwnAnalytics[] = fs.readdirSync(analyticsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(analyticsDir, f), 'utf8')));
const kwPath = path.join(dir, 'keywords.csv');
const existing = fs.existsSync(kwPath)
  ? parseCsv(fs.readFileSync(kwPath, 'utf8')).map((r): KeywordRow => ({ video_id: r.video_id ?? '', keyword: r.keyword ?? '', type: r.type ?? '' }))
  : [];
const rows = buildKeywordRows(analytics, existing, {
  minViews: Number(argValue(process.argv, '--min-views') ?? 2),
  top: Number(argValue(process.argv, '--top') ?? 45),
});
fs.writeFileSync(kwPath, toCsv(rows as unknown as Record<string, unknown>[], ['video_id', 'keyword', 'type']));
const search = rows.filter((r) => r.type === SEARCH_TYPE);
console.log(`検索語 ${new Set(search.map((r) => r.keyword)).size} 語（${search.length} 行）、ほかの行 ${rows.length - search.length} 行 → ${path.relative(ROOT, kwPath)}`);
console.log(`次は: node scripts/rakko_cache.ts missing ${dirArg}`);
