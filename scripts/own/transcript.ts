// 文字起こし（字幕ファイル・ライブラリの結果）とチャプターを扱う
import type { Chapter, Segment } from './types.ts';

const clean = (s: string) => s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const toSec = (h: string, m: string, s: string, frac: string) => +h * 3600 + +m * 60 + +s + +('0.' + frac);

// SubRip（.srt）
export function parseSrt(text: string): Segment[] {
  const out: Segment[] = [];
  for (const block of clean(text).split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const m = lines[i].match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!m) continue;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    out.push({ start: round3(start), dur: round3(end - start), text: lines.slice(i + 1).join(' ').trim() });
  }
  return out;
}

// YouTube の .sbv
export function parseSbv(text: string): Segment[] {
  const out: Segment[] = [];
  for (const block of clean(text).split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const m = lines[0]?.match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,3}),(\d+):(\d{2}):(\d{2})\.(\d{1,3})$/);
    if (!m) continue;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    out.push({ start: round3(start), dur: round3(end - start), text: lines.slice(1).join(' ').trim() });
  }
  return out;
}

// &amp; を先に戻すので、二重に符号化された &amp;#39; も1回で戻る
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(+d));
}

// youtube-transcript-plus の結果（offset・duration は秒）
export function fromLibrary(segs: { offset: number; duration: number; text: string }[]): Segment[] {
  return segs.map((s) => ({ start: s.offset, dur: s.duration, text: decodeEntities(s.text).replace(/\s+/g, ' ').trim() }));
}

// 概要欄のチャプター。行頭の時刻だけを拾う（本文中の「1:23 で」は拾わない）
const CHAPTER = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—:：|]?\s*(.+?)\s*$/;
export function parseChapters(description: string): Chapter[] {
  const out: Chapter[] = [];
  for (const line of clean(description).split('\n')) {
    const m = line.match(CHAPTER);
    if (!m) continue;
    const start = m[1].split(':').map(Number).reduce((s, x) => s * 60 + x, 0);
    out.push({ start, title: m[2] });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function chapterAt(chapters: Chapter[], sec: number): Chapter | null {
  let hit: Chapter | null = null;
  for (const c of chapters) if (c.start <= sec) hit = c;
  return hit;
}

// sec 秒に話していた行と、その前後
export function linesAround(segs: Segment[], sec: number, before = 1, after = 1): Segment[] {
  if (!segs.length) return [];
  let idx = segs.findIndex((s) => s.start <= sec && sec < s.start + s.dur);
  if (idx < 0) {
    idx = 0;
    segs.forEach((s, i) => { if (s.start <= sec) idx = i; });
  }
  return segs.slice(Math.max(0, idx - before), idx + after + 1);
}

export function fmtSec(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}
