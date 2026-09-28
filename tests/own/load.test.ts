import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadOwnData } from '../../scripts/own/load.ts';

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-load-'));
  const videos = [
    { id: 'aaaaaaaaaaa', publishedAt: '2026-09-01T00:00:00Z', title: 'A', description: '0:00 はじめに\n1:00 本題', durationSec: 600, isShortLikely: false, isLive: false },
    { id: 'bbbbbbbbbbb', publishedAt: '2024-01-01T00:00:00Z', title: 'B', description: '', durationSec: 600, isShortLikely: false, isLive: false },
  ];
  fs.writeFileSync(path.join(dir, 'channel.json'), JSON.stringify({ title: 'C' }));
  fs.writeFileSync(path.join(dir, 'videos.json'), JSON.stringify(videos));
  fs.mkdirSync(path.join(dir, 'own', 'analytics'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'transcripts'));
  fs.writeFileSync(path.join(dir, 'own', 'meta.json'), JSON.stringify({ dataThrough: '2026-09-25', fetchedAt: 'x' }));
  fs.writeFileSync(path.join(dir, 'own', 'studio.json'), JSON.stringify({ importedAt: '2026-09-27', warnings: [], rows: [
    { videoId: 'aaaaaaaaaaa', viewerType: 'new', views: 3 }, { videoId: 'aaaaaaaaaaa', viewerType: 'returning', views: 1 },
  ] }));
  fs.writeFileSync(path.join(dir, 'own', 'tags.csv'), 'video_id,type\naaaaaaaaaaa,決算\n');
  fs.writeFileSync(path.join(dir, 'transcripts', 'aaaaaaaaaaa.json'), JSON.stringify({ segments: [{ start: 0, dur: 1, text: 'x' }] }));
  return dir;
}

test('loadOwnData: 期間で絞り、Studio・型・文字起こし・チャプターを動画ごとにまとめる', () => {
  const d = loadOwnData(makeDir(), new Date('2026-09-28T00:00:00Z'), { since: '2025-09', include: null });
  assert.equal(d.videos.length, 1);
  const a = d.videos[0];
  assert.equal(a.studio.new?.views, 3);
  assert.equal(a.studio.returning?.views, 1);
  assert.equal(a.tag, '決算');
  assert.equal(a.transcript?.[0].text, 'x');
  assert.deepEqual(a.chapters.map((c) => c.title), ['はじめに', '本題']);
  assert.equal(a.analytics, null);
  assert.equal(d.dataThrough, '2026-09-25');
});

test('loadOwnData: include の動画は期間外でも入れる', () => {
  const d = loadOwnData(makeDir(), new Date(), { since: '2025-09', include: 'bbbbbbbbbbb' });
  assert.deepEqual(d.videos.map((v) => v.video.id).sort(), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
});

test('loadOwnData: channel.json がなければ fetch_channel を促す', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-load-empty-'));
  assert.throws(() => loadOwnData(dir, new Date(), { since: null, include: null }), /fetch_channel\.ts/);
});

test('loadOwnData: volumes.csv の検索数と、keywords.csv の題材語を読む', () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, 'keywords.csv'), 'video_id,keyword,type\naaaaaaaaaaa,excel ai,題材語\naaaaaaaaaaa,excel,YouTube検索語\n');
  fs.writeFileSync(path.join(dir, 'volumes.csv'), 'keyword,search_volume,yoy\nexcel ai,12100,0.5\nexcel,90500,\n');
  const d = loadOwnData(dir, new Date('2026-09-28T00:00:00Z'), { since: '2025-09', include: null });
  assert.deepEqual(d.videos[0].topics, ['excel ai']);
  assert.deepEqual(d.volumes['excel ai'], { searchVolume: 12100, yoy: 0.5 });
  assert.deepEqual(d.volumes.excel, { searchVolume: 90500, yoy: null });
});
