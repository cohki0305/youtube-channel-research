import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../scripts/lib.ts';
import { normalizeStudioRows, parseHms, parseNum } from '../../scripts/own/studio_csv.ts';

test('parseNum: 千区切り・％・空欄・ダッシュ', () => {
  assert.equal(parseNum('1,000'), 1000);
  assert.equal(parseNum('6.1'), 6.1);
  assert.equal(parseNum('42.0%'), 42);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum('—'), null);
  assert.equal(parseNum(undefined), null);
});

test('parseHms: 時:分:秒 と 分:秒', () => {
  assert.equal(parseHms('0:04:12'), 252);
  assert.equal(parseHms('4:12'), 252);
  assert.equal(parseHms('1:00:00'), 3600);
  assert.equal(parseHms(''), null);
  assert.equal(parseHms('—'), null);
});

const JA = '﻿コンテンツ,動画のタイトル,動画公開時刻,長さ,視聴回数,総再生時間（単位: 時間）,平均視聴時間,平均再生率 (%),インプレッション数,インプレッションのクリック率 (%)\n'
  + '合計,,,,"1,500",100.5,0:04:00,40.1,"20,000",5.2\n'
  + 'abcdefghijk,動画A,"Sep 1, 2026",600,"1,000",70.0,0:04:12,42.0,"12,000",6.1\n'
  + 'lmnopqrs-_v,"動画B, 続き","Sep 8, 2026",480,500,30.5,0:03:40,45.8,"8,000",\n';

test('normalizeStudioRows: 日本語UI。合計の行を外し、値をそろえる', () => {
  const r = normalizeStudioRows(parseCsv(JA), 'new');
  assert.deepEqual(r.missingColumns, []);
  assert.deepEqual(r.rows, [
    { videoId: 'abcdefghijk', viewerType: 'new', views: 1000, avgViewDurationSec: 252, avgViewPercentage: 42, impressions: 12000, ctr: 6.1 },
    { videoId: 'lmnopqrs-_v', viewerType: 'new', views: 500, avgViewDurationSec: 220, avgViewPercentage: 45.8, impressions: 8000, ctr: null },
  ]);
});

test('normalizeStudioRows: 英語UIと全角の括弧', () => {
  const en = 'Content,Video title,Views,Average view duration,Average percentage viewed (%),Impressions,Impressions click-through rate (%)\nTotal,,10,0:01:00,50,100,1\nabcdefghijk,A,10,0:01:00,50,100,1\n';
  assert.equal(normalizeStudioRows(parseCsv(en), 'all').rows[0].ctr, 1);
  const zen = 'コンテンツ,視聴回数,平均視聴時間,平均再生率（%）,インプレッション数,インプレッションのクリック率（%）\nabcdefghijk,10,0:01:00,50,100,1\n';
  const r = normalizeStudioRows(parseCsv(zen), 'all');
  assert.deepEqual(r.missingColumns, []);
  assert.equal(r.rows[0].avgViewPercentage, 50);
});

test('normalizeStudioRows: 列がなければ missingColumns に出し、値は null', () => {
  const csv = 'コンテンツ,視聴回数,平均視聴時間,平均再生率 (%)\nabcdefghijk,10,0:01:00,50\n';
  const r = normalizeStudioRows(parseCsv(csv), 'returning');
  assert.deepEqual(r.missingColumns, ['impressions', 'ctr']);
  assert.equal(r.rows[0].impressions, null);
  assert.equal(r.rows[0].ctr, null);
});

test('normalizeStudioRows: 動画の列がなければ行は0で、videoId を missingColumns に出す', () => {
  const r = normalizeStudioRows(parseCsv('日付,視聴回数\n2026-09-01,10\n'), 'all');
  assert.deepEqual(r.rows, []);
  assert.ok(r.missingColumns.includes('videoId'));
});

test('normalizeStudioRows: 実際の書き出し（2026-09）の列名。視聴者の人数も読む', async () => {
  const { readZip } = await import('../../scripts/own/zip.ts');
  const fs = await import('node:fs');
  const zip = readZip(fs.readFileSync(new URL('../fixtures/studio/export-ja.zip', import.meta.url)));
  const table = zip.find((e) => e.name === '表データ.csv');
  assert.ok(table);
  const r = normalizeStudioRows(parseCsv(table.data.toString('utf8')), 'all');
  assert.deepEqual(r.missingColumns, []);
  assert.deepEqual(r.rows[0], {
    videoId: 'aaaaaaaaaaa', viewerType: 'all', views: 1200, avgViewDurationSec: 450, avgViewPercentage: 25,
    impressions: 25000, ctr: 4.5, newViewers: 800, returningViewers: 100, uniqueViewers: 900,
  });
});
