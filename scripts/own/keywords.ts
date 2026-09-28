// 自分のチャンネルの YouTube検索語を、ラッコに渡す keywords.csv（video_id,keyword,type）の行にする
import type { OwnAnalytics } from './types.ts';

export const SEARCH_TYPE = 'YouTube検索語'; // Analytics API から自動で入れる
export const TOPIC_TYPE = '題材語'; // タイトルや内容から手で足す（作り直しても残す）

export interface KeywordRow { video_id: string; keyword: string; type: string; }

// rakko_cache.ts と同じ正規化（前後の空白を取り、空白を1つにまとめる）
export const normKeyword = (k: string) => k.trim().replace(/\s+/g, ' ');

// 検索語はチャンネル全体の再生の多い順に top 語まで（minViews 未満は外す）。検索語以外の行（題材語など）は残す
export function buildKeywordRows(analytics: OwnAnalytics[], existing: KeywordRow[], o: { minViews: number; top: number }): KeywordRow[] {
  const keep = existing.filter((r) => r.type !== SEARCH_TYPE);
  const total = new Map<string, number>();
  for (const a of analytics) for (const d of a.trafficDetail.YT_SEARCH) {
    const k = normKeyword(d.detail);
    total.set(k, (total.get(k) ?? 0) + d.views);
  }
  const chosen = [...total].filter(([, v]) => v >= o.minViews).sort((x, y) => y[1] - x[1]).slice(0, o.top).map(([k]) => k);
  const rows: KeywordRow[] = [];
  for (const k of chosen) for (const a of analytics) {
    if (a.trafficDetail.YT_SEARCH.some((d) => normKeyword(d.detail) === k)) rows.push({ video_id: a.videoId, keyword: k, type: SEARCH_TYPE });
  }
  return [...keep, ...rows];
}
