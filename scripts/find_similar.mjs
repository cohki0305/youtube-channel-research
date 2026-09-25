#!/usr/bin/env node
// 真似するチャンネルの候補を集める
// 使い方: node scripts/find_similar.mjs data/<slug> "<需要語1>" "<需要語2>" ... [--days 365] [--max 50] [--momentum 30] [--links 2] [--seeds @a,@b]
//
// 候補の出どころは3つ
//   1. 需要語での検索: 検索需要の大きい語（ラッコのキャッシュにある語）でYouTubeを検索し、上位に出たチャンネルを集める。
//      何語で上位に出たか（ヒット語数）と、その語の月間検索数の合計（需要スコア）で並べる。
//      需要語で繰り返し上位に出るチャンネルは、検索から人を呼べているチャンネル
//   2. 概要欄のリンク（--links N）: ベンチマークの動画の概要欄で、N本以上から紹介されているチャンネル
//   3. 指定（--seeds）: ヒアリングで聞いた、クライアントが気にしているチャンネル
//
// クォータ: 需要語1つにつき search 100ユニット。--momentum N は1候補あたり約2ユニット。リンクと指定は1チャンネルあたり1ユニット
// 出力: data/<slug>/similar_candidates.json, similar_candidates.md
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, requireApiKey, yt, quotaUsed, median, fmt, isoDurationToSec } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const days = +opt('--days', 365);
const max = Math.min(50, +opt('--max', 50));
const momentumN = +opt('--momentum', 30);
const linkMin = +opt('--links', 0);
const seedArg = opt('--seeds', '');
const [dirArg, ...queries] = args;
if (!dirArg) {
  console.error('使い方: node scripts/find_similar.mjs data/<slug> "<需要語1>" ... [--days 365] [--max 50] [--momentum 30] [--links 2] [--seeds @a,@b]');
  process.exit(1);
}
const dir = path.resolve(ROOT, dirArg);
const bench = JSON.parse(fs.readFileSync(path.join(dir, 'channel.json'), 'utf8'));
const key = requireApiKey();

// 需要語の月間検索数（ラッコのキャッシュ）
const cachePath = path.join(ROOT, 'data', '_cache', 'rakko', 'volumes.json');
const volCache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
const volOf = (q) => volCache[q.trim().replace(/\s+/g, ' ')]?.searchVolume ?? null;
const noVol = queries.filter((q) => volOf(q) == null);
if (noVol.length) console.error(`ラッコのキャッシュに検索数がない語: ${noVol.join(' / ')}（需要スコアでは0として扱う）`);

const hits = {}; // channelId -> { queries: Map(q -> 最高順位), videoIds: [], sources: Set }
const entry = (c) => (hits[c] ??= { queries: new Map(), videoIds: [], sources: new Set() });

// 1. 需要語で検索する
const after = new Date(Date.now() - days * 86400000).toISOString();
for (const q of queries) {
  const s = await yt(key, 'search', { part: 'snippet', q, type: 'video', order: 'relevance', regionCode: 'JP', relevanceLanguage: 'ja', publishedAfter: after, maxResults: max });
  s.items.forEach((it, i) => {
    const c = it.snippet.channelId;
    if (c === bench.id) return;
    const e = entry(c);
    if (!e.queries.has(q)) e.queries.set(q, i + 1);
    e.videoIds.push(it.id.videoId);
    e.sources.add('需要語');
  });
}

// 2. ベンチマークの概要欄でリンクされているチャンネル
const linkCount = {};
if (linkMin > 0) {
  const videos = JSON.parse(fs.readFileSync(path.join(dir, 'videos.json'), 'utf8'));
  for (const v of videos) {
    const found = new Set((v.description.match(/youtube\.com\/(@[^\s/?#)"'」]+|channel\/UC[\w-]{22})/g) || []).map((s) => decodeURIComponent(s.replace('youtube.com/', ''))));
    for (const h of found) linkCount[h] = (linkCount[h] || 0) + 1;
  }
}
const linkTargets = Object.entries(linkCount).filter(([, n]) => n >= linkMin).sort((a, b) => b[1] - a[1]).slice(0, 15);
const seedTargets = seedArg ? seedArg.split(',').map((s) => s.trim()).filter(Boolean) : [];
const resolved = {}; // channelId -> ラベル
for (const [target, label] of [...linkTargets.map(([h, n]) => [h, `概要欄リンク${n}本`]), ...seedTargets.map((h) => [h, '指定'])]) {
  const params = target.startsWith('channel/') ? { id: target.slice(8) } : target.startsWith('UC') ? { id: target } : { forHandle: target.startsWith('@') ? target : '@' + target };
  const r = await yt(key, 'channels', { part: 'id', ...params });
  const id = r.items?.[0]?.id;
  if (!id || id === bench.id) continue;
  entry(id).sources.add(label);
}

// 3. ヒットした動画の再生数と、チャンネルの規模を取る
const allVids = [...new Set(Object.values(hits).flatMap((h) => h.videoIds))];
const views = {};
for (let i = 0; i < allVids.length; i += 50) {
  const r = await yt(key, 'videos', { part: 'statistics', id: allVids.slice(i, i + 50).join(',') });
  for (const v of r.items) views[v.id] = +v.statistics.viewCount || 0;
}
const chIds = Object.keys(hits);
const chs = {};
for (let i = 0; i < chIds.length; i += 50) {
  const r = await yt(key, 'channels', { part: 'snippet,statistics,contentDetails', id: chIds.slice(i, i + 50).join(',') });
  for (const c of r.items) chs[c.id] = c;
}

// 肩書き・経歴を示す語。ヒントにすぎないので、候補を選ぶ前に説明文を必ず読む
const CREDENTIAL = /証券アナリスト|CMA|CFP|FP|ファイナンシャルプランナー|プライベートバンカー|公認会計士|税理士|弁護士|元証券|元野村|元外銀|外資系|元銀行|證券|証券会社出身|ファンドマネージャー|運用会社|投資顧問|アナリスト|元日銀|元金融庁|IR|経営者|代表取締役|CEO/;

const rows = chIds
  .filter((id) => chs[id])
  .map((id) => {
    const c = chs[id];
    const h = hits[id];
    const subs = +c.statistics.subscriberCount || null;
    const hitViews = h.videoIds.map((v) => views[v] ?? 0);
    const qs = [...h.queries.keys()];
    return {
      id,
      handle: c.snippet.customUrl || '',
      title: c.snippet.title,
      sources: [...h.sources],
      subs,
      videoCount: +c.statistics.videoCount || 0,
      publishedAt: c.snippet.publishedAt, // アカウント作成日。初投稿日とは限らない
      queryHits: qs.length,
      queries: qs.map((q) => `${q}(${h.queries.get(q)}位)`),
      demandScore: qs.reduce((s, q) => s + (volOf(q) ?? 0), 0),
      hitViewsMedian: hitViews.length ? median(hitViews) : null,
      credentialHint: (c.snippet.description.match(CREDENTIAL) || [null])[0],
      description: c.snippet.description.slice(0, 300),
    };
  })
  .sort((a, b) => b.queryHits - a.queryHits || b.demandScore - a.demandScore);

// 4. 最近の伸びを測る（需要語の上位N候補と、リンク・指定の候補すべて）
//    直近アップロード50本のうち、ショート（3分以下）とライブを除いた通常動画で比べる
//    recent: 投稿7〜90日の動画 / before: それより古い動画（50本の範囲内）
const DAY = 86400000;
const now = Date.now();
const measured = new Set([...rows.slice(0, momentumN), ...rows.filter((r) => r.sources.some((s) => s !== '需要語'))]);
for (const r of measured) {
  const uploads = chs[r.id].contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) continue;
  const pl = await yt(key, 'playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: 50 });
  const ids = pl.items.map((it) => it.contentDetails.videoId);
  if (!ids.length) continue;
  const vs = (await yt(key, 'videos', { part: 'snippet,statistics,contentDetails,liveStreamingDetails', id: ids.join(',') })).items.map((v) => ({
    age: (now - Date.parse(v.snippet.publishedAt)) / DAY,
    views: +v.statistics.viewCount || 0,
    short: isoDurationToSec(v.contentDetails.duration) <= 180,
    live: !!v.liveStreamingDetails,
  }));
  const normal = vs.filter((v) => !v.short && !v.live);
  const recent = normal.filter((v) => v.age >= 7 && v.age <= 90).map((v) => v.views);
  const before = normal.filter((v) => v.age > 90).map((v) => v.views);
  r.recentN = recent.length;
  r.recentMedian = recent.length ? median(recent) : null;
  r.recentRatio = r.recentMedian != null && r.subs ? r.recentMedian / r.subs : null;
  r.growth = r.recentMedian != null && before.length >= 3 ? r.recentMedian / median(before) : null;
  r.shortShare = vs.length ? vs.filter((v) => v.short).length / vs.length : null;
}

fs.writeFileSync(
  path.join(dir, 'similar_candidates.json'),
  JSON.stringify({ benchmark: bench.handle, queries: queries.map((q) => ({ q, volume: volOf(q) })), days, linkMin, seeds: seedTargets, fetchedAt: new Date().toISOString(), rows }, null, 2),
);

const L = [];
const o = (x = '') => L.push(x);
o(`# ${bench.title} を起点にした、真似するチャンネルの候補`);
o();
o(`- 取得日時: ${new Date().toISOString()}（出典: YouTube Data API v3。月間検索数はラッコ）`);
o(`- 需要語（${queries.length}語、直近${days}日の動画を検索）: ${queries.map((q) => `${q}（${fmt(volOf(q))}）`).join(' / ')}`);
if (linkMin > 0) o(`- 概要欄リンク: ベンチマークの概要欄で${linkMin}本以上から紹介されているチャンネル（${linkTargets.length}件）`);
if (seedTargets.length) o(`- 指定: ${seedTargets.join(' / ')}`);
o('- 「ヒット語数」は、いくつの需要語で上位50本に入ったか。「需要スコア」は、ヒットした需要語の月間検索数（Google、ラッコ）の合計。どちらも高いほど、検索から人を呼べている');
o('- 「肩書きヒント」は説明文の機械的な検出。候補を選ぶ前に、説明文を読んで確かめること');
o('- 開設日はアカウントの作成日で、初投稿日とは限らない');
o(`- 最近の伸びは、需要語の上位${momentumN}候補と、リンク・指定の候補について測った。直近アップロード50本のうち通常動画（ショート・ライブを除く）で比べる`);
o('  - 直近90日の中央値：投稿7〜90日の動画の再生中央値 / 直近÷登録者：それを登録者で割った値 / 伸び：直近90日の中央値÷それより前の中央値');
o();
const row = (r) =>
  `| ${r.sources.join('・')} | ${r.queryHits} | ${fmt(r.demandScore)} | ${r.title.replace(/\|/g, '｜')} ${r.handle} | ${fmt(r.subs)} | ${r.publishedAt.slice(0, 10)} | ${fmt(r.recentMedian)}（${r.recentN ?? '-'}本） | ${r.recentRatio?.toFixed(2) ?? '-'} | ${r.growth?.toFixed(2) ?? '-'} | ${r.shortShare != null ? Math.round(r.shortShare * 100) + '%' : '-'} | ${r.credentialHint ?? ''} |`;
const head = () => {
  o('| 出どころ | ヒット語数 | 需要スコア | チャンネル | 登録者 | 開設 | 直近90日の中央値 | 直近÷登録者 | 伸び | ショート比率 | 肩書きヒント |');
  o('|---|---|---|---|---|---|---|---|---|---|---|');
};
o('## 需要語での強さ順（ヒット語数 → 需要スコア）');
o();
head();
for (const r of rows.filter((r) => r.queryHits > 0).slice(0, 40)) o(row(r));
o();
o('## 最近の伸び順（直近÷登録者。直近90日の通常動画が3本以上の候補のみ）');
o();
head();
for (const r of rows.filter((r) => r.recentN >= 3 && r.recentRatio != null).sort((a, b) => b.recentRatio - a.recentRatio).slice(0, 20)) o(row(r));
const others = rows.filter((r) => r.sources.some((s) => s !== '需要語'));
if (others.length) {
  o();
  o('## 概要欄リンク・指定の候補');
  o();
  head();
  for (const r of others) o(row(r));
}
fs.writeFileSync(path.join(dir, 'similar_candidates.md'), L.join('\n') + '\n');
console.log(`候補 ${rows.length} チャンネル → ${path.relative(ROOT, dir)}/similar_candidates.md（使用クォータ 約${quotaUsed()}ユニット）`);
