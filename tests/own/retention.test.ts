import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDrops, detectRewatches, fitKnee, openingRetention, pointAtSec, retentionAt } from '../../scripts/own/retention.ts';
import type { RetentionPoint } from '../../scripts/own/types.ts';

// 100点の曲線。f(ratio) で watchRatio を決める
const curve = (f: (r: number) => number): RetentionPoint[] =>
  Array.from({ length: 100 }, (_, i) => {
    const ratio = (i + 1) / 100;
    return { ratio, watchRatio: f(ratio), relative: 0.5 };
  });

// 実際の動画に近い形：最初の1〜2分で急に落ち、なめらかに横ばいへ（1200秒の動画）
const DUR = 1200;
const smooth = (t: number) => 0.4 + 0.55 * Math.exp(-t / 45);

test('pointAtSec: いちばん近い位置の点を返す。尺0なら null', () => {
  const pts = curve((r) => 1 - r / 2);
  assert.equal(pointAtSec(pts, 600, 30)?.ratio, 0.05);
  assert.equal(pointAtSec(pts, 0, 30), null);
  assert.equal(pointAtSec([], 600, 30), null);
});

test('retentionAt / openingRetention: その秒の割合。その秒より短い動画は null', () => {
  const pts = curve((r) => 1 - r / 2);
  assert.equal(retentionAt(pts, 600, 60), 1 - 0.1 / 2);
  assert.equal(openingRetention(pts, 600), 1 - 0.05 / 2);
  assert.equal(retentionAt(pts, 60, 60), null);
  assert.equal(openingRetention(pts, 25), null);
});

test('fitKnee: 折れ線の当てはめで、落ち着いた時点・水準・前後の落ち方を出す', () => {
  // 600秒の動画で、2:00 まで毎分30ptずつ落ち、そのあと40%で横ばい
  const k = fitKnee(curve((r) => (r <= 0.2 ? 1 - r * 3 : 0.4)), 600);
  assert.ok(k);
  assert.ok(k.atSec >= 108 && k.atSec <= 132, JSON.stringify(k));
  assert.ok(Math.abs(k.level - 40) < 1);
  assert.ok(Math.abs(k.slopeBeforePerMin + 30) < 1);
  assert.ok(Math.abs(k.slopeAfterPerMin) < 0.1);
});

test('fitKnee: なめらかな曲線でも、急落の終わりの近くに折れ目を置く。点が少なければ null', () => {
  const k = fitKnee(curve((r) => smooth(r * DUR)), DUR);
  assert.ok(k && k.atSec >= 24 && k.atSec <= 240, JSON.stringify(k));
  assert.equal(fitKnee(curve(() => 0.5).slice(0, 6), 600), null);
});

test('detectDrops: なめらかな急落（導入部）から横ばいへ移る形は、離脱に入れない', () => {
  assert.deepEqual(detectDrops(curve((r) => smooth(r * DUR)), DUR), []);
  assert.deepEqual(detectDrops(curve((r) => (r <= 0.2 ? 1 - r * 3 : 0.4)), 600), []);
});

test('detectDrops: 導入部の中でも、前後より急な段差は拾う', () => {
  // 0:36〜0:48 の間で、なめらかな落ち方に加えて 8pt 落ちる
  const drops = detectDrops(curve((r) => smooth(r * DUR) - (r * DUR >= 45 ? 0.08 : 0)), DUR);
  assert.equal(drops.length, 1, JSON.stringify(drops));
  assert.ok(drops[0].atSec >= 12 && drops[0].atSec <= 60, JSON.stringify(drops));
});

test('detectDrops: 途中の急な離脱（40%の位置で約12pt）を、落ちた幅とふだんとの差つきで見つける', () => {
  const pts = curve((r) => 0.7 - r * 0.2 - (r > 0.4 && r <= 0.43 ? (r - 0.4) * 4 : r > 0.43 ? 0.12 : 0));
  const drops = detectDrops(pts, 600);
  assert.equal(drops.length, 1, JSON.stringify(drops));
  assert.ok(drops[0].atSec >= 228 && drops[0].atSec <= 258, JSON.stringify(drops));
  assert.ok(drops[0].deltaPt <= -12);
  assert.ok(drops[0].excessPt <= -3);
  assert.ok(drops[0].z <= -3.5);
});

test('detectDrops: 隣どうしの ±0.5pt の揺れだけでは何も返さない', () => {
  const noisy = curve((r) => 0.6 - r * 0.1 + (Math.round(r * 100) % 2 ? 0.005 : -0.005));
  assert.deepEqual(detectDrops(noisy, 600), []);
});

test('detectDrops: 最大3件で、ふだんより急な順', () => {
  const stairs = curve((r) => 0.9 - (r > 0.2 ? 0.05 : 0) - (r > 0.4 ? 0.1 : 0) - (r > 0.6 ? 0.15 : 0) - (r > 0.8 ? 0.08 : 0));
  const drops = detectDrops(stairs, 1000);
  assert.equal(drops.length, 3);
  for (let i = 1; i < drops.length; i++) assert.ok(drops[i - 1].excessPt <= drops[i].excessPt);
  assert.deepEqual(drops.map((d) => Math.round(d.deltaPt)), [-15, -10, -8]);
});

test('detectDrops: 最後の5%（終了画面）の落ち込みは数えない', () => {
  assert.deepEqual(detectDrops(curve((r) => (r >= 0.97 ? 0.3 : 0.5)), 600), []);
});

test('detectRewatches: 前後より上がった所を返す', () => {
  const rises = detectRewatches(curve((r) => (r >= 0.5 && r < 0.55 ? 0.65 : 0.6)), 600);
  assert.equal(rises.length, 1);
  assert.ok(rises[0].atSec >= 282 && rises[0].atSec <= 300, JSON.stringify(rises));
  assert.ok(Math.abs(rises[0].risePt - 5) < 1e-9);
});

test('detectRewatches: 平らな曲線では何も返さない', () => {
  assert.deepEqual(detectRewatches(curve(() => 0.5), 600), []);
});

test('detectRewatches: 落ち方がゆるくなっただけ（実際には下がっている）所は、見返しに入れない', () => {
  // 毎点1.5ptずつ落ちるが、40%の位置だけ落ちない（ふだんより上なので外れ値にはなるが、前後で見れば下がっている）
  const pts = Array.from({ length: 100 }, (_, i) => {
    const ratio = (i + 1) / 100;
    return { ratio, watchRatio: 1 - i * 0.015 + (i >= 40 ? 0.015 : 0), relative: 0.5 };
  });
  assert.deepEqual(detectRewatches(pts, 600), []);
});
