// 自分のチャンネル分析で使う型（data/<slug>/own/ などに保存する形）
import type { Channel, Video } from '../lib.ts';

// Analytics API の creatorContentType
export type ContentType = 'VIDEO_ON_DEMAND' | 'SHORTS' | 'LIVE_STREAM' | 'STORY' | 'UNSPECIFIED';

// 動画の日ごとの数字（dimensions=day）。day は太平洋時間の YYYY-MM-DD
export interface DailyRow {
  day: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
}

// 維持率の曲線の1点。ratio は動画の位置（0.01〜1.00）、watchRatio はその位置で見ている人の割合（1を超えることもある）
export interface RetentionPoint {
  ratio: number;
  watchRatio: number;
  relative: number | null; // relativeRetentionPerformance（同じ長さの動画との比較。0.5が平均）
}

export interface TrafficRow { source: string; views: number; minutes: number; }
export interface TrafficDetailRow { detail: string; views: number; }

// own/analytics/<videoId>.json
export interface OwnAnalytics {
  videoId: string;
  fetchedAt: string;
  dailyThrough: string; // 取得した時点で、どの日までデータがあったか（太平洋時間）
  contentType: ContentType;
  daily: DailyRow[]; // 公開日から最大28日分
  retention: RetentionPoint[] | null; // 再生が少ないと null
  traffic: TrafficRow[];
  trafficDetail: { YT_SEARCH: TrafficDetailRow[]; RELATED_VIDEO: TrafficDetailRow[] };
}

// own/meta.json
export interface OwnMeta { dataThrough: string; fetchedAt: string; }

export type ViewerType = 'all' | 'new' | 'returning';

// own/studio.json の1行。値は Studio の表示のまま（平均視聴率・クリック率は％）
export interface StudioRow {
  videoId: string;
  viewerType: ViewerType;
  views: number | null;
  avgViewDurationSec: number | null;
  avgViewPercentage: number | null;
  impressions: number | null;
  ctr: number | null;
  // 視聴者の人数（フィルタなしの書き出しにだけ入っている）
  newViewers?: number | null;
  returningViewers?: number | null;
  uniqueViewers?: number | null;
}
export interface StudioFile { importedAt: string; rows: StudioRow[]; warnings: string[]; }

// 文字起こしの1行（秒）
export interface Segment { start: number; dur: number; text: string; }
// transcripts/<videoId>.json
export interface TranscriptFile { videoId: string; source: string; lang: string; fetchedAt: string; segments: Segment[]; }

export interface Chapter { start: number; title: string; }

// レポートの入力（load.ts が作る）
export interface VideoData {
  video: Video;
  analytics: OwnAnalytics | null;
  studio: Partial<Record<ViewerType, StudioRow>>;
  transcript: Segment[] | null;
  chapters: Chapter[];
  tag: string | null; // own/tags.csv の型
  topics: string[]; // keywords.csv の題材語
}
export interface OwnData {
  channel: Channel;
  videos: VideoData[];
  dataThrough: string | null;
  studioImportedAt: string | null;
  volumes: Record<string, { searchVolume: number; yoy: number | null }>; // volumes.csv（ラッコの月間検索数）
  now: Date;
}
