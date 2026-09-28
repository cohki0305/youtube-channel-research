#!/usr/bin/env node
// キーワードのYouTube検索結果を取得し、誰が・どんな動画で上位にいるかを見る
// 使い方: node scripts/search_compare.ts "<検索語>" [--days 365] [--max 20] [--order relevance|viewCount] [--highlight @handle]
// クォータ: search 1回 = 100ユニット + videos/channels 各1ユニット。1日10,000ユニットに注意
// 出力: data/_search/<検索語>.md と .json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, requireApiKey, yt, quotaUsed, median, fmt, slug, isoDurationToSec } from './lib.ts';

// Data API の応答のうち、使う項目だけ
interface SearchItem { id: { videoId: string } }
interface ApiVideo { id: string; snippet: { channelId: string; publishedAt: string; title: string }; statistics: { viewCount: string }; contentDetails: { duration: string } }
interface ApiChannel { id: string; snippet?: { title?: string; customUrl?: string; publishedAt?: string }; statistics?: { subscriberCount?: string } }

const query = process.argv[2];
if (!query) {
  console.error('使い方: node scripts/search_compare.ts "<検索語>" [--days 365] [--max 20] [--order relevance|viewCount] [--highlight @handle]');
  process.exit(1);
}
const opt = (name: string, def: string): string => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const days = +opt('--days', '365');
const max = Math.min(50, +opt('--max', '20'));
const order = opt('--order', 'relevance');
const highlight = opt('--highlight', '').toLowerCase();
const key = requireApiKey();

const now = Date.now();
const after = new Date(now - days * 86400000).toISOString();
const s = await yt(key, 'search', { part: 'snippet', q: query, type: 'video', order, regionCode: 'JP', relevanceLanguage: 'ja', publishedAfter: after, maxResults: max });
const ids: string[] = s.items.map((i: SearchItem) => i.id.videoId);
if (!ids.length) {
  console.log('該当する動画がありません');
  process.exit(0);
}
const vids: ApiVideo[] = (await yt(key, 'videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') })).items;
const chIds = [...new Set(vids.map((v) => v.snippet.channelId))];
const chs = Object.fromEntries((await yt(key, 'channels', { part: 'snippet,statistics', id: chIds.join(',') })).items.map((c: ApiChannel) => [c.id, c]));

const rows = vids
  .map((v) => {
    const c = chs[v.snippet.channelId];
    const subs = +c?.statistics?.subscriberCount || null;
    const views = +v.statistics.viewCount || 0;
    const chCreated = c?.snippet?.publishedAt || null;
    return {
      rank: ids.indexOf(v.id) + 1,
      videoId: v.id,
      channel: c?.snippet?.title,
      handle: c?.snippet?.customUrl || '',
      subs,
      channelCreatedAt: chCreated,
      channelAgeYears: chCreated ? (now - Date.parse(chCreated)) / (365 * 86400000) : null,
      views,
      ratio: subs ? views / subs : null,
      publishedAt: v.snippet.publishedAt,
      ageDays: (now - Date.parse(v.snippet.publishedAt)) / 86400000,
      durationMin: Math.round(isoDurationToSec(v.contentDetails.duration) / 60),
      title: v.snippet.title,
    };
  })
  .sort((a, b) => a.rank - b.rank);

const n = rows.length;
const cnt = (f: (r: (typeof rows)[number]) => boolean): number => rows.filter(f).length;
const L: string[] = [];
const o = (x = '') => L.push(x);
o(`# 「${query}」のYouTube検索結果（直近${days}日、${order === 'viewCount' ? '再生数順' : '検索順位順'}、上位${n}本）`);
o();
o(`- 取得日時: ${new Date().toISOString()}（出典: YouTube Data API search.list。表示順は、取得した環境の検索結果に近いが、個人の画面と完全には一致しない）`);
o(`- 再生数の中央値: ${fmt(median(rows.map((r) => r.views)))} / 再生÷登録者の中央値: ${median(rows.map((r) => r.ratio).filter((x) => x != null))?.toFixed(2) ?? '-'}`);
o(`- 登録者10万人未満のチャンネルの動画: ${cnt((r) => r.subs != null && r.subs < 100000)} / ${n} 本`);
o(`- 開設2年以内のチャンネルの動画: ${cnt((r) => r.channelAgeYears != null && r.channelAgeYears <= 2)} / ${n} 本（開設日はアカウント作成日で、初投稿日とは違うことがある）`);
o(`- 直近30日以内に投稿された動画: ${cnt((r) => r.ageDays <= 30)} / ${n} 本`);
o(`- 同じチャンネルの複数ランクイン: ${Object.entries(rows.reduce<Record<string, number>>((m, r) => ((m[String(r.channel)] = (m[String(r.channel)] || 0) + 1), m), {})).filter(([, c]) => c > 1).map(([k, c]) => `${k}（${c}本）`).join('、') || 'なし'}`);
o('- 「再生÷登録者」が高いほど、チャンネルの規模のわりに再生されている');
o();
o('| 順位 | チャンネル | 登録者 | 開設 | 再生 | 再生÷登録者 | 投稿日 | 尺 | タイトル |');
o('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const mark = highlight && r.handle.toLowerCase() === highlight ? '**★**' : '';
  o(`| ${r.rank} | ${mark}${r.channel} | ${fmt(r.subs)} | ${r.channelCreatedAt?.slice(0, 7) ?? '-'} | ${fmt(r.views)} | ${r.ratio?.toFixed(2) ?? '-'} | ${r.publishedAt.slice(0, 10)} | ${r.durationMin}分 | ${r.title.slice(0, 50).replace(/\|/g, '｜')} |`);
}
const dir = path.join(ROOT, 'data', '_search');
fs.mkdirSync(dir, { recursive: true });
const base = path.join(dir, slug(query) + (order === 'viewCount' ? '_views' : ''));
fs.writeFileSync(base + '.md', L.join('\n') + '\n');
fs.writeFileSync(base + '.json', JSON.stringify({ query, days, order, fetchedAt: new Date().toISOString(), rows }, null, 2));
console.log(`${n} 本 → ${path.relative(ROOT, base)}.md / .json（使用クォータ 約${quotaUsed()}ユニット）`);
