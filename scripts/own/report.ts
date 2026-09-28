// 自分のチャンネルの振り返りレポート（Markdown）を作る。数字には出典を付ける
import { fmt, median, spearman } from '../lib.ts';
import { analysisMode, cumulativeAt, markVsMedian, MIN_GROUP_VIDEOS, topBottom, toPtDate, WINDOW_LABEL, WINDOWS, type Cumulative } from './metrics.ts';
import { CHECKPOINTS_SEC, detectDrops, detectRewatches, fitKnee, openingRetention, OPENING_SEC, pointAtSec, retentionAt, type Drop, type Knee, type Rise } from './retention.ts';
import { chapterAt, fmtSec, linesAround } from './transcript.ts';
import { normKeyword } from './keywords.ts';
import type { ContentType, OwnData, VideoData, ViewerType } from './types.ts';

export const CONTENT_ORDER: ContentType[] = ['VIDEO_ON_DEMAND', 'SHORTS', 'LIVE_STREAM', 'STORY', 'UNSPECIFIED'];
export const CONTENT_LABEL: Record<ContentType, string> = {
  VIDEO_ON_DEMAND: '通常動画', SHORTS: 'ショート', LIVE_STREAM: 'ライブ', STORY: 'ストーリー', UNSPECIFIED: '種類不明',
};
export const TRAFFIC_LABEL: Record<string, string> = {
  BROWSE: 'ブラウジング機能', RELATED_VIDEO: '関連動画', YT_SEARCH: 'YouTube検索', SUBSCRIBER: 'ブラウジング機能', EXT_URL: '外部',
  NO_LINK_OTHER: '直接・不明', NO_LINK_EMBEDDED: '埋め込み', PLAYLIST: '再生リスト', SHORTS: 'ショートフィード', NOTIFICATION: '通知',
  YT_CHANNEL: 'チャンネルページ', YT_OTHER_PAGE: 'その他のYouTube', END_SCREEN: '終了画面', HASHTAGS: 'ハッシュタグ', ADVERTISING: '広告',
  PROMOTED: 'プロモーション', ANNOTATION: 'カード', CAMPAIGN_CARD: 'キャンペーンカード', LIVE_REDIRECT: 'ライブのリダイレクト',
  PRODUCT_PAGE: '商品ページ', SOUND_PAGE: 'サウンドページ', VIDEO_REMIXES: 'リミックス', WATCH_WITH: '一緒に視聴',
};
const trafficLabel = (s: string) => TRAFFIC_LABEL[s] ?? s;

export interface VideoMetrics {
  d: VideoData;
  type: ContentType;
  typeSource: 'API' | '推定';
  ageDays: number;
  windows: Record<number, Cumulative | null>;
  hasCurve: boolean;
  opening: number | null;
  checkpoints: Record<number, number | null>; // CHECKPOINTS_SEC の各時点の維持率（0〜1）
  knee: Knee | null; // 落ち着いた時点（区分線形回帰）
  drops: Drop[]; // ふだんの落ち方より急な所
  rises: Rise[];
  newShare: number | null; // 新しい視聴者の割合（0〜1）。人数があれば人数、なければ再生数から
  newShareBasis: '視聴者' | '再生' | null;
}

// Analytics API の種類があればそれ、なければ尺と配信の有無から推定
export function contentTypeOf(d: VideoData): { type: ContentType; source: 'API' | '推定' } {
  const t = d.analytics?.contentType;
  if (t && t !== 'UNSPECIFIED') return { type: t, source: 'API' };
  return { type: d.video.isLive ? 'LIVE_STREAM' : d.video.isShortLikely ? 'SHORTS' : 'VIDEO_ON_DEMAND', source: '推定' };
}

export function buildMetrics(d: VideoData, dataThrough: string | null, now: Date): VideoMetrics {
  const { type, source } = contentTypeOf(d);
  const pub = toPtDate(d.video.publishedAt);
  // 動画ごとの取得日（dailyThrough）がチャンネル全体の dataThrough より古いことがある（--video で別の動画だけ取り直したときなど）。
  // その動画のデータは dailyThrough までしかないので、早いほうの日で「未到達」を判定する
  const through = d.analytics && dataThrough ? (d.analytics.dailyThrough < dataThrough ? d.analytics.dailyThrough : dataThrough) : null;
  const windows: Record<number, Cumulative | null> = {};
  for (const w of WINDOWS) windows[w] = d.analytics && through ? cumulativeAt(d.analytics.daily, pub, w, d.video.durationSec, through) : null;
  const ret = d.analytics?.retention ?? null;
  // フィルタなしの書き出しに視聴者の人数があればそれを使い、なければ new/returning の書き出しの再生数を使う
  const a = d.studio.all;
  const byViewers = a?.newViewers != null && a.returningViewers != null && a.newViewers + a.returningViewers > 0;
  const nv = d.studio.new?.views, rv = d.studio.returning?.views;
  const byViews = nv != null && rv != null && nv + rv > 0;
  return {
    d, type, typeSource: source, windows,
    ageDays: Math.floor((now.getTime() - Date.parse(d.video.publishedAt)) / 86400000),
    hasCurve: ret != null,
    opening: ret ? openingRetention(ret, d.video.durationSec) : null,
    checkpoints: Object.fromEntries(CHECKPOINTS_SEC.map((sec) => [sec, ret ? retentionAt(ret, d.video.durationSec, sec) : null])),
    knee: ret ? fitKnee(ret, d.video.durationSec) : null,
    drops: ret ? detectDrops(ret, d.video.durationSec) : [],
    rises: ret ? detectRewatches(ret, d.video.durationSec) : [],
    newShare: byViewers ? a.newViewers! / (a.newViewers! + a.returningViewers!) : byViews ? nv! / (nv! + rv!) : null,
    newShareBasis: byViewers ? '視聴者' : byViews ? '再生' : null,
  };
}

// 表示
const pctRatio = (x: number | null | undefined) => (x == null ? '-' : `${(x * 100).toFixed(0)}%`); // 0〜1 の割合
const pctValue = (x: number | null | undefined) => (x == null ? '-' : `${x.toFixed(1)}%`); // すでに％の値
const secText = (x: number | null | undefined) => (x == null ? '-' : fmtSec(x));
const esc = (s: string) => s.replace(/\|/g, '｜');
function withMark(text: string, value: number | null | undefined, med: number | null): string {
  const m = markVsMedian(value ?? null, med);
  return m ? `${text} ${m}` : text;
}
const fmtDrop = (x: Drop) => `${fmtSec(x.atSec)}（${pctRatio(x.from)}→${pctRatio(x.to)}、${x.deltaPt.toFixed(0)}pt、ふだんより${x.excessPt.toFixed(0)}pt、z=${x.z.toFixed(1)}）`;
const fmtRise = (x: Rise) => `${fmtSec(x.atSec)}（+${x.risePt.toFixed(0)}pt、ふだんより+${x.excessPt.toFixed(0)}pt、z=${x.z.toFixed(1)}）`;
const fmtKnee = (k: Knee | null) => (k ? `${fmtSec(k.atSec)}（${k.level.toFixed(0)}%。それまで ${k.slopeBeforePerMin.toFixed(1)}pt/分、以降 ${k.slopeAfterPerMin.toFixed(1)}pt/分）` : '-');

// 指標
type Metric = (m: VideoMetrics) => number | null;
const views7: Metric = (m) => m.windows[7]?.views ?? null;
// 動画どうしの比較はエンゲージビューで行う。視聴回数は、ホームの自動再生などを数えるようになった時期（2026-08-27ごろ）の前後で比べられない
const engaged7: Metric = (m) => m.windows[7]?.engagedViews ?? null;
const avgPct7: Metric = (m) => m.windows[7]?.avgViewPercentage ?? null;
const ctr: Metric = (m) => m.d.studio.all?.ctr ?? null;
const pctOf = (vt: ViewerType): Metric => (m) => m.d.studio[vt]?.avgViewPercentage ?? null;
const newPct = pctOf('new'), retPct = pctOf('returning');
const medOf = (ms: VideoMetrics[], f: Metric) => median(ms.map(f));

// API の SUBSCRIBER は Studio の「ブラウジング機能」（ホーム・登録チャンネルのフィード）にあたる。BROWSE と合わせて数える
const BROWSE_SOURCES = ['BROWSE', 'SUBSCRIBER'];

export function trafficShare(m: VideoMetrics, source: string | string[]): number | null {
  const t = m.d.analytics?.traffic ?? [];
  const total = t.reduce((s, x) => s + x.views, 0);
  if (!total) return null;
  const want = Array.isArray(source) ? source : [source];
  return t.filter((x) => want.includes(x.source)).reduce((s, x) => s + x.views, 0) / total;
}
function topTraffic(m: VideoMetrics, n = 2): string {
  const t = m.d.analytics?.traffic ?? [];
  const total = t.reduce((s, x) => s + x.views, 0);
  return total ? t.slice(0, n).map((x) => `${trafficLabel(x.source)} ${pctRatio(x.views / total)}`).join('、') : '-';
}
function retentionSummary(m: VideoMetrics): string {
  if (!m.hasCurve) return '曲線なし（再生が少ない、または未取得）';
  const parts = [`落ち着いた時点 ${fmtKnee(m.knee)}`];
  parts.push(m.drops.length ? '急な離脱: ' + m.drops.map(fmtDrop).join('、') : '急な離脱: なし');
  if (m.rises.length) parts.push('見返し: ' + m.rises.map(fmtRise).join('、'));
  return parts.join('／');
}
const byNewest = (a: VideoMetrics, b: VideoMetrics) => b.d.video.publishedAt.localeCompare(a.d.video.publishedAt);

const BASELINE_NOTE = '5点';

// f と7日のエンゲージビューのスピアマン順位相関。両方の値がある動画が MIN_GROUP_VIDEOS 本未満、または値がすべて同じなら出さない
function rankCorr(ms: VideoMetrics[], f: Metric): { rho: number | null; p: number | null; n: number } {
  const pairs = ms.map((m) => [f(m), engaged7(m)] as const).filter((x): x is readonly [number, number] => x[0] != null && x[1] != null);
  if (pairs.length < MIN_GROUP_VIDEOS) return { rho: null, p: null, n: pairs.length };
  const r = spearman(pairs.map((x) => x[0]), pairs.map((x) => x[1]));
  return Number.isFinite(r.rho) ? { rho: r.rho, p: r.p, n: r.n } : { rho: null, p: null, n: r.n };
}

function header(p: (s?: string) => void, data: OwnData): void {
  p(`- 作成: ${data.now.toISOString()}`);
  p(`- データの範囲: Analytics API は ${data.dataThrough ?? '-'} まで（米国太平洋時間）／Studio の CSV は ${data.studioImportedAt ?? '-'} に取り込み`);
  p('- 出典: [Studio]=YouTube Studio の CSV（公開からの通算）、[API]=YouTube Analytics API、[文字起こし]=youtube-transcript-plus または字幕ファイル');
  p('- 「48時間」は公開日（太平洋時間）を含む2日間。再生数は YouTube の「視聴回数」（ホームの自動再生なども数える）。平均視聴時間・平均視聴率はエンゲージビュー1回あたり（[API] は日ごとの値から計算）');
  if (!data.dataThrough) p('- ⚠ Analytics API のデータがありません（node scripts/fetch_own_analytics.ts data/<slug>）');
  if (!data.studioImportedAt) p('- ⚠ Studio の CSV を取り込んでいません（node scripts/import_studio.ts data/<slug>）。新規／リピーターとクリック率は空欄です');
}

type Volumes = OwnData['volumes'];
const yoyText = (y: number | null | undefined) => (y == null ? '-' : `${y >= 0 ? '+' : ''}${Math.round(y * 100)}%`);
// 題材語の月間検索数（複数あればいちばん大きいもの）
const topicMax = (m: VideoMetrics, volumes: Volumes): number | null => (m.d.topics.map((t) => volumes[t]?.searchVolume).filter((x): x is number => x != null).sort((a, b) => b - a)[0] ?? null);

function renderTypeSection(p: (s?: string) => void, type: ContentType, ms: VideoMetrics[], volumes: Volumes): void {
  const mature = ms.filter((m) => m.windows[7] != null);
  const mode = analysisMode(mature.length);
  const sorted = [...ms].sort(byNewest);
  p(`## ${CONTENT_LABEL[type]}（${ms.length}本）`);
  p();
  p(`- 公開7日のデータがある動画: ${mature.length}本 → ${mode === 'group' ? '上位・下位の比較と型ごとのまとめを出します' : `${MIN_GROUP_VIDEOS}本未満のため、1本ずつの比較が中心です`}`);
  if (ms.some((m) => m.typeSource === '推定')) p('- 種類の一部は、尺と配信の有無からの推定です（Analytics API のデータがない動画）');
  p();

  const sumOf = (f: (m: VideoMetrics) => number | null | undefined) => ms.reduce((s, m) => s + (f(m) ?? 0), 0);
  const viewersNew = sumOf((m) => m.d.studio.all?.newViewers), viewersRet = sumOf((m) => m.d.studio.all?.returningViewers);
  const viewsNew = sumOf((m) => m.d.studio.new?.views), viewsRet = sumOf((m) => m.d.studio.returning?.views);
  p('### 全体');
  p();
  if (viewersNew + viewersRet > 0) p(`- 視聴者のうち新しい視聴者の割合 [Studio]: ${pctRatio(viewersNew / (viewersNew + viewersRet))}（動画ごとの人数の合計。同じ人が複数の動画を見ると重複する）`);
  else p(`- 再生のうち新しい視聴者の割合 [Studio]: ${viewsNew + viewsRet > 0 ? pctRatio(viewsNew / (viewsNew + viewsRet)) : '-'}`);
  p(`- 平均視聴率の中央値 [Studio]: 新しい視聴者 ${pctValue(medOf(ms, newPct))}／リピーター ${pctValue(medOf(ms, retPct))}`);
  p(`- クリック率の中央値 [Studio]: ${pctValue(medOf(ms, ctr))}`);
  p(`- 7日のエンゲージビューの中央値 [API]: ${fmt(medOf(mature, engaged7))}`);
  p();

  const med = {
    v7: medOf(mature, engaged7), a7: medOf(mature, avgPct7), ns: medOf(ms, (m) => m.newShare),
    np: medOf(ms, newPct), rp: medOf(ms, retPct), ctr: medOf(ms, ctr), op: medOf(ms, (m) => m.opening),
  };
  p('### 動画ごと');
  p();
  p('↑↓ は、この種類の中央値より5%を超えて高い／低い。数は公開7日時点のエンゲージビューで比べる（通算の数は公開時期で大きさが変わる。視聴回数は、自動再生などを数えるようになった時期の前後で比べられない）');
  p();
  p(`| 公開 | タイトル | 日数 | 尺 | 7日のエンゲージビュー [API] | 7日の視聴回数 [API] | 7日の平均視聴率 [API] | 新規の割合 [Studio] | 平均視聴率 新規／リピーター [Studio] | クリック率 [Studio] | 冒頭${OPENING_SEC}秒 [API] | 流入元の上位 [API] |`);
  p('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|');
  for (const m of sorted) {
    const w7 = m.windows[7];
    p(`| ${m.d.video.publishedAt.slice(0, 10)} | ${esc(m.d.video.title)} | ${m.ageDays} | ${fmtSec(m.d.video.durationSec)} | ${w7 ? withMark(fmt(w7.engagedViews), w7.engagedViews, med.v7) : '未到達'} | ${w7 ? fmt(w7.views) : '未到達'} | ${w7 ? withMark(pctValue(w7.avgViewPercentage), w7.avgViewPercentage, med.a7) : '未到達'} | ${withMark(pctRatio(m.newShare), m.newShare, med.ns)} | ${withMark(pctValue(newPct(m)), newPct(m), med.np)}／${withMark(pctValue(retPct(m)), retPct(m), med.rp)} | ${withMark(pctValue(ctr(m)), ctr(m), med.ctr)} | ${withMark(pctRatio(m.opening), m.opening, med.op)} | ${topTraffic(m)} |`);
  }
  p();
  if (ms.some((m) => m.d.topics.length)) {
    p('### 題材と検索需要 [ラッコ]');
    p();
    p('題材語（keywords.csv の「題材語」）の Google の月間検索数（ラッコ）。その題材への関心の大きさの目安で、検索から人が来た数ではない');
    p();
    p('| タイトル | 題材語（月間検索数） | 前年比 | 7日のエンゲージビュー [API] | YouTube検索の割合 [API] |');
    p('|---|---|--:|--:|--:|');
    for (const m of sorted) {
      if (!m.d.topics.length) continue;
      const top = [...m.d.topics].sort((a, b) => (volumes[b]?.searchVolume ?? -1) - (volumes[a]?.searchVolume ?? -1))[0];
      p(`| ${esc(m.d.video.title)} | ${m.d.topics.map((t) => `${esc(t)}（${volumes[t] ? fmt(volumes[t].searchVolume) : '未取得'}）`).join('、')} | ${yoyText(volumes[top]?.yoy)} | ${m.windows[7] ? fmt(m.windows[7].engagedViews) : '未到達'} | ${pctRatio(trafficShare(m, 'YT_SEARCH'))} |`);
    }
    p();
  }

  p('### 維持率の形 [API]');
  p();
  p('決まった時点の維持率と、折れ線の当てはめ（区分線形回帰）で求めた「落ち着いた時点」。↑↓ は中央値との比較');
  p();
  p(`| タイトル | ${CHECKPOINTS_SEC.map(fmtSec).join(' | ')} | 落ち着いた時点 | その時点の維持率 | 以降の落ち方（pt/分） |`);
  p(`|---|${CHECKPOINTS_SEC.map(() => '--:').join('|')}|--:|--:|--:|`);
  const cpMed = Object.fromEntries(CHECKPOINTS_SEC.map((sec) => [sec, medOf(ms, (m) => m.checkpoints[sec])]));
  const levelMed = medOf(ms, (m) => m.knee?.level ?? null);
  for (const m of sorted) {
    const k = m.knee;
    p(`| ${esc(m.d.video.title)} | ${CHECKPOINTS_SEC.map((sec) => withMark(pctRatio(m.checkpoints[sec]), m.checkpoints[sec], cpMed[sec])).join(' | ')} | ${k ? fmtSec(k.atSec) : '-'} | ${k ? withMark(`${k.level.toFixed(0)}%`, k.level, levelMed) : '-'} | ${k ? k.slopeAfterPerMin.toFixed(2) : '-'} |`);
  }
  p();
  p('### 急な離脱と見返し [API]');
  p();
  p(`その動画のふだんの落ち方（前後${BASELINE_NOTE}の中央値）と比べ、ロバストZスコアが ±3.5 を超えた所`);
  p();
  for (const m of sorted) p(`- **${esc(m.d.video.title)}**: ${retentionSummary(m)}`);
  p();

  if (mode !== 'group') {
    p(`- 順位相関は、公開7日のデータがある動画が${MIN_GROUP_VIDEOS}本以上になったら出します（今は${mature.length}本）`);
    p();
    return;
  }
  const { top, bottom } = topBottom(mature, engaged7, mode);
  p(`### 上位・下位の比較（7日のエンゲージビューで上位${top.length}本・下位${bottom.length}本、各列は中央値）`);
  p();
  p('| 指標 | 上位 | 下位 |');
  p('|---|--:|--:|');
  const rows: [string, Metric, (x: number | null) => string][] = [
    ['7日のエンゲージビュー [API]', engaged7, fmt],
    ['7日の視聴回数 [API]', views7, fmt],
    ['7日の平均視聴率 [API]', avgPct7, pctValue],
    ['新規の割合 [Studio]', (m) => m.newShare, pctRatio],
    ['新規の平均視聴率 [Studio]', newPct, pctValue],
    ['クリック率 [Studio]', ctr, pctValue],
    ...CHECKPOINTS_SEC.map((sec): [string, Metric, (x: number | null) => string] => [`${fmtSec(sec)}の維持率 [API]`, (m) => m.checkpoints[sec], pctRatio]),
    ['落ち着いた時点の維持率 [API]', (m) => m.knee?.level ?? null, (x) => (x == null ? '-' : `${x.toFixed(0)}%`)],
    ['落ち着いた後の落ち方（pt/分）[API]', (m) => m.knee?.slopeAfterPerMin ?? null, (x) => (x == null ? '-' : x.toFixed(2))],
    ['ブラウジング機能の割合 [API]', (m) => trafficShare(m, BROWSE_SOURCES), pctRatio],
    ['関連動画の割合 [API]', (m) => trafficShare(m, 'RELATED_VIDEO'), pctRatio],
    ['YouTube検索の割合 [API]', (m) => trafficShare(m, 'YT_SEARCH'), pctRatio],
    ['題材の月間検索数（最大）[ラッコ]', (m) => topicMax(m, volumes), fmt],
  ];
  for (const [label, f, show] of rows) p(`| ${label} | ${show(medOf(top, f))} | ${show(medOf(bottom, f))} |`);
  p();

  p('### 順位相関（7日のエンゲージビューとの関係、スピアマン）');
  p();
  p('本数が少ないうちは、p<0.05 でも偶然のことがある。仮説の候補として読み、パートCで確かめる');
  p();
  p('| 指標 | ρ | p | n |');
  p('|---|--:|--:|--:|');
  for (const [label, f] of rows.slice(2)) { // エンゲージビューと視聴回数そのものは除く
    const c = rankCorr(mature, f);
    p(`| ${label} | ${c.rho == null ? '-' : c.rho.toFixed(2)} | ${c.p == null ? '-' : c.p.toFixed(3)} | ${c.n} |`);
  }
  p();

  const groups = new Map<string, VideoMetrics[]>();
  for (const m of ms) if (m.d.tag) groups.set(m.d.tag, [...(groups.get(m.d.tag) ?? []), m]);
  const shown = [...groups].filter(([, g]) => g.length >= 2);
  if (!shown.length) return;
  p('### 型ごと（own/tags.csv、2本以上の型）');
  p();
  p('| 型 | 本数 | 7日のエンゲージビュー 中央値 [API] | 新規の平均視聴率 中央値 [Studio] | クリック率 中央値 [Studio] |');
  p('|---|--:|--:|--:|--:|');
  for (const [tag, g] of shown) p(`| ${esc(tag)} | ${g.length} | ${fmt(medOf(g, engaged7))} | ${pctValue(medOf(g, newPct))} | ${pctValue(medOf(g, ctr))} |`);
  p();
}

export function renderChannelReport(data: OwnData): string {
  const L: string[] = [];
  const p = (s = '') => { L.push(s); };
  const all = data.videos.map((d) => buildMetrics(d, data.dataThrough, data.now));
  p(`# ${data.channel.title} 自分のチャンネルの振り返り`);
  p();
  header(p, data);
  p();
  for (const type of CONTENT_ORDER) {
    const ms = all.filter((m) => m.type === type);
    if (ms.length) renderTypeSection(p, type, ms, data.volumes);
  }
  return L.join('\n') + '\n';
}

export function renderVideoReport(data: OwnData, videoId: string): string {
  const all = data.videos.map((d) => buildMetrics(d, data.dataThrough, data.now));
  const m = all.find((x) => x.d.video.id === videoId);
  if (!m) throw new Error(`動画 ${videoId} が対象の動画にありません（videos.json と --since を確認してください）`);
  const peers = all.filter((x) => x.type === m.type && x.d.video.id !== videoId);
  const v = m.d.video;
  const L: string[] = [];
  const p = (s = '') => { L.push(s); };
  const context = (sec: number) => {
    const c = chapterAt(m.d.chapters, sec);
    return c ? `｜チャプター「${c.title}」` : '';
  };
  const quote = (sec: number) => {
    for (const s of linesAround(m.d.transcript ?? [], sec)) p(`  > ${fmtSec(s.start)} ${s.text}`);
  };

  p(`# ${v.title} の振り返り`);
  p();
  p(`- 公開: ${v.publishedAt.slice(0, 10)}（公開から${m.ageDays}日）／尺 ${fmtSec(v.durationSec)}／種類 ${CONTENT_LABEL[m.type]}${m.typeSource === '推定' ? '（尺と配信の有無からの推定）' : ' [API]'}`);
  p(`- ${v.url}`);
  p(`- 比べる相手: 同じ種類の他の動画 ${peers.length} 本の中央値`);
  header(p, data);
  p();

  p('## 公開後の推移 [API]');
  p();
  if (!m.d.analytics || !data.dataThrough) {
    p(`Analytics API のデータがありません（node scripts/fetch_own_analytics.ts data/<slug> --video ${v.id}）`);
  } else {
    p('| 時点 | エンゲージビュー | 視聴回数 | 平均視聴時間 | 平均視聴率 | 登録者の増加 | 他の動画の中央値（エンゲージビュー／平均視聴率） |');
    p('|---|--:|--:|--:|--:|--:|--:|');
    for (const w of WINDOWS) {
      const c = m.windows[w];
      const pv = medOf(peers, (x) => x.windows[w]?.engagedViews ?? null);
      const pa = medOf(peers, (x) => x.windows[w]?.avgViewPercentage ?? null);
      p(c
        ? `| ${WINDOW_LABEL[w]} | ${withMark(fmt(c.engagedViews), c.engagedViews, pv)} | ${fmt(c.views)} | ${secText(c.avgViewDurationSec)} | ${withMark(pctValue(c.avgViewPercentage), c.avgViewPercentage, pa)} | ${c.subscribersGained} | ${fmt(pv)}／${pctValue(pa)} |`
        : `| ${WINDOW_LABEL[w]} | 未到達 | | | | | ${fmt(pv)}／${pctValue(pa)} |`);
    }
  }
  p();

  p('## 新しい視聴者とリピーター [Studio]（公開からの通算）');
  p();
  if (!Object.keys(m.d.studio).length) {
    p('Studio の CSV がありません（node scripts/import_studio.ts data/<slug>）');
  } else {
    p('| | 再生数 | 平均視聴時間 | 平均視聴率（中央値） |');
    p('|---|--:|--:|--:|');
    for (const [vt, label] of [['new', '新しい視聴者'], ['returning', 'リピーター'], ['all', '全体']] as const) {
      const r = m.d.studio[vt];
      if (!r) continue;
      const med = medOf(peers, pctOf(vt));
      p(`| ${label} | ${fmt(r.views)} | ${secText(r.avgViewDurationSec)} | ${withMark(pctValue(r.avgViewPercentage), r.avgViewPercentage, med)}（${pctValue(med)}） |`);
    }
    const a = m.d.studio.all;
    if (a) p(`- インプレッション ${fmt(a.impressions)}／クリック率 ${withMark(pctValue(a.ctr), a.ctr, medOf(peers, ctr))}（中央値 ${pctValue(medOf(peers, ctr))}）`);
    if (a?.newViewers != null && a.returningViewers != null) p(`- 視聴者: 新しい視聴者 ${fmt(a.newViewers)}人／リピーター ${fmt(a.returningViewers)}人${a.uniqueViewers != null ? `（ユニーク視聴者 ${fmt(a.uniqueViewers)}人）` : ''}`);
    if (m.newShare != null) p(`- ${m.newShareBasis}のうち新しい視聴者の割合: ${pctRatio(m.newShare)}（中央値 ${pctRatio(medOf(peers, (x) => x.newShare))}）`);
  }
  p();

  p('## 流入元 [API]');
  p();
  const traffic = m.d.analytics?.traffic ?? [];
  const total = traffic.reduce((s, x) => s + x.views, 0);
  if (!total) {
    p('データがありません');
  } else {
    p('| 流入元 | 再生数 | 割合 |');
    p('|---|--:|--:|');
    for (const t of traffic) p(`| ${trafficLabel(t.source)} | ${fmt(t.views)} | ${pctRatio(t.views / total)} |`);
    const search = m.d.analytics?.trafficDetail.YT_SEARCH ?? [];
    const related = m.d.analytics?.trafficDetail.RELATED_VIDEO ?? [];
    if (related.length) p(`- 関連動画として出た先（上位）: ${related.slice(0, 5).map((x) => `https://youtu.be/${x.detail}（${fmt(x.views)}）`).join('、')}`);
  }
  p();

  p('## 検索語と検索需要');
  p();
  p('- 月間検索数・前年比は、ラッコの Google の月間検索数（YouTube内の検索数ではない）。検索から人が来た数ではなく、その語への関心の大きさの目安');
  const topicText = (t: string) => (data.volumes[t] ? `${esc(t)}（月間 ${fmt(data.volumes[t].searchVolume)}、前年比 ${yoyText(data.volumes[t].yoy)}）` : `${esc(t)}（検索数は未取得）`);
  if (m.d.topics.length) p(`- 題材語: ${m.d.topics.map(topicText).join('、')}`);
  else p('- 題材語: なし（keywords.csv に種類「題材語」の行を足すと出ます）');
  p();
  const searchTerms = m.d.analytics?.trafficDetail.YT_SEARCH ?? [];
  if (!searchTerms.length) {
    p('YouTube検索からの再生はありません');
  } else {
    p('| YouTube検索語 | YouTube検索からの再生 [API] | 月間検索数 [ラッコ] | 前年比 [ラッコ] |');
    p('|---|--:|--:|--:|');
    for (const x of searchTerms.slice(0, 15)) {
      const vol = data.volumes[normKeyword(x.detail)];
      p(`| ${esc(x.detail)} | ${fmt(x.views)} | ${vol ? fmt(vol.searchVolume) : '未取得'} | ${vol ? yoyText(vol.yoy) : '-'} |`);
    }
  }
  p();

  p('## 維持率 [API]');
  p();
  const ret = m.d.analytics?.retention ?? null;
  if (!ret) {
    p('曲線がありません（再生が少ないか、未取得）');
  } else {
    p('| 時点 | 維持率 | 他の動画の中央値 | 同じ長さの動画との比較（YouTube算出、0.5が平均） |');
    p('|---|--:|--:|--:|');
    for (const sec of CHECKPOINTS_SEC) {
      const val = m.checkpoints[sec];
      if (val == null) continue;
      const rel = pointAtSec(ret, v.durationSec, sec)?.relative ?? null;
      const med = medOf(peers, (x) => x.checkpoints[sec]);
      p(`| ${fmtSec(sec)} | ${withMark(pctRatio(val), val, med)} | ${pctRatio(med)} | ${rel == null ? '-' : rel.toFixed(2)} |`);
    }
    p();
    p(`- 落ち着いた時点（折れ線の当てはめ）: ${fmtKnee(m.knee)}`);
    const pk = medOf(peers, (x) => x.knee?.level ?? null);
    if (m.knee && pk != null) p(`  - 他の動画の中央値: 落ち着いた時点の維持率 ${pk.toFixed(0)}%、以降 ${(medOf(peers, (x) => x.knee?.slopeAfterPerMin ?? null) ?? 0).toFixed(1)}pt/分`);
    p();
    p('### 急な離脱（ふだんの落ち方より急な所。ロバストZスコア）');
    p();
    if (!m.drops.length) p('目立つ所はありません');
    else for (const x of m.drops) { p(`- **${fmtDrop(x)}**${context(x.atSec)}`); quote(x.atSec); }
    p();
    p('### 見返された場所（ふだんより上がった所）');
    p();
    if (!m.rises.length) p('目立つ所はありません');
    else for (const x of m.rises) { p(`- **${fmtRise(x)}**${context(x.atSec)}`); quote(x.atSec); }
  }
  p();

  p(`## 冒頭${OPENING_SEC}秒の発言 [文字起こし]`);
  p();
  if (!m.d.transcript) p(`文字起こしがありません（node scripts/fetch_transcript.ts data/<slug> --video ${v.id}。取れない場合は transcripts/${v.id}.srt を置く）`);
  else p('> ' + m.d.transcript.filter((s) => s.start < OPENING_SEC).map((s) => s.text).join(' '));
  return L.join('\n') + '\n';
}
