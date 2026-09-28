// 維持率の曲線から、動画どうしで比べる「曲線の形」と、1本の中で前後より急な所（離脱・見返し）を出す
//
// どこでどれだけ落ちるかは動画ごとに違うので、決まった秒で区切って除くことはしない。
//  - 曲線の形：決まった時点の維持率、折れ線の当てはめ（区分線形回帰）で求めた「落ち着いた時点」と前後の落ち方
//  - 離脱・見返し：その動画自身のふだんの落ち方（前後の中央値）と比べ、ロバストZスコアで外れた所
import { median } from '../lib.ts';
import type { RetentionPoint } from './types.ts';

export const OPENING_SEC = 30;
// 動画どうしで比べる時点（秒）
export const CHECKPOINTS_SEC = [30, 60, 120, 300];
// 最後の5%（終了画面での離脱）は、形の当てはめにも外れ値にも使わない
export const END_RATIO = 0.95;

// 外れ値の設定（変えたら tests/own/retention.test.ts を回す）
export const DIFF_POINTS = 2; // 何点ぶん（動画の何％ぶん）の変化で見るか。隣どうしの揺れを打ち消す
export const BASELINE_HALF = 5; // ふだんの落ち方を、前後何点の中央値で見るか
export const Z_THRESHOLD = 3.5; // ロバストZスコアの基準（Iglewicz & Hoaglin の推奨値）
export const MIN_EXCESS_PT = 1; // ふだんとの差がこれより小さければ、z が大きくても拾わない
const SCALE_FLOOR_PT = 0.25; // 曲線がなめらかすぎて MAD が0になるときの下限
export const ANOMALY_LIMIT = 3;

export interface Drop {
  atSec: number; // 落ち始めの秒
  from: number; // 落ちる前の watchRatio
  to: number; // 落ちた後の watchRatio
  deltaPt: number; // 落ちた幅（％ポイント。負の数）
  excessPt: number; // ふだんの落ち方より何ポイント急か（負の数）
  z: number; // ロバストZスコア
}
export interface Rise {
  atSec: number;
  from: number;
  to: number;
  risePt: number; // 上がった幅（％ポイント）
  excessPt: number; // ふだんより何ポイント上か
  z: number;
}
export interface Knee {
  atSec: number; // 落ち着いた時点（折れ目）
  level: number; // その時点の維持率（％）
  slopeBeforePerMin: number; // 折れ目までの落ち方（pt/分。負の数）
  slopeAfterPerMin: number; // 折れ目からの落ち方（pt/分）。本編に入ってからの離脱のペース
}

// sec 秒にいちばん近い位置の点
export function pointAtSec(points: RetentionPoint[], durationSec: number, sec: number): RetentionPoint | null {
  if (!points.length || durationSec <= 0) return null;
  const target = sec / durationSec;
  let best = points[0];
  for (const p of points) if (Math.abs(p.ratio - target) < Math.abs(best.ratio - target)) best = p;
  return best;
}

// sec 秒の時点で残っている割合。sec 秒以下の動画は出さない
export function retentionAt(points: RetentionPoint[], durationSec: number, sec: number): number | null {
  if (durationSec <= sec) return null;
  return pointAtSec(points, durationSec, sec)?.watchRatio ?? null;
}
export const openingRetention = (points: RetentionPoint[], durationSec: number) => retentionAt(points, durationSec, OPENING_SEC);

// 最小二乗の直線の傾きと、誤差の二乗和
function lineFit(xs: number[], ys: number[]): { slope: number; sse: number } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (my + slope * (xs[i] - mx))) ** 2;
  return { slope, sse };
}

// 区分線形回帰：曲線を折れ目1つの2本の直線で近似し、誤差の二乗和が最小になる折れ目を「落ち着いた時点」とする
export function fitKnee(points: RetentionPoint[], durationSec: number): Knee | null {
  const pts = points.filter((p) => p.ratio <= END_RATIO);
  if (pts.length < 8 || durationSec <= 0) return null;
  const xs = pts.map((p) => p.ratio * durationSec), ys = pts.map((p) => p.watchRatio * 100);
  let best: { k: number; sse: number; before: number; after: number } | null = null;
  for (let k = 3; k <= pts.length - 4; k++) {
    const a = lineFit(xs.slice(0, k + 1), ys.slice(0, k + 1)), b = lineFit(xs.slice(k), ys.slice(k));
    if (!best || a.sse + b.sse < best.sse) best = { k, sse: a.sse + b.sse, before: a.slope, after: b.slope };
  }
  if (!best) return null;
  return { atSec: Math.round(xs[best.k]), level: ys[best.k], slopeBeforePerMin: best.before * 60, slopeAfterPerMin: best.after * 60 };
}

interface Anomaly { start: number; end: number; excess: number; z: number; }

// DIFF_POINTS 点ぶんの変化から、前後の中央値（ふだんの落ち方）を引き、ロバストZスコアで外れた所をまとめる
// sign: -1 なら急に落ちた所、+1 なら上がった所
function anomalies(pts: RetentionPoint[], sign: -1 | 1): Anomaly[] {
  const n = pts.length - DIFF_POINTS;
  if (n < 2 * BASELINE_HALF) return [];
  const d = Array.from({ length: n }, (_, i) => (pts[i + DIFF_POINTS].watchRatio - pts[i].watchRatio) * 100);
  // 前後を同じ数だけ取る（端では狭める）。単調になめらかに変わる所では、中央値がその点自身になり差は0になる
  const r = d.map((x, i) => {
    const k = Math.min(BASELINE_HALF, i, n - 1 - i);
    return x - (median(d.slice(i - k, i + k + 1)) ?? x);
  });
  const mr = median(r) ?? 0;
  const scale = Math.max(1.4826 * (median(r.map((x) => Math.abs(x - mr))) ?? 0), SCALE_FLOOR_PT);
  const z = r.map((x) => (x - mr) / scale);
  const hit = r.map((x, i) => sign * z[i] >= Z_THRESHOLD && sign * x >= MIN_EXCESS_PT);
  const out: Anomaly[] = [];
  for (let i = 0; i < n; i++) {
    if (!hit[i]) continue;
    let j = i;
    while (j + 1 < n && hit[j + 1]) j++;
    let top = i;
    for (let t = i; t <= j; t++) if (sign * r[t] > sign * r[top]) top = t;
    out.push({ start: i, end: j + DIFF_POINTS, excess: r[top], z: z[top] });
    i = j;
  }
  return out.sort((a, b) => sign * b.excess - sign * a.excess).slice(0, ANOMALY_LIMIT);
}

// ふだんの落ち方より急に落ちた所（急な順に最大 ANOMALY_LIMIT 件）。導入部も含めて探す
export function detectDrops(points: RetentionPoint[], durationSec: number): Drop[] {
  const pts = points.filter((p) => p.ratio <= END_RATIO);
  return anomalies(pts, -1).map((a) => {
    const from = pts[a.start].watchRatio, to = pts[a.end].watchRatio;
    return { atSec: Math.round(pts[a.start].ratio * durationSec), from, to, deltaPt: (to - from) * 100, excessPt: a.excess, z: a.z };
  });
}

// ふだんより上がり、実際にも上がった所（見返された場所の候補）
export function detectRewatches(points: RetentionPoint[], durationSec: number): Rise[] {
  const pts = points.filter((p) => p.ratio <= END_RATIO);
  return anomalies(pts, 1)
    .map((a) => {
      const from = pts[a.start].watchRatio, to = pts[a.end].watchRatio;
      return { atSec: Math.round(pts[a.start].ratio * durationSec), from, to, risePt: (to - from) * 100, excessPt: a.excess, z: a.z };
    })
    .filter((r) => r.risePt > 0); // 落ち方がゆるくなっただけで、実際には下がっている所は除く
}
