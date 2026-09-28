#!/usr/bin/env node
// 動画の文字起こし（秒つき）を取る。自分の動画にも、ベンチマークの動画にも使える
// 使い方: node scripts/fetch_transcript.ts data/<slug> [--video <id> | --ids a,b,c] [--since YYYY-MM] [--lang ja] [--yes]
//   指定がなければ対象期間（既定は直近12か月）の全動画。取りに行く本数が 20 本を超えるときは --yes が必要
// 出力: data/<slug>/transcripts/<videoId>.json（{ videoId, source, lang, fetchedAt, segments: [{ start, dur, text }] }）
// 取り方: youtube-transcript-plus（YouTubeの非公式の内部API）。YouTube側の変更で動かなくなることがある。
//   取れないときは、Studio から字幕ファイルを落として transcripts/<videoId>.srt（または .sbv）に置くと、それを使う
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import * as transcriptLib from 'youtube-transcript-plus';
import { ROOT, type Video } from './lib.ts';
import { fromLibrary, parseSbv, parseSrt } from './own/transcript.ts';
import { argValue, CONFIRM_OVER, defaultSince, needsConfirmation, selectVideos } from './own/targets.ts';
import type { Segment, TranscriptFile } from './own/types.ts';

// youtube-transcript-plus の型定義は、エラーのクラスを拡張子なしの './errors' から再エクスポートしている。
// moduleResolution: nodenext ではこれが解決されず型の確認が通らないため、実行時の値から取り出す（実行時には存在する）
type ErrorClass = new (...args: never[]) => Error;
const { fetchTranscript } = transcriptLib;
const { YoutubeTranscriptNotAvailableLanguageError, YoutubeTranscriptTooManyRequestError } = transcriptLib as unknown as {
  YoutubeTranscriptNotAvailableLanguageError: ErrorClass;
  YoutubeTranscriptTooManyRequestError: ErrorClass;
};

const dirArg = process.argv[2];
if (!dirArg || dirArg.startsWith('--')) {
  console.error('使い方: node scripts/fetch_transcript.ts data/<slug> [--video <id> | --ids a,b,c] [--since YYYY-MM] [--lang ja] [--yes]');
  process.exit(1);
}
const dir = path.resolve(ROOT, dirArg);
const videosPath = path.join(dir, 'videos.json');
if (!fs.existsSync(videosPath)) {
  console.error(`${path.relative(ROOT, videosPath)} がありません。先に node scripts/fetch_channel.ts @handle を実行してください`);
  process.exit(1);
}
const videos: Video[] = JSON.parse(fs.readFileSync(videosPath, 'utf8'));
const lang = argValue(process.argv, '--lang') ?? 'ja';
const idsArg = argValue(process.argv, '--ids');
let targets: Video[];
try {
  targets = selectVideos(videos, {
    video: argValue(process.argv, '--video'),
    ids: idsArg ? idsArg.split(',').map((s) => s.trim()).filter(Boolean) : null,
    since: argValue(process.argv, '--since') ?? defaultSince(new Date()),
  });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

const outDir = path.join(dir, 'transcripts');
fs.mkdirSync(outDir, { recursive: true });
const localFile = (id: string) => ['srt', 'sbv'].map((ext) => path.join(outDir, `${id}.${ext}`)).find((p) => fs.existsSync(p));
const todo = targets.filter((v) => !fs.existsSync(path.join(outDir, `${v.id}.json`)));
const network = todo.filter((v) => !localFile(v.id));
if (needsConfirmation(network.length, process.argv.includes('--yes'))) {
  console.error(`${network.length} 本の文字起こしを取ろうとしています（${CONFIRM_OVER} 本を超えています）。非公式の通信なので、取り過ぎると制限されます。--video / --ids で絞るか、--yes を付けて続けてください`);
  process.exit(1);
}

async function fromYoutube(id: string): Promise<{ lang: string; segments: Segment[] }> {
  try {
    const segs = await fetchTranscript(id, { lang });
    return { lang, segments: fromLibrary(segs) };
  } catch (e) {
    if (!(e instanceof YoutubeTranscriptNotAvailableLanguageError)) throw e;
    const segs = await fetchTranscript(id); // 指定の言語がなければ、ある言語で取る
    return { lang: segs[0]?.lang ?? '', segments: fromLibrary(segs) };
  }
}

let saved = 0, missing = 0, first = true;
for (const v of todo) {
  const out = path.join(outDir, `${v.id}.json`);
  const local = localFile(v.id);
  let file: TranscriptFile | null = null;
  if (local) {
    const text = fs.readFileSync(local, 'utf8');
    file = { videoId: v.id, source: path.basename(local), lang: '', fetchedAt: new Date().toISOString(), segments: local.endsWith('.srt') ? parseSrt(text) : parseSbv(text) };
  } else {
    if (!first) await sleep(1500); // 間隔を空ける
    first = false;
    for (let attempt = 0; attempt < 2 && !file; attempt++) {
      try {
        const r = await fromYoutube(v.id);
        file = { videoId: v.id, source: 'youtube-transcript-plus', lang: r.lang, fetchedAt: new Date().toISOString(), segments: r.segments };
      } catch (e) {
        if (e instanceof YoutubeTranscriptTooManyRequestError && attempt === 0) {
          console.error('制限されました（429）。30秒待って、もう一度試します');
          await sleep(30_000);
          continue;
        }
        console.error(`✗ ${v.id} 文字起こしなし: ${(e as Error).message}。Studio から字幕ファイルを落として ${path.relative(ROOT, path.join(outDir, v.id + '.srt'))} に置けば使えます`);
        break;
      }
    }
  }
  if (file && file.segments.length) {
    fs.writeFileSync(out, JSON.stringify(file, null, 2));
    saved++;
    console.error(`✓ ${v.id} ${file.segments.length} 行（${file.source}）`);
  } else {
    if (file) console.error(`✗ ${v.id} 文字起こしが空でした`);
    missing++;
  }
}
console.log(`${saved} 本を保存、${missing} 本は取れず（保存済みの ${targets.length - todo.length} 本はそのまま）→ ${path.relative(ROOT, outDir)}/`);
