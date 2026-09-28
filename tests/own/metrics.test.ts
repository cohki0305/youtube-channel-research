import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, analysisMode, cumulativeAt, markVsMedian, MIN_GROUP_VIDEOS, topBottom, toPtDate } from '../../scripts/own/metrics.ts';
import type { DailyRow } from '../../scripts/own/types.ts';

const day = (d: string, views: number, minutes: number, subs = 0): DailyRow => ({
  day: d, views, estimatedMinutesWatched: minutes, averageViewDuration: 0, averageViewPercentage: 0, subscribersGained: subs,
});

test('toPtDate: 日本の朝の公開は、太平洋時間では前日になる', () => {
  assert.equal(toPtDate('2026-09-10T00:30:00Z'), '2026-09-09');
  assert.equal(toPtDate('2026-01-10T12:00:00Z'), '2026-01-10');
});

test('addDays: 月をまたぐ', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-09-09', 27), '2026-10-06');
  assert.equal(addDays('2026-09-09', -10), '2026-08-30');
});

const daily = [day('2026-09-09', 100, 200, 3), day('2026-09-10', 50, 100, 1), day('2026-09-11', 10, 20)];

test('cumulativeAt: 公開日を含む2日間の累計と、視聴時間から計算した平均', () => {
  const c = cumulativeAt(daily, '2026-09-09', 2, 600, '2026-09-20');
  assert.deepEqual(c, { views: 150, engagedViews: 150, minutes: 300, avgViewDurationSec: 120, avgViewPercentage: 20, subscribersGained: 4 });
});

test('cumulativeAt: まだその日数分のデータがなければ null（未到達）', () => {
  assert.equal(cumulativeAt(daily, '2026-09-09', 28, 600, '2026-09-20'), null);
  assert.equal(cumulativeAt([], '2026-09-27', 2, 600, '2026-09-27'), null);
});

test('cumulativeAt: 再生0なら平均は null。尺0なら平均視聴率は null（割り算しない）', () => {
  assert.deepEqual(cumulativeAt([], '2026-09-01', 2, 600, '2026-09-20'), { views: 0, engagedViews: 0, minutes: 0, avgViewDurationSec: null, avgViewPercentage: null, subscribersGained: 0 });
  assert.equal(cumulativeAt(daily, '2026-09-09', 2, 0, '2026-09-20')?.avgViewPercentage, null);
});

test('markVsMedian: 5%を超えて上下したら矢印', () => {
  assert.equal(markVsMedian(110, 100), '↑');
  assert.equal(markVsMedian(90, 100), '↓');
  assert.equal(markVsMedian(103, 100), '→');
  assert.equal(markVsMedian(null, 100), '');
  assert.equal(markVsMedian(5, null), '');
  assert.equal(markVsMedian(5, 0), '↑');
});

test('analysisMode: MIN_GROUP_VIDEOS 本から群の比較', () => {
  assert.equal(analysisMode(MIN_GROUP_VIDEOS - 1), 'single');
  assert.equal(analysisMode(MIN_GROUP_VIDEOS), 'group');
});

test('topBottom: 少ないときは最大3本ずつ、多いときは4分の1ずつ。下位は悪い順。null は外す', () => {
  const s = (xs: (number | null)[]) => xs;
  const few = topBottom(s([3, 5, null, 1, 4, 2]), (x) => x, 'single');
  assert.deepEqual(few, { top: [5, 4], bottom: [1, 2] });
  const many = topBottom(s([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), (x) => x, 'group');
  assert.deepEqual(many, { top: [12, 11, 10], bottom: [1, 2, 3] });
  assert.deepEqual(topBottom(s([7]), (x) => x, 'single'), { top: [], bottom: [] });
});

test('cumulativeAt: 平均視聴時間はエンゲージビュー1回あたり。API の views（自動再生なども数える）では割らない', () => {
  // 1日目: 100分・平均300秒 → エンゲージビュー20回。2日目: 50分・平均150秒 → 20回
  const rows: DailyRow[] = [
    { day: '2026-09-01', views: 500, estimatedMinutesWatched: 100, averageViewDuration: 300, averageViewPercentage: 33.3, subscribersGained: 0 },
    { day: '2026-09-02', views: 300, estimatedMinutesWatched: 50, averageViewDuration: 150, averageViewPercentage: 16.7, subscribersGained: 0 },
  ];
  const c = cumulativeAt(rows, '2026-09-01', 2, 900, '2026-09-20');
  assert.equal(c?.views, 800);
  assert.equal(c?.engagedViews, 40);
  assert.equal(c?.avgViewDurationSec, 225);
  assert.equal(c?.avgViewPercentage, 25);
});
