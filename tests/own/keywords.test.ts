import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKeywordRows, SEARCH_TYPE, TOPIC_TYPE } from '../../scripts/own/keywords.ts';
import type { OwnAnalytics } from '../../scripts/own/types.ts';

const a = (videoId: string, search: [string, number][]) =>
  ({ videoId, trafficDetail: { YT_SEARCH: search.map(([detail, views]) => ({ detail, views })), RELATED_VIDEO: [] } }) as unknown as OwnAnalytics;

test('buildKeywordRows: YouTube検索語を、チャンネル全体の再生の多い順に上限まで選ぶ。少ない語は外す', () => {
  const rows = buildKeywordRows([a('v1', [['excel ai', 9], ['エクセル  ai', 9], ['x', 1]]), a('v2', [['excel ai', 3], ['ai 社員', 30]])], [], { minViews: 2, top: 2 });
  assert.deepEqual(rows, [
    { video_id: 'v2', keyword: 'ai 社員', type: SEARCH_TYPE },
    { video_id: 'v1', keyword: 'excel ai', type: SEARCH_TYPE },
    { video_id: 'v2', keyword: 'excel ai', type: SEARCH_TYPE },
  ]);
});

test('buildKeywordRows: 手で足した題材語の行は残し、古い検索語の行は作り直す', () => {
  const existing = [
    { video_id: 'v1', keyword: 'excel ai', type: TOPIC_TYPE },
    { video_id: 'v1', keyword: '古い語', type: SEARCH_TYPE },
  ];
  const rows = buildKeywordRows([a('v1', [['エクセル ai', 5]])], existing, { minViews: 1, top: 50 });
  assert.deepEqual(rows, [
    { video_id: 'v1', keyword: 'excel ai', type: TOPIC_TYPE },
    { video_id: 'v1', keyword: 'エクセル ai', type: SEARCH_TYPE },
  ]);
});
