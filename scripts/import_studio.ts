#!/usr/bin/env node
// YouTube Studio（詳細モード）から書き出した CSV を、「動画 × 視聴者の種類」にそろえて own/studio.json に保存する（APIは使わない）
// 使い方: node scripts/import_studio.ts data/<slug>
// 入力: data/<slug>/own/studio/ の下に、Studio の書き出し（zip のまま、または展開した「表データ.csv」）を置く
//   all/        … フィルタなし
//   new/        … 視聴者の種類「新しい視聴者」で絞ったもの
//   returning/  … 視聴者の種類「リピーター」で絞ったもの
// 出力: data/<slug>/own/studio.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseCsv, type Video } from './lib.ts';
import { normalizeStudioRows, STUDIO_TABLE_NAMES } from './own/studio_csv.ts';
import { readZip } from './own/zip.ts';
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

// フォルダの中の表の CSV を読む。zip があればいちばん新しいものの中から、なければ展開済みの CSV から探す
function readTableCsv(folder: string): string | null {
  const files = fs.readdirSync(folder);
  const zips = files
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .sort((a, b) => fs.statSync(path.join(folder, b)).mtimeMs - fs.statSync(path.join(folder, a)).mtimeMs);
  const pick = <T extends { name: string }>(items: T[]): T | undefined => {
    const csvs = items.filter((x) => x.name.toLowerCase().endsWith('.csv'));
    return items.find((x) => STUDIO_TABLE_NAMES.includes(x.name.normalize('NFC'))) ?? (csvs.length === 1 ? csvs[0] : undefined);
  };
  if (zips.length) return pick(readZip(fs.readFileSync(path.join(folder, zips[0]))))?.data.toString('utf8') ?? null;
  const hit = pick(files.map((name) => ({ name })));
  return hit ? fs.readFileSync(path.join(folder, hit.name), 'utf8') : null;
}

const rows: StudioRow[] = [];
const warnings: string[] = [];
for (const vt of ['all', 'new', 'returning'] as ViewerType[]) {
  const folder = path.join(dir, 'own', 'studio', vt);
  if (!fs.existsSync(folder)) {
    warnings.push(`own/studio/${vt}/ がありません（${vt === 'all' ? 'クリック率' : '新規／リピーター別の数字'}が空欄になります）`);
    continue;
  }
  const csv = readTableCsv(folder);
  if (!csv) {
    warnings.push(`own/studio/${vt}/ に ${STUDIO_TABLE_NAMES.join(' / ')} が見つかりません`);
    continue;
  }
  const r = normalizeStudioRows(parseCsv(csv), vt);
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
