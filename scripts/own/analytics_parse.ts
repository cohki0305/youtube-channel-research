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
