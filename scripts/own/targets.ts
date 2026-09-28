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
