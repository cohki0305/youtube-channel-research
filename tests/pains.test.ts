import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanComment, isComplaint, isPainCandidate, renderPainDigest, type PainVideo } from '../scripts/research/pains.ts';

test('cleanComment: HTML の記号・改行・リンクを取り除く', () => {
  assert.equal(cleanComment('会社だと&quot;使えない&quot;<br>どうすれば？ <a href="https://x">1:23</a>'), '会社だと"使えない" どうすれば？ 1:23');
  assert.equal(cleanComment('  A&amp;B  \n\n C '), 'A&B C');
});

test('isPainCandidate: 悩み・質問・できなかったことを含むコメントを拾い、感想だけのものは拾わない', () => {
  for (const t of ['会社のPCだとCopilotのボタンが出てこないです', 'Excelで反映されないのはなぜ？', '有料版じゃないと使えませんか', 'やり方が分かりませんでした', 'どうすればエージェントを作れますか']) {
    assert.equal(isPainCandidate(t), true, t);
  }
  for (const t of ['わかりやすい！', '参考になりました', 'ありがとうございます']) {
    assert.equal(isPainCandidate(t), false, t);
  }
});

const video = (rank: number, o: Partial<PainVideo> = {}): PainVideo => ({
  rank, videoId: 'v' + rank, title: '動画' + rank, url: 'https://www.youtube.com/watch?v=v' + rank, channel: 'ch', subs: 1000,
  views: 5000, ageDays: 10, durationMin: 20, chapters: [], comments: [], commentsStatus: 'ok', opening: null, ...o,
});

test('renderPainDigest: 動画ごとの材料と、全動画の悩みの候補（いいね順）をまとめる', () => {
  const md = renderPainDigest('copilot', [
    video(1, {
      chapters: [{ start: 0, title: 'はじめに' }, { start: 90, title: 'Excelで使う' }],
      comments: [{ text: '参考になりました', likes: 50 }, { text: '会社だと使えないです', likes: 3 }],
      opening: '今日はCopilotが使えないという悩みに答えます',
    }),
    video(2, { comments: [{ text: 'Excelで反映されないのはなぜ？', likes: 9 }], commentsStatus: 'ok' }),
    video(3, { commentsStatus: 'disabled' }),
  ]);
  assert.match(md, /# 「copilot」の上位動画から悩みを読む/);
  assert.match(md, /## 1\. 動画1/);
  assert.match(md, /1:30 Excelで使う/);
  assert.match(md, /> 今日はCopilotが使えないという悩みに答えます/);
  assert.match(md, /コメントは無効/);
  // 候補はいいね順。感想だけのコメントは入らない
  const cand = md.slice(md.indexOf('## 悩み・質問の候補'));
  assert.ok(cand.indexOf('反映されない') < cand.indexOf('会社だと使えない'));
  assert.doesNotMatch(cand, /参考になりました/);
});

test('isComplaint: 不満・物足りなさ・要望・不安を拾い、ほめ言葉は拾わない', () => {
  for (const t of ['会社は無償版なので、無償版で出来ることだけの動画を作って下さい', '実例が欲しい', '機密情報を入力しても大丈夫でしょうか？', '先日まで出来ていたのに急にできなくなりました', 'もっと詳しく知りたいです', '説明が早すぎてついていけない']) {
    assert.equal(isComplaint(t), true, t);
  }
  for (const t of ['わかりやすかったです', '参考になりました', '明日から使います！']) {
    assert.equal(isComplaint(t), false, t);
  }
});

test('renderPainDigest: 答えの一覧（チャプター）と、不満・要望の候補を出す', () => {
  const md = renderPainDigest('copilot', [
    video(1, { chapters: [{ start: 0, title: 'はじめに' }, { start: 90, title: 'Excelで使う' }], comments: [{ text: '実例が欲しい', likes: 4 }] }),
    video(2, { comments: [{ text: 'わかりやすかったです', likes: 30 }] }),
  ]);
  assert.match(md, /## 答えの一覧/);
  assert.match(md, /\| 1 \| 動画1 \|[^\n]*はじめに ／ Excelで使う/);
  const sec = md.slice(md.indexOf('## 不満・物足りなさ・要望の候補'));
  assert.match(sec, /実例が欲しい/);
  assert.doesNotMatch(sec, /わかりやすかった/);
});

test('formatTranscript: 全文を、一定の間隔で時刻を入れた読みやすいテキストにする', async () => {
  const { formatTranscript } = await import('../scripts/research/pains.ts');
  const segs = [
    { start: 0, dur: 5, text: 'こんにちは' }, { start: 5, dur: 5, text: '今日は' },
    { start: 31, dur: 5, text: '本題です' }, { start: 95, dur: 5, text: 'まとめ' },
  ];
  assert.equal(formatTranscript(segs, 30), '[0:00] こんにちは 今日は\n[0:31] 本題です\n[1:35] まとめ\n');
  assert.equal(formatTranscript([], 30), '');
});
