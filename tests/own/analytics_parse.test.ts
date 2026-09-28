import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyIsFinal, latestDay, parseDaily, parseDetail, parseRetention, parseTraffic, pickContentType } from '../../scripts/own/analytics_parse.ts';
import type { OwnAnalytics } from '../../scripts/own/types.ts';

test('parseDaily: 数に直し、日付順にする', () => {
  const rows = [
    { day: '2026-09-02', views: 5, estimatedMinutesWatched: 10, averageViewDuration: 120, averageViewPercentage: 30, subscribersGained: 1 },
    { day: '2026-09-01', views: '10', estimatedMinutesWatched: '20', averageViewDuration: '120', averageViewPercentage: '30', subscribersGained: '0' },
  ];
  const d = parseDaily(rows);
  assert.deepEqual(d.map((r) => r.day), ['2026-09-01', '2026-09-02']);
  assert.equal(d[0].views, 10);
});

test('parseRetention: 行がなければ null。位置の順にする', () => {
  assert.equal(parseRetention([]), null);
  const r = parseRetention([
    { elapsedVideoTimeRatio: 0.02, audienceWatchRatio: 0.9, relativeRetentionPerformance: 0.6 },
    { elapsedVideoTimeRatio: 0.01, audienceWatchRatio: 1.0, relativeRetentionPerformance: 0.5 },
  ]);
  assert.deepEqual(r, [{ ratio: 0.01, watchRatio: 1, relative: 0.5 }, { ratio: 0.02, watchRatio: 0.9, relative: 0.6 }]);
});

test('parseTraffic / parseDetail: 再生の多い順', () => {
  assert.deepEqual(parseTraffic([
    { insightTrafficSourceType: 'YT_SEARCH', views: 3, estimatedMinutesWatched: 6 },
    { insightTrafficSourceType: 'BROWSE', views: 9, estimatedMinutesWatched: 20 },
  ]).map((t) => t.source), ['BROWSE', 'YT_SEARCH']);
  assert.deepEqual(parseDetail([{ insightTrafficSourceDetail: 'トヨタ 決算', views: 4 }]), [{ detail: 'トヨタ 決算', views: 4 }]);
});

test('pickContentType: いちばん再生の多い種類。大文字・キャメルケースの両方を受ける', () => {
  assert.equal(pickContentType([{ creatorContentType: 'SHORTS', views: 10 }]), 'SHORTS');
  assert.equal(pickContentType([{ creatorContentType: 'videoOnDemand', views: 10 }, { creatorContentType: 'liveStream', views: 2 }]), 'VIDEO_ON_DEMAND');
  assert.equal(pickContentType([]), 'UNSPECIFIED');
  assert.equal(pickContentType([{ creatorContentType: 'SOMETHING_NEW', views: 1 }]), 'UNSPECIFIED');
});

test('dailyIsFinal: 公開28日目までのデータを取り終えていれば、取り直さない', () => {
  const prev = { dailyThrough: '2026-10-06' } as OwnAnalytics;
  assert.equal(dailyIsFinal(prev, '2026-09-09'), true);
  assert.equal(dailyIsFinal({ dailyThrough: '2026-10-05' } as OwnAnalytics, '2026-09-09'), false);
  assert.equal(dailyIsFinal(null, '2026-09-09'), false);
});

test('latestDay', () => {
  assert.equal(latestDay([{ day: '2026-09-20' }, { day: '2026-09-25' }, { day: '2026-09-22' }]), '2026-09-25');
  assert.equal(latestDay([]), null);
});
