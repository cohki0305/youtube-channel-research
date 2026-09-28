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
