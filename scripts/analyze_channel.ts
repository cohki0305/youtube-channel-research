#!/usr/bin/env node
// 取得済みデータを集計して summary.md を出力する（APIは使わない）
// 使い方: node scripts/analyze_channel.ts data/<slug> [--exclude-days 7]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, median, fmt, type Channel, type Video } from './lib.ts';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('使い方: node scripts/analyze_channel.ts data/<slug> [--exclude-days 7]');
  process.exit(1);
}
const exIdx = process.argv.indexOf('--exclude-days');
const excludeDays = exIdx > 0 ? +process.argv[exIdx + 1] : 7;
const dir = path.resolve(ROOT, dirArg);
const channel: Channel = JSON.parse(fs.readFileSync(path.join(dir, 'channel.json'), 'utf8'));
const all: Video[] = JSON.parse(fs.readFileSync(path.join(dir, 'videos.json'), 'utf8'));

const now = Date.now();
const ageDays = (v: Video): number => (now - Date.parse(v.publishedAt)) / 86400000;
const longs = all.filter((v) => !v.isShortLikely && !v.isLive);
const shorts = all.filter((v) => v.isShortLikely);
const lives = all.filter((v) => v.isLive);
// 再生数の比較は、投稿直後で伸び切っていない動画を除く
const mature = longs.filter((v) => ageDays(v) >= excludeDays);
const views = (a: Video[]): number[] => a.map((v) => v.views);
const L: string[] = [];
const p = (s = '') => L.push(s);

p(`# ${channel.title} 分析サマリー`);
p();
p(`- 取得日時: ${channel.fetchedAt}（出典: YouTube Data API v3）`);
p(`- チャンネル: ${channel.handle} / 開設 ${channel.publishedAt.slice(0, 10)} / 国 ${channel.country || '-'}`);
p(`- 登録者 ${fmt(channel.subscriberCount)} / 総再生 ${fmt(channel.viewCount)} / 動画 ${all.length} 本（通常 ${longs.length}・ショート推定 ${shorts.length}・ライブ ${lives.length}）`);
if (all.length) {
  const first = all[all.length - 1].publishedAt.slice(0, 10);
  p(`- 初投稿 ${first}`);
}
p(`- 通常動画の再生数中央値: ${fmt(median(views(mature)))}（投稿${excludeDays}日未満を除く ${mature.length} 本）`);
if (shorts.length) p(`- ショートの再生数中央値: ${fmt(median(views(shorts)))}`);
p();

// 概要欄のリンク（送客先の把握用）
const links: Record<string, number> = {};
for (const v of all) for (const u of v.description.match(/https?:\/\/[^\s)）」]+/g) || []) {
  const host = u.replace(/^https?:\/\//, '').split('/')[0];
  links[host] = (links[host] || 0) + 1;
}
p('## 概要欄のリンク先（出現本数の多い順）');
p();
p('運営会社や送客先を確認するために使う。チャンネル説明文もあわせて読むこと。');
p();
for (const [h, n] of Object.entries(links).sort((a, b) => b[1] - a[1]).slice(0, 10)) p(`- ${h}: ${n}本`);
p();

p('## 月別（通常動画）');
p();
p('| 月 | 本数 | 再生数中央値 | 最大 |');
p('|---|---|---|---|');
const byMonth: Record<string, number[]> = {};
for (const v of longs) (byMonth[v.publishedAt.slice(0, 7)] ||= []).push(v.views);
for (const m of Object.keys(byMonth).sort()) p(`| ${m} | ${byMonth[m].length} | ${fmt(median(byMonth[m]))} | ${fmt(Math.max(...byMonth[m]))} |`);
p();

p('## 尺ごと（通常動画）');
p();
p('| 尺 | 本数 | 再生数中央値 |');
p('|---|---|---|');
const buckets: [number, number, string][] = [[0, 600, '10分未満'], [600, 1200, '10〜20分'], [1200, 1800, '20〜30分'], [1800, 3600, '30〜60分'], [3600, 1e9, '60分以上']];
for (const [lo, hi, label] of buckets) {
  const a = mature.filter((v) => v.durationSec >= lo && v.durationSec < hi);
  if (a.length) p(`| ${label} | ${a.length} | ${fmt(median(views(a)))} |`);
}
p();

p('## 曜日・投稿時刻（JST、通常動画）');
p();
const dow = ['日', '月', '火', '水', '木', '金', '土'];
const byDow: Record<number, number[]> = {};
const byHour: Record<number, number[]> = {};
for (const v of mature) {
  const d = new Date(Date.parse(v.publishedAt) + 9 * 3600000);
  (byDow[d.getUTCDay()] ||= []).push(v.views);
  (byHour[d.getUTCHours()] ||= []).push(v.views);
}
p('曜日: ' + Object.keys(byDow).sort().map((k) => `${dow[+k]} ${byDow[+k].length}本/${fmt(median(byDow[+k]))}`).join('、'));
p();
p('時刻: ' + Object.keys(byHour).sort((a, b) => +a - +b).map((k) => `${k}時 ${byHour[+k].length}本`).join('、'));
p();

const sorted = [...mature].sort((a, b) => b.views - a.views);
const line = (v: Video): string => `| ${fmt(v.views)} | ${v.publishedAt.slice(0, 10)} | ${Math.round(v.durationSec / 60)}分 | ${v.title.replace(/\|/g, '｜')} |`;
p('## 再生数 上位36本');
p();
p('| 再生 | 投稿日 | 尺 | タイトル |');
p('|---|---|---|---|');
sorted.slice(0, 36).forEach((v) => p(line(v)));
p();
p('## 再生数 下位15本');
p();
p('| 再生 | 投稿日 | 尺 | タイトル |');
p('|---|---|---|---|');
sorted.slice(-15).reverse().forEach((v) => p(line(v)));
p();

p('## タグ（4本以上で使われたもの、本数順）');
p();
p('チャンネル名や出演者名のタグは除外して読むこと。');
p();
const tagMap: Record<string, number[]> = {};
for (const v of mature) for (const t of new Set(v.tags)) (tagMap[t] ||= []).push(v.views);
p('| タグ | 本数 | 再生数中央値 |');
p('|---|---|---|');
for (const [t, a] of Object.entries(tagMap).filter(([, a]) => a.length >= 4).sort((x, y) => y[1].length - x[1].length).slice(0, 60)) p(`| ${t} | ${a.length} | ${fmt(median(a))} |`);
p();

p('## タイトル先頭の【】（題材ラベル）');
p();
const bracket: Record<string, number[]> = {};
for (const v of mature) {
  const m = v.title.match(/^【([^】]+)】/);
  if (m) (bracket[m[1]] ||= []).push(v.views);
}
const bracketRows = Object.entries(bracket).sort((a, b) => (median(b[1]) ?? 0) - (median(a[1]) ?? 0));
p(`【】で始まるタイトル: ${bracketRows.reduce((s, [, a]) => s + a.length, 0)} / ${mature.length} 本`);
p();
p('| 【】の中身 | 本数 | 再生数中央値 |');
p('|---|---|---|');
for (const [k, a] of bracketRows.slice(0, 40)) p(`| ${k} | ${a.length} | ${fmt(median(a))} |`);
p();
p('> 次の手順: 上位・下位の題材から「題材語 → ラッコで検索数を取る語」を作り、keywords.csv（video_id,keyword）にまとめて correlate.ts を実行する。');

const out = path.join(dir, 'summary.md');
fs.writeFileSync(out, L.join('\n') + '\n');
console.log(`→ ${path.relative(ROOT, out)} を出力しました`);
