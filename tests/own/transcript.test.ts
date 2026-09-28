import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterAt, decodeEntities, fmtSec, fromLibrary, linesAround, parseChapters, parseSbv, parseSrt } from '../../scripts/own/transcript.ts';

test('parseSrt: BOM・CRLF・複数行のテキスト', () => {
  const srt = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nこんにちは\r\n\r\n2\r\n00:00:03,500 --> 00:00:06,000\r\n今日は決算の話です\r\n二行目\r\n';
  assert.deepEqual(parseSrt(srt), [
    { start: 1, dur: 2.5, text: 'こんにちは' },
    { start: 3.5, dur: 2.5, text: '今日は決算の話です 二行目' },
  ]);
});

test('parseSbv', () => {
  const sbv = '0:00:01.000,0:00:03.500\nこんにちは\n\n0:01:03.500,0:01:06.000\n今日は\n';
  assert.deepEqual(parseSbv(sbv), [
    { start: 1, dur: 2.5, text: 'こんにちは' },
    { start: 63.5, dur: 2.5, text: '今日は' },
  ]);
});

test('decodeEntities / fromLibrary: 二重に符号化された記号も戻す', () => {
  assert.equal(decodeEntities('A &amp;#39;B&amp;#39; &quot;C&quot; &lt;D&gt;'), 'A \'B\' "C" <D>');
  assert.deepEqual(fromLibrary([{ offset: 1.2, duration: 2, text: 'それは&amp;#39;PER&amp;#39;\nです' }]), [{ start: 1.2, dur: 2, text: 'それは\'PER\' です' }]);
});

test('parseChapters: 行頭の時刻だけを拾う。区切りの記号と時間つきにも対応', () => {
  const desc = '今日の動画です。詳しくは 1:23 で話します\n0:00 はじめに\n1:30 - 決算のポイント\n12:05 まとめ\n1:02:03 おまけ\nhttps://example.com';
  assert.deepEqual(parseChapters(desc), [
    { start: 0, title: 'はじめに' },
    { start: 90, title: '決算のポイント' },
    { start: 725, title: 'まとめ' },
    { start: 3723, title: 'おまけ' },
  ]);
  assert.deepEqual(parseChapters('チャプターなし'), []);
});

test('chapterAt: その秒を含むチャプター。最初より前なら null', () => {
  const ch = [{ start: 10, title: 'A' }, { start: 90, title: 'B' }];
  assert.equal(chapterAt(ch, 100)?.title, 'B');
  assert.equal(chapterAt(ch, 90)?.title, 'B');
  assert.equal(chapterAt(ch, 5), null);
});

test('linesAround: その秒の行と前後。最後より後なら最後の行の周り', () => {
  const segs = [
    { start: 0, dur: 2, text: 'a' }, { start: 2, dur: 2, text: 'b' },
    { start: 4, dur: 2, text: 'c' }, { start: 6, dur: 2, text: 'd' },
  ];
  assert.deepEqual(linesAround(segs, 4).map((s) => s.text), ['b', 'c', 'd']);
  assert.deepEqual(linesAround(segs, 100).map((s) => s.text), ['c', 'd']);
  assert.deepEqual(linesAround([], 4), []);
});

test('fmtSec', () => {
  assert.equal(fmtSec(75), '1:15');
  assert.equal(fmtSec(3723), '1:02:03');
  assert.equal(fmtSec(0), '0:00');
});
