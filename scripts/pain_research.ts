#!/usr/bin/env node
// 検索語の上位動画から、視聴者の悩みを読むための材料（チャプター・冒頭の発言・コメント）を集める
// 使い方: node scripts/pain_research.ts "<検索語>" [--top 10] [--full 5] [--comments 100] [--opening 60] [--no-transcript]
//   --full の本数（既定5）は、文字起こしの全文を data/_pains/<検索語>/ に保存する。悩みに応えているかは全文で判断する
//   先に node scripts/search_compare.ts "<検索語>" で検索結果（関連度順）を取っておく
// 出力: data/_pains/<検索語>.md と .json。悩みを型に分けるのは Claude（スキルのパートC・C5）
// クォータ: 動画の詳細 1ユニット + コメント 1本あたり1ユニット。文字起こしは非公式の通信（--top は20本まで）
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import * as transcriptLib from 'youtube-transcript-plus';
import { ROOT, requireApiKey, slug, yt, quotaUsed } from './lib.ts';
import { argValue, CONFIRM_OVER } from './own/targets.ts';
import { fromLibrary, parseChapters } from './own/transcript.ts';
import { cleanComment, formatTranscript, renderPainDigest, type PainComment, type PainVideo } from './research/pains.ts';

const { fetchTranscript } = transcriptLib;

interface SearchRow { rank: number; videoId: string; channel: string; subs: number | null; views: number; ageDays: number; durationMin: number; title: string; }
interface CommentItem { snippet: { topLevelComment: { snippet: { textDisplay: string; likeCount: number } } } }

const query = process.argv[2];
if (!query || query.startsWith('--')) {
  console.error('使い方: node scripts/pain_research.ts "<検索語>" [--top 10] [--comments 100] [--opening 60] [--no-transcript]');
  process.exit(1);
}
const top = Math.min(CONFIRM_OVER, Number(argValue(process.argv, '--top') ?? 10));
const maxComments = Math.min(100, Number(argValue(process.argv, '--comments') ?? 100));
const openingSec = Number(argValue(process.argv, '--opening') ?? 60);
const withTranscript = !process.argv.includes('--no-transcript');
const fullN = Number(argValue(process.argv, '--full') ?? 5);
const fullDir = path.join(ROOT, 'data', '_pains', slug(query));

const searchPath = path.join(ROOT, 'data', '_search', slug(query) + '.json');
if (!fs.existsSync(searchPath)) {
  console.error(`${path.relative(ROOT, searchPath)} がありません。先に node scripts/search_compare.ts "${query}" を実行してください（関連度順）`);
  process.exit(1);
}
const search = JSON.parse(fs.readFileSync(searchPath, 'utf8')) as { order: string; rows: SearchRow[] };
if (search.order !== 'relevance') console.error('⚠ 検索結果が関連度順ではありません。悩みを読むには関連度順（既定）で取り直すのがよい');
const rows = search.rows.slice(0, top);
const key = requireApiKey();

// 概要欄（チャプター）
const details = await yt(key, 'videos', { part: 'snippet', id: rows.map((r) => r.videoId).join(',') });
const descById = new Map<string, string>(details.items.map((v: { id: string; snippet: { description: string } }) => [v.id, v.snippet.description ?? '']));

const videos: PainVideo[] = [];
for (const r of rows) {
  // コメント（関連度順）
  let comments: PainComment[] = [];
  let commentsStatus: PainVideo['commentsStatus'] = 'ok';
  try {
    const c = await yt(key, 'commentThreads', { part: 'snippet', videoId: r.videoId, order: 'relevance', maxResults: maxComments, textFormat: 'plainText' });
    comments = (c.items as CommentItem[]).map((i) => ({ text: cleanComment(i.snippet.topLevelComment.snippet.textDisplay), likes: i.snippet.topLevelComment.snippet.likeCount }));
  } catch (e) {
    commentsStatus = /disabled comments|commentsDisabled/i.test((e as Error).message) ? 'disabled' : 'error';
    if (commentsStatus === 'error') console.error(`✗ ${r.videoId} コメント: ${(e as Error).message}`);
  }
  // 冒頭の発言（非公式の通信。取れなければ空）
  let opening: string | null = null;
  let transcriptPath: string | null = null;
  if (withTranscript) {
    try {
      const segs = fromLibrary(await fetchTranscript(r.videoId, { lang: 'ja' }));
      opening = segs.filter((s) => s.start < openingSec).map((s) => s.text).join(' ') || null;
      if (r.rank <= fullN && segs.length) {
        fs.mkdirSync(fullDir, { recursive: true });
        const file = path.join(fullDir, `${r.rank}_${r.videoId}.txt`);
        fs.writeFileSync(file, `# ${r.rank}. ${r.title}\n# https://www.youtube.com/watch?v=${r.videoId}\n\n` + formatTranscript(segs));
        transcriptPath = path.relative(ROOT, file);
      }
    } catch (e) {
      console.error(`✗ ${r.videoId} 文字起こしなし: ${(e as Error).message}`);
    }
    await sleep(1500);
  }
  videos.push({
    rank: r.rank, videoId: r.videoId, title: r.title, url: 'https://www.youtube.com/watch?v=' + r.videoId, channel: r.channel,
    subs: r.subs, views: r.views, ageDays: r.ageDays, durationMin: r.durationMin,
    chapters: parseChapters(descById.get(r.videoId) ?? ''), comments, commentsStatus, opening, transcriptPath,
  });
  console.error(`✓ ${r.rank}. ${r.title.slice(0, 30)}（コメント ${comments.length}件${opening ? '・冒頭あり' : ''}）`);
}

const dir = path.join(ROOT, 'data', '_pains');
fs.mkdirSync(dir, { recursive: true });
const base = path.join(dir, slug(query));
fs.writeFileSync(base + '.md', renderPainDigest(query, videos));
fs.writeFileSync(base + '.json', JSON.stringify({ query, fetchedAt: new Date().toISOString(), videos }, null, 2));
console.log(`${videos.length} 本 → ${path.relative(ROOT, base)}.md / .json（使用クォータ 約${quotaUsed()}ユニット）`);
