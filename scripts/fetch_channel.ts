#!/usr/bin/env node
// チャンネルの全動画データを YouTube Data API v3 で取得する
// 使い方: node scripts/fetch_channel.ts <@handle | チャンネルURL | UC...>
// 出力: data/<slug>/channel.json, videos.json, videos.csv
// クォータ: 動画N本で おおよそ 1 + ceil(N/50)*2 ユニット（1日10,000ユニット）
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, requireApiKey, yt, quotaUsed, parseChannelArg, isoDurationToSec, toCsv, slug } from './lib.ts';

const arg = process.argv[2];
const target = parseChannelArg(arg);
if (!target) {
  console.error('使い方: node scripts/fetch_channel.ts <@handle | チャンネルURL | UC...>');
  process.exit(1);
}
const key = requireApiKey();

// 1. チャンネル情報
const chParams = { part: 'snippet,statistics,contentDetails,brandingSettings', ...(target.id ? { id: target.id } : { forHandle: target.handle! }) };
const ch = (await yt(key, 'channels', chParams)).items?.[0];
if (!ch) {
  console.error('チャンネルが見つかりません: ' + arg);
  process.exit(1);
}
const uploads = ch.contentDetails.relatedPlaylists.uploads;
const channel = {
  id: ch.id,
  handle: ch.snippet.customUrl,
  title: ch.snippet.title,
  description: ch.snippet.description,
  publishedAt: ch.snippet.publishedAt,
  country: ch.snippet.country,
  subscriberCount: +ch.statistics.subscriberCount || null,
  viewCount: +ch.statistics.viewCount,
  videoCount: +ch.statistics.videoCount,
  keywords: ch.brandingSettings?.channel?.keywords || '',
  fetchedAt: new Date().toISOString(),
};

// 2. 投稿動画のIDを全件
const ids = [];
let pageToken;
do {
  const r = await yt(key, 'playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: 50, ...(pageToken ? { pageToken } : {}) });
  for (const it of r.items) ids.push(it.contentDetails.videoId);
  pageToken = r.nextPageToken;
} while (pageToken);

// 3. 動画の詳細を50件ずつ
const videos = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await yt(key, 'videos', { part: 'snippet,statistics,contentDetails,liveStreamingDetails', id: ids.slice(i, i + 50).join(',') });
  for (const v of r.items) {
    const sec = isoDurationToSec(v.contentDetails.duration);
    videos.push({
      id: v.id,
      url: 'https://www.youtube.com/watch?v=' + v.id,
      publishedAt: v.snippet.publishedAt,
      title: v.snippet.title,
      views: +v.statistics.viewCount || 0,
      likes: +v.statistics.likeCount || null,
      comments: +v.statistics.commentCount || null,
      durationSec: sec,
      // ショートは3分以下の縦型。APIでは縦横が取れないため、尺で近似する
      isShortLikely: sec > 0 && sec <= 180,
      isLive: !!v.liveStreamingDetails,
      tags: v.snippet.tags || [],
      categoryId: v.snippet.categoryId,
      description: v.snippet.description,
    });
  }
}
videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

// 4. 保存
const dir = path.join(ROOT, 'data', slug(channel.handle || channel.id));
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'channel.json'), JSON.stringify(channel, null, 2));
fs.writeFileSync(path.join(dir, 'videos.json'), JSON.stringify(videos, null, 2));
fs.writeFileSync(
  path.join(dir, 'videos.csv'),
  toCsv(
    videos.map((v) => ({ ...v, description: v.description.slice(0, 300) })),
    ['id', 'publishedAt', 'views', 'likes', 'comments', 'durationSec', 'isShortLikely', 'isLive', 'title', 'tags', 'url', 'description'],
  ),
);

console.log(`チャンネル: ${channel.title} (${channel.handle})`);
console.log(`登録者 ${channel.subscriberCount} / 総再生 ${channel.viewCount} / 開設 ${channel.publishedAt.slice(0, 10)}`);
console.log(`動画 ${videos.length} 本を取得 → ${path.relative(ROOT, dir)}/`);
console.log(`使用クォータ: 約 ${quotaUsed()} ユニット`);
