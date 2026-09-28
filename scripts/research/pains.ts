// 検索結果の上位動画から、視聴者の悩みを読むための材料（チャプター・冒頭の発言・コメント）を整える
// 悩みを型に分けるのは Claude（スキルのパートC・C5）。ここでは読みやすく並べるだけ
import { fmt } from '../lib.ts';
import { decodeEntities, fmtSec } from '../own/transcript.ts';
import type { Chapter, Segment } from '../own/types.ts';

export interface PainComment { text: string; likes: number; }
export interface PainVideo {
  rank: number;
  videoId: string;
  title: string;
  url: string;
  channel: string;
  subs: number | null;
  views: number;
  ageDays: number;
  durationMin: number;
  chapters: Chapter[];
  comments: PainComment[];
  commentsStatus: 'ok' | 'disabled' | 'error';
  opening: string | null; // 冒頭の発言（文字起こし）
  transcriptPath?: string | null; // 全文（上位の数本だけ保存）
}

// 文字起こしの全文を、every 秒ごとに時刻を入れたテキストにする（Claude が全文を読むため）
export function formatTranscript(segs: Segment[], every = 30): string {
  const out: string[] = [];
  let blockStart = -Infinity;
  for (const s of segs) {
    if (s.start >= blockStart + every) {
      blockStart = s.start;
      out.push(`[${fmtSec(s.start)}] ${s.text}`);
    } else out[out.length - 1] += ' ' + s.text;
  }
  return out.length ? out.join('\n') + '\n' : '';
}

// コメントの HTML の記号・タグ・改行を取り除く
export function cleanComment(text: string): string {
  return decodeEntities(text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

// 悩み・質問・できなかったことを含むコメント。感想だけのものは拾わない
const PAIN = /できない|出来ない|できません|わからない|分からない|わかりません|分かりません|わかんない|困っ|困る|教えて|どうすれ|どうやって|使えない|使えませ|エラー|反映され|出てこない|出てきません|表示されない|表示されません|うまくいかない|上手くいかない|なぜ|なんで|有料|ライセンス|権限|会社(?:だと|では|の(?:PC|パソコン))|？|\?/;
export const isPainCandidate = (text: string): boolean => PAIN.test(text);

// 不満・物足りなさ・要望・不安。上位の動画が悩みに応えきれていない手がかり
const COMPLAINT = /もっと|詳しく|実例|具体例|明確に|作って(?:下さい|ください|ほしい|欲しい)|欲しい|ほしい|結局|できなかった|出来なかった|分かりにくい|わかりにくい|早すぎ|速すぎ|ついていけ|意味(?:が)?ない|古い|できなくなり|出来なくなり|消えました|変わりました|大丈夫(?:でしょうか|ですか|なんでしょうか)|心配|不安|気をつけ|注意が|ハードルが高|宣伝/;
export const isComplaint = (text: string): boolean => COMPLAINT.test(text);

export function renderPainDigest(query: string, videos: PainVideo[], fetchedAt = new Date()): string {
  const L: string[] = [];
  const p = (s = '') => { L.push(s); };
  p(`# 「${query}」の上位動画から悩みを読む`);
  p();
  p(`- 作成: ${fetchedAt.toISOString()}`);
  p('- 出典: YouTube Data API（検索順位・動画・コメント）、文字起こし（youtube-transcript-plus）');
  p('- 読み方: タイトルと冒頭の発言は「作り手が読んだ悩み」、コメントは「視聴者自身の悩み」。最後の「悩み・質問の候補」から型を作り、「答えの一覧」で、どの悩みにどの動画がどこまで答えているかを見る。「不満・物足りなさ・要望の候補」は、まだ応えきれていない所の手がかり');
  p();
  p('## 答えの一覧');
  p();
  p('| 順位 | タイトル | 再生 | 尺 | 公開 | チャプター（どの順番で何に答えたか） |');
  p('|--:|---|--:|--:|--:|---|');
  for (const v of videos) {
    const ch = v.chapters.length ? v.chapters.map((c) => c.title).join(' ／ ') : '（なし。冒頭の発言とタイトルから読む）';
    p(`| ${v.rank} | ${v.title.replace(/\|/g, '｜')} | ${fmt(v.views)} | ${v.durationMin}分 | ${Math.round(v.ageDays)}日前 | ${ch.replace(/\|/g, '｜')} |`);
  }
  p();
  for (const v of videos) {
    p(`## ${v.rank}. ${v.title}`);
    p();
    p(`- 再生 ${fmt(v.views)} ／ 登録者 ${fmt(v.subs)} ／ 公開 ${Math.round(v.ageDays)}日前 ／ ${v.durationMin}分 ／ ${v.channel}`);
    p(`- ${v.url}`);
    p();
    p('### チャプター');
    p();
    if (v.chapters.length) for (const c of v.chapters) p(`- ${fmtSec(c.start)} ${c.title}`);
    else p('（概要欄にチャプターなし）');
    p();
    p('### 冒頭の発言');
    p();
    p(v.opening ? `> ${v.opening}` : '（文字起こしなし）');
    if (v.transcriptPath) { p(); p(`全文: \`${v.transcriptPath}\`（冒頭だけで判断せず、全文を読む）`); }
    p();
    p('### コメント（関連度順）');
    p();
    if (v.commentsStatus === 'disabled') p('（コメントは無効）');
    else if (v.commentsStatus === 'error') p('（コメントを取得できず）');
    else if (!v.comments.length) p('（コメントなし）');
    else for (const c of v.comments) p(`- （いいね ${c.likes}）${c.text}`);
    p();
  }
  const cand = videos
    .flatMap((v) => v.comments.filter((c) => isPainCandidate(c.text)).map((c) => ({ ...c, rank: v.rank })))
    .sort((a, b) => b.likes - a.likes);
  p('## 悩み・質問の候補（全動画、いいね順）');
  p();
  p('「できない」「わからない」「？」などを含むコメント。感想だけのコメントは除いた。ここから悩みの型を作る');
  p();
  if (!cand.length) p('（候補なし）');
  else {
    p('| いいね | コメント | 動画 |');
    p('|--:|---|--:|');
    for (const c of cand) p(`| ${c.likes} | ${c.text.replace(/\|/g, '｜').slice(0, 200)} | ${c.rank} |`);
  }
  p();
  const complaints = videos
    .flatMap((v) => v.comments.filter((c) => isComplaint(c.text)).map((c) => ({ ...c, rank: v.rank })))
    .sort((a, b) => b.likes - a.likes);
  p('## 不満・物足りなさ・要望の候補（全動画、いいね順）');
  p();
  p('「もっと」「実例が欲しい」「〜の動画を作って」「大丈夫でしょうか」「できなくなった」などを含むコメント。上位の動画が応えきれていない悩みの手がかり');
  p();
  if (!complaints.length) p('（候補なし）');
  else {
    p('| いいね | コメント | 動画 |');
    p('|--:|---|--:|');
    for (const c of complaints) p(`| ${c.likes} | ${c.text.replace(/\|/g, '｜').slice(0, 200)} | ${c.rank} |`);
  }
  return L.join('\n') + '\n';
}
