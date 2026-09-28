import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, Video } from '../../scripts/lib.ts';
import { MIN_GROUP_VIDEOS, addDays, toPtDate } from '../../scripts/own/metrics.ts';
import { renderChannelReport, renderVideoReport } from '../../scripts/own/report.ts';
import type { OwnAnalytics, OwnData, RetentionPoint, VideoData } from '../../scripts/own/types.ts';

const NOW = new Date('2026-09-28T00:00:00Z');
const THROUGH = '2026-09-25';
const channel = { title: 'テストチャンネル' } as Channel;

const mkVideo = (id: string, publishedAt: string, o: Partial<Video> = {}): Video => ({
  id, url: 'https://www.youtube.com/watch?v=' + id, publishedAt, title: '動画 ' + id, views: 0, likes: null, comments: null,
  durationSec: 600, isShortLikely: false, isLive: false, tags: [], categoryId: '27', description: '', ...o,
});
const flat = (w: number): RetentionPoint[] => Array.from({ length: 100 }, (_, i) => ({ ratio: (i + 1) / 100, watchRatio: w, relative: 0.5 }));
const mkAnalytics = (v: Video, viewsPerDay: number, o: Partial<OwnAnalytics> = {}): OwnAnalytics => {
  const pub = toPtDate(v.publishedAt);
  return {
    videoId: v.id, fetchedAt: NOW.toISOString(), dailyThrough: THROUGH, contentType: 'VIDEO_ON_DEMAND',
    daily: Array.from({ length: 28 }, (_, i) => ({ day: addDays(pub, i), views: viewsPerDay, estimatedMinutesWatched: viewsPerDay * 4, averageViewDuration: 240, averageViewPercentage: 40, subscribersGained: 1 })),
    retention: flat(0.6), traffic: [{ source: 'BROWSE', views: 70, minutes: 200 }, { source: 'YT_SEARCH', views: 30, minutes: 90 }],
    trafficDetail: { YT_SEARCH: [{ detail: 'トヨタ 決算', views: 12 }], RELATED_VIDEO: [] }, ...o,
  };
};
const vd = (video: Video, analytics: OwnAnalytics | null, o: Partial<VideoData> = {}): VideoData => ({ video, analytics, studio: {}, transcript: null, chapters: [], tag: null, topics: [], ...o });
const data = (videos: VideoData[], o: Partial<OwnData> = {}): OwnData => ({ channel, videos, dataThrough: THROUGH, studioImportedAt: '2026-09-27T00:00:00Z', volumes: {}, now: NOW, ...o });

test('全動画: 種類ごとに節を分け、ない種類は出さない。出典の表記がある', () => {
  const a = mkVideo('aaaaaaaaaaa', '2026-08-01T00:00:00Z');
  const s = mkVideo('sssssssssss', '2026-08-02T00:00:00Z', { durationSec: 40 });
  const md = renderChannelReport(data([vd(a, mkAnalytics(a, 10)), vd(s, mkAnalytics(s, 50, { contentType: 'SHORTS' }))]));
  assert.match(md, /## 通常動画（1本）/);
  assert.match(md, /## ショート（1本）/);
  assert.doesNotMatch(md, /## ライブ/);
  assert.match(md, /\[Studio\]/);
  assert.match(md, /\[API\]/);
  assert.match(md, new RegExp(`${MIN_GROUP_VIDEOS}本未満`));
  assert.doesNotMatch(md, /上位・下位の比較/);
  assert.match(md, /### 維持率の形 \[API\]/);
  assert.match(md, /順位相関は、公開7日のデータがある動画が10本以上になったら出します/);
});

test('全動画: 公開7日のデータがある動画が MIN_GROUP_VIDEOS 本以上なら、上位・下位と型ごとを出す', () => {
  const vs = Array.from({ length: MIN_GROUP_VIDEOS + 2 }, (_, i) => {
    const v = mkVideo(('v' + String(i).padStart(2, '0')).padEnd(11, 'x'), `2026-0${1 + (i % 8)}-1${i % 9}T00:00:00Z`);
    return vd(v, mkAnalytics(v, 10 + i), { tag: i % 2 ? '決算' : '用語' });
  });
  const md = renderChannelReport(data(vs));
  assert.match(md, /上位・下位の比較/);
  assert.match(md, /### 順位相関/);
  assert.match(md, /\| 1:00の維持率 \[API\] \| - \| - \| 12 \|/); // 全動画で同じ値なら相関は出さない
  assert.match(md, /\| クリック率 \[Studio\] \| - \| - \| 0 \|/);
  assert.match(md, /### 型ごと/);
  assert.match(md, /\| 決算 \|/);
});

test('全動画: 公開直後の動画は「未到達」。データがなくても落ちない', () => {
  const fresh = mkVideo('fffffffffff', '2026-09-27T00:00:00Z');
  const md = renderChannelReport(data([vd(fresh, null)], { dataThrough: null, studioImportedAt: null }));
  assert.match(md, /未到達/);
  assert.match(md, /Studio の CSV を取り込んでいません/);
  assert.match(md, /Analytics API のデータがありません/);
});

test('全動画: 動画ごとの取得日（dailyThrough）がチャンネルの dataThrough より古ければ、その日までで判定する', () => {
  // A は 09-20 までしか取っていない。あとで別の動画だけ取り直して meta の dataThrough が 09-25 に進んだ状態
  const a = mkVideo('staleaaaaaa', '2026-09-15T19:00:00Z', { title: '古い取得' });
  const pub = toPtDate(a.publishedAt);
  const stale = mkAnalytics(a, 100, { dailyThrough: '2026-09-20' });
  stale.daily = stale.daily.filter((r) => r.day <= '2026-09-20');
  const md = renderChannelReport(data([vd(a, stale)]));
  const row = md.split('\n').find((l) => l.includes('古い取得') && l.startsWith('|'));
  assert.ok(row, md);
  assert.equal(addDays(pub, 6) > '2026-09-20', true); // 7日目は取得日より後
  assert.match(row, /\| 未到達 \| 未到達 \|/);
});

test('全動画: タイトルの | は表を壊さないように置き換える', () => {
  const v = mkVideo('ppppppppppp', '2026-08-01T00:00:00Z', { title: 'A | B' });
  const md = renderChannelReport(data([vd(v, mkAnalytics(v, 10))]));
  assert.match(md, /A ｜ B/);
});

test('全動画: 新規／リピーターとクリック率を Studio から出す', () => {
  const v = mkVideo('nnnnnnnnnnn', '2026-08-01T00:00:00Z');
  const studio = {
    all: { videoId: v.id, viewerType: 'all' as const, views: 100, avgViewDurationSec: 200, avgViewPercentage: 33.3, impressions: 2000, ctr: 4.5 },
    new: { videoId: v.id, viewerType: 'new' as const, views: 75, avgViewDurationSec: 150, avgViewPercentage: 25, impressions: null, ctr: null },
    returning: { videoId: v.id, viewerType: 'returning' as const, views: 25, avgViewDurationSec: 300, avgViewPercentage: 50, impressions: null, ctr: null },
  };
  const md = renderChannelReport(data([vd(v, mkAnalytics(v, 10), { studio })]));
  assert.match(md, /新しい視聴者の割合 \[Studio\]: 75%/);
  assert.match(md, /4\.5%/);
});

test('1本: 見返された場所に、チャプターと発言を添える', () => {
  const v = mkVideo('rrrrrrrrrrr', '2026-08-01T00:00:00Z');
  const retention = flat(0.6).map((p) => (p.ratio >= 0.5 && p.ratio < 0.55 ? { ...p, watchRatio: 0.65 } : p));
  const d = vd(v, mkAnalytics(v, 10, { retention }), {
    chapters: [{ start: 0, title: 'はじめに' }, { start: 240, title: '本題' }],
    transcript: [{ start: 0, dur: 5, text: '今日は決算の話です' }, { start: 290, dur: 10, text: 'ここが大事です' }],
  });
  const md = renderVideoReport(data([d]), v.id);
  assert.match(md, /# 動画 rrrrrrrrrrr の振り返り/);
  assert.match(md, /チャプター「本題」/);
  assert.match(md, /ここが大事です/);
  assert.match(md, /冒頭30秒の発言/);
  assert.match(md, /今日は決算の話です/);
  assert.match(md, /トヨタ 決算/);
});

test('1本: 文字起こしがなければ、取り方を示す。対象にない動画はエラー', () => {
  const v = mkVideo('ttttttttttt', '2026-08-01T00:00:00Z');
  const md = renderVideoReport(data([vd(v, mkAnalytics(v, 10))]), v.id);
  assert.match(md, /fetch_transcript\.ts/);
  assert.throws(() => renderVideoReport(data([vd(v, null)]), 'zzzzzzzzzzz'), /zzzzzzzzzzz/);
});

test('1本: 公開直後で48時間に届いていなければ「未到達」', () => {
  const v = mkVideo('uuuuuuuuuuu', '2026-09-25T20:00:00Z');
  const md = renderVideoReport(data([vd(v, mkAnalytics(v, 10))]), v.id);
  assert.match(md, /\| 48時間 \| 未到達/);
});

test('全動画: 新規の割合は、フィルタなしの書き出しの視聴者の人数を優先して出す', () => {
  const v = mkVideo('wwwwwwwwwww', '2026-08-01T00:00:00Z');
  const studio = {
    all: { videoId: v.id, viewerType: 'all' as const, views: 1200, avgViewDurationSec: 450, avgViewPercentage: 25, impressions: 25000, ctr: 4.5, newViewers: 800, returningViewers: 200, uniqueViewers: 950 },
  };
  const md = renderChannelReport(data([vd(v, mkAnalytics(v, 10), { studio })]));
  assert.match(md, /視聴者のうち新しい視聴者の割合 \[Studio\]: 80%/);
  assert.match(md, /\| 80% → \|/);
  const one = renderVideoReport(data([vd(v, mkAnalytics(v, 10), { studio })]), v.id);
  assert.match(one, /新しい視聴者 800人／リピーター 200人/);
});

test('流入元: SUBSCRIBER は「ブラウジング機能」として表示する', () => {
  const v = mkVideo('xxxxxxxxxxx', '2026-08-01T00:00:00Z');
  const traffic = [{ source: 'SUBSCRIBER', views: 84, minutes: 100 }, { source: 'RELATED_VIDEO', views: 16, minutes: 20 }];
  const md = renderVideoReport(data([vd(v, mkAnalytics(v, 10, { traffic }))]), v.id);
  assert.match(md, /\| ブラウジング機能 \| 84 \| 84% \|/);
  assert.doesNotMatch(md, /登録チャンネル/);
});

test('1本: 維持率は決まった時点の表・落ち着いた時点・前後より急な離脱を出す', () => {
  const v = mkVideo('kkkkkkkkkkk', '2026-08-01T00:00:00Z', { durationSec: 600 });
  // 2:00 まで毎分30ptずつ落ち、40%で横ばい。4:00〜4:18 に12pt落ちる
  const retention = Array.from({ length: 100 }, (_, i) => {
    const r = (i + 1) / 100;
    const w = (r <= 0.2 ? 1 - r * 3 : 0.4) - (r > 0.4 && r <= 0.43 ? (r - 0.4) * 4 : r > 0.43 ? 0.12 : 0);
    return { ratio: r, watchRatio: w, relative: 0.5 };
  });
  const md = renderVideoReport(data([vd(v, mkAnalytics(v, 10, { retention }))]), v.id);
  assert.match(md, /\| 1:00 \| 70% \|/);
  assert.match(md, /落ち着いた時点（折れ線の当てはめ）: 2:00/);
  assert.match(md, /ふだんより-\d+pt/);
});

test('検索需要: 1本では検索語と題材語にラッコの検索数を添える。全動画では題材の表を出す', () => {
  const v = mkVideo('qqqqqqqqqqq', '2026-08-01T00:00:00Z');
  const d = vd(v, mkAnalytics(v, 10), { topics: ['excel ai'] });
  const volumes = { 'excel ai': { searchVolume: 12100, yoy: 0.5 }, 'トヨタ 決算': { searchVolume: 3600, yoy: null } };
  const one = renderVideoReport(data([d], { volumes }), v.id);
  assert.match(one, /## 検索語と検索需要/);
  assert.match(one, /\| トヨタ 決算 \| 12 \| 3,600 \| - \|/);
  assert.match(one, /題材語: excel ai（月間 1\.2万、前年比 \+50%）/);
  assert.match(one, /Google の月間検索数/);
  const all = renderChannelReport(data([d], { volumes }));
  assert.match(all, /### 題材と検索需要 \[ラッコ\]/);
  assert.match(all, /excel ai（1\.2万）/);
});

test('比較はエンゲージビューで行う（視聴回数は数え方が変わった時期の前後で比べられない）', () => {
  // A：視聴回数は多いがエンゲージビューは少ない（数え方が変わった後）。B：その逆
  const a = mkVideo('aaaaaaaaaaa', '2026-08-01T00:00:00Z'), b = mkVideo('bbbbbbbbbbb', '2026-07-01T00:00:00Z');
  const heavy = (v: Video, views: number, engaged: number) => mkAnalytics(v, 0, {
    daily: Array.from({ length: 28 }, (_, i) => ({ day: addDays(toPtDate(v.publishedAt), i), views, estimatedMinutesWatched: engaged * 4, averageViewDuration: 240, averageViewPercentage: 40, subscribersGained: 0 })),
  });
  const md = renderChannelReport(data([vd(a, heavy(a, 300, 10)), vd(b, heavy(b, 50, 50))]));
  assert.match(md, /7日のエンゲージビュー \[API\]/);
  // 表の中の B の行で、エンゲージビュー 350 が中央値より上（↑）
  assert.match(md, /動画 bbbbbbbbbbb \|[^\n]*\| 350 ↑ \|/);
});
