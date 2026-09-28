// YouTube Studio（詳細モード）の書き出し CSV を、動画ごとの値にそろえる
import type { StudioRow, ViewerType } from './types.ts';

// 書き出しの zip に入っている表のファイル名
export const STUDIO_TABLE_NAMES = ['表データ.csv', 'Table data.csv'];

export type StudioField = 'videoId' | 'views' | 'avgViewDurationSec' | 'avgViewPercentage' | 'impressions' | 'ctr' | 'newViewers' | 'returningViewers' | 'uniqueViewers';

// Studio の列名（日本語UI・英語UI）。実際の書き出しで違っていたら、ここに足す
export const STUDIO_COLUMNS: Record<StudioField, string[]> = {
  videoId: ['コンテンツ', 'Content'],
  views: ['視聴回数', 'Views'],
  avgViewDurationSec: ['平均視聴時間', 'Average view duration'],
  avgViewPercentage: ['平均視聴率 (%)', '平均再生率 (%)', 'Average percentage viewed (%)'],
  impressions: ['サムネイルのインプレッション', 'インプレッション数', 'Thumbnail impressions', 'Impressions'],
  ctr: ['サムネイルのクリック率 (%)', 'インプレッションのクリック率 (%)', 'Thumbnail click-through rate (%)', 'Impressions click-through rate (%)'],
  // 視聴者の人数（再生回数ではない）。フィルタなしの書き出しに入っている
  newViewers: ['新しい視聴者数', 'New viewers'],
  returningViewers: ['リピーター', 'Returning viewers'],
  uniqueViewers: ['ユニーク視聴者数', 'Unique viewers'],
};
// なくても警告しない列（古い書き出しや、フィルタをかけた書き出しには入っていないことがある）
const OPTIONAL: StudioField[] = ['newViewers', 'returningViewers', 'uniqueViewers'];

// 全角・半角、空白の違いを無視して列名を比べる
const key = (h: string) => h.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseNum(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.replace(/[,%\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

// "0:04:12" / "4:12" → 秒
export function parseHms(s: string | undefined): number | null {
  const m = s?.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function normalizeStudioRows(rows: Record<string, string>[], viewerType: ViewerType): { rows: StudioRow[]; missingColumns: StudioField[] } {
  const headers = Object.keys(rows[0] ?? {});
  const col = {} as Record<StudioField, string | null>;
  const missingColumns: StudioField[] = [];
  for (const f of Object.keys(STUDIO_COLUMNS) as StudioField[]) {
    const wanted = STUDIO_COLUMNS[f].map(key);
    col[f] = headers.find((h) => wanted.includes(key(h))) ?? null;
    if (!col[f] && !OPTIONAL.includes(f)) missingColumns.push(f);
  }
  const get = (r: Record<string, string>, f: StudioField): string | undefined => {
    const c = col[f];
    return c ? r[c] : undefined;
  };
  const out: StudioRow[] = [];
  for (const r of rows) {
    const id = get(r, 'videoId')?.trim() ?? '';
    if (!VIDEO_ID.test(id)) continue; // 「合計」「Total」の行など
    const dur = get(r, 'avgViewDurationSec');
    out.push({
      videoId: id,
      viewerType,
      views: parseNum(get(r, 'views')),
      avgViewDurationSec: parseHms(dur) ?? parseNum(dur),
      avgViewPercentage: parseNum(get(r, 'avgViewPercentage')),
      impressions: parseNum(get(r, 'impressions')),
      ctr: parseNum(get(r, 'ctr')),
      ...(col.newViewers || col.returningViewers || col.uniqueViewers
        ? { newViewers: parseNum(get(r, 'newViewers')), returningViewers: parseNum(get(r, 'returningViewers')), uniqueViewers: parseNum(get(r, 'uniqueViewers')) }
        : {}),
    });
  }
  return { rows: out, missingColumns };
}
