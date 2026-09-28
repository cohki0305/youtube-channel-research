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
  views: number; // API の views（ホームの自動再生なども数える。Studio の「視聴回数」）
  engagedViews: number; // エンゲージビュー（平均視聴時間から逆算）
  minutes: number;
  avgViewDurationSec: number | null; // エンゲージビュー1回あたり（Studio の「平均視聴時間」と同じ考え方）
  avgViewPercentage: number | null; // 平均視聴時間 ÷ 尺（％）
  subscribersGained: number;
}

// 日ごとのエンゲージビュー。API の averageViewDuration はエンゲージビュー1回あたりなので、総視聴時間から逆算する
// （平均が0の日は views で代える）
const engagedOf = (r: DailyRow) => (r.averageViewDuration > 0 ? (r.estimatedMinutesWatched * 60) / r.averageViewDuration : r.views);

// 公開日（太平洋時間）から days 日間の累計。dataThrough までに届いていなければ null（未到達）
export function cumulativeAt(daily: DailyRow[], publishedPt: string, days: number, durationSec: number, dataThrough: string): Cumulative | null {
  const end = addDays(publishedPt, days - 1);
  if (end > dataThrough) return null;
  const rows = daily.filter((r) => r.day >= publishedPt && r.day <= end);
  const views = sum(rows.map((r) => r.views));
  const engaged = sum(rows.map(engagedOf));
  const minutes = sum(rows.map((r) => r.estimatedMinutesWatched));
  const avgViewDurationSec = engaged > 0 ? (minutes * 60) / engaged : null;
  const avgViewPercentage = avgViewDurationSec != null && durationSec > 0 ? Math.min(100, (avgViewDurationSec / durationSec) * 100) : null;
  return { views, engagedViews: Math.round(engaged), minutes, avgViewDurationSec, avgViewPercentage, subscribersGained: sum(rows.map((r) => r.subscribersGained)) };
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
