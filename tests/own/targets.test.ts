import test from 'node:test';
import assert from 'node:assert/strict';
import type { Video } from '../../scripts/lib.ts';
import { argValue, CONFIRM_OVER, defaultSince, needsConfirmation, selectVideos } from '../../scripts/own/targets.ts';

const v = (id: string, publishedAt: string) => ({ id, publishedAt }) as Video;
const videos = [v('aaaaaaaaaaa', '2026-09-01T00:00:00Z'), v('bbbbbbbbbbb', '2025-08-01T00:00:00Z'), v('ccccccccccc', '2025-10-01T00:00:00Z')];

test('defaultSince: 直近12か月', () => {
  assert.equal(defaultSince(new Date('2026-09-28T00:00:00Z')), '2025-09');
  assert.equal(defaultSince(new Date('2026-01-05T00:00:00Z')), '2025-01');
});

test('selectVideos: since で絞る。--video と --ids は期間に関係なく選ぶ', () => {
  assert.deepEqual(selectVideos(videos, { video: null, ids: null, since: '2025-09' }).map((x) => x.id), ['aaaaaaaaaaa', 'ccccccccccc']);
  assert.deepEqual(selectVideos(videos, { video: 'bbbbbbbbbbb', ids: null, since: '2025-09' }).map((x) => x.id), ['bbbbbbbbbbb']);
  assert.deepEqual(selectVideos(videos, { video: null, ids: ['ccccccccccc', 'bbbbbbbbbbb'], since: '2026-09' }).map((x) => x.id), ['ccccccccccc', 'bbbbbbbbbbb']);
});

test('selectVideos: videos.json にない動画は、fetch_channel を促すエラー', () => {
  assert.throws(() => selectVideos(videos, { video: 'zzzzzzzzzzz', ids: null, since: '2025-09' }), /fetch_channel\.ts/);
  assert.throws(() => selectVideos(videos, { video: null, ids: ['aaaaaaaaaaa', 'yyyyyyyyyyy'], since: '2025-09' }), /yyyyyyyyyyy/);
});

test('needsConfirmation: CONFIRM_OVER 本を超え、--yes がないときだけ止める', () => {
  assert.equal(needsConfirmation(CONFIRM_OVER, false), false);
  assert.equal(needsConfirmation(CONFIRM_OVER + 1, false), true);
  assert.equal(needsConfirmation(CONFIRM_OVER + 1, true), false);
});

test('argValue', () => {
  assert.equal(argValue(['node', 'x', 'data/a', '--video', 'abc'], '--video'), 'abc');
  assert.equal(argValue(['node', 'x', 'data/a'], '--video'), null);
  assert.equal(argValue(['node', 'x', 'data/a', '--video'], '--video'), null);
});
