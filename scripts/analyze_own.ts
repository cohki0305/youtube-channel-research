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
