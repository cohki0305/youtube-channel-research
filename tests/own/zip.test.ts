import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../scripts/lib.ts';
import { readZip } from '../../scripts/own/zip.ts';

const fixture = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'studio', 'export-ja.zip'));

test('readZip: 日本語のファイル名（UTF-8）を読み、圧縮あり・なしの両方を展開する', () => {
  const entries = readZip(fixture);
  assert.deepEqual(entries.map((e) => e.name), ['表データ.csv', 'グラフデータ.csv', '合計.csv']);
  assert.match(entries[0].data.toString('utf8'), /^﻿コンテンツ,動画のタイトル/);
  assert.equal(entries[2].data.toString('utf8'), '日付,エンゲージ ビュー\n2026-09-01,10\n');
});

test('readZip: zip でなければエラー', () => {
  assert.throws(() => readZip(Buffer.from('not a zip')), /zip/);
});
