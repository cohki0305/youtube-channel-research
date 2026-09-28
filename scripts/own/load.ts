// data/<slug> から、自分のチャンネル分析に使うデータをまとめて読む（ないものは null・空）
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, type Channel, type Video } from '../lib.ts';
import { parseChapters } from './transcript.ts';
import { normKeyword, TOPIC_TYPE } from './keywords.ts';
import type { OwnAnalytics, OwnData, OwnMeta, StudioFile, StudioRow, TranscriptFile, VideoData, ViewerType } from './types.ts';

const readJson = <T>(p: string): T | null => (fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as T) : null);

export function loadOwnData(dir: string, now: Date, o: { since: string | null; include: string | null }): OwnData {
  const channel = readJson<Channel>(path.join(dir, 'channel.json'));
  const videos = readJson<Video[]>(path.join(dir, 'videos.json'));
  if (!channel || !videos) throw new Error(`${dir} に channel.json / videos.json がありません。先に node scripts/fetch_channel.ts @handle を実行してください`);
  const meta = readJson<OwnMeta>(path.join(dir, 'own', 'meta.json'));
  const studio = readJson<StudioFile>(path.join(dir, 'own', 'studio.json'));
  const tagsPath = path.join(dir, 'own', 'tags.csv');
  const tags: Record<string, string> = fs.existsSync(tagsPath)
    ? Object.fromEntries(parseCsv(fs.readFileSync(tagsPath, 'utf8')).map((r) => [(r.video_id ?? '').trim(), (r.type ?? '').trim()]))
    : {};
  // ラッコ：keywords.csv の題材語と、volumes.csv の月間検索数
  const readCsv = (p: string) => (fs.existsSync(p) ? parseCsv(fs.readFileSync(p, 'utf8')) : []);
  const topics = new Map<string, string[]>();
  for (const r of readCsv(path.join(dir, 'keywords.csv'))) {
    if ((r.type ?? '').trim() !== TOPIC_TYPE) continue;
    const id = (r.video_id ?? '').trim();
    topics.set(id, [...(topics.get(id) ?? []), normKeyword(r.keyword ?? '')]);
  }
  const volumes: OwnData['volumes'] = {};
  for (const r of readCsv(path.join(dir, 'volumes.csv'))) {
    const k = normKeyword(r.keyword ?? '');
    if (k && r.search_volume) volumes[k] = { searchVolume: Number(r.search_volume), yoy: r.yoy ? Number(r.yoy) : null };
  }
  const byVideo = new Map<string, Partial<Record<ViewerType, StudioRow>>>();
  for (const r of studio?.rows ?? []) {
    const m = byVideo.get(r.videoId) ?? {};
    m[r.viewerType] = r;
    byVideo.set(r.videoId, m);
  }
  const list = videos
    .filter((v) => v.id === o.include || !o.since || v.publishedAt.slice(0, 7) >= o.since)
    .map((video): VideoData => ({
      video,
      analytics: readJson<OwnAnalytics>(path.join(dir, 'own', 'analytics', `${video.id}.json`)),
      studio: byVideo.get(video.id) ?? {},
      transcript: readJson<TranscriptFile>(path.join(dir, 'transcripts', `${video.id}.json`))?.segments ?? null,
      chapters: parseChapters(video.description ?? ''),
      tag: tags[video.id] || null,
      topics: topics.get(video.id) ?? [],
    }));
  return { channel, videos: list, dataThrough: meta?.dataThrough ?? null, studioImportedAt: studio?.importedAt ?? null, volumes, now };
}
