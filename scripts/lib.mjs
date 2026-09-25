// 共通ユーティリティ（依存パッケージなし / Node 18+）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env を読み込む（既に環境変数があればそちらを優先）
export function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

export function requireApiKey() {
  loadEnv();
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.error('YOUTUBE_API_KEY が見つかりません。.env に YOUTUBE_API_KEY=... を書いてください（README参照）。');
    process.exit(1);
  }
  return key;
}

// YouTube Data API v3 呼び出し。キーはURLではなくヘッダーで渡す
let unitsUsed = 0;
const UNIT_COST = { search: 100 };
export async function yt(key, endpoint, params) {
  const url = 'https://www.googleapis.com/youtube/v3/' + endpoint + '?' + new URLSearchParams(params);
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': key } });
  const json = await res.json();
  unitsUsed += UNIT_COST[endpoint] ?? 1;
  if (!res.ok || json.error) {
    const msg = json.error?.message || res.statusText;
    throw new Error(`YouTube API エラー (${endpoint}, HTTP ${res.status}): ${msg}`);
  }
  return json;
}
export const quotaUsed = () => unitsUsed;

// "@handle" / URL / チャンネルID(UC...) を受け付ける
export function parseChannelArg(arg) {
  if (!arg) return null;
  const s = arg.trim();
  const idMatch = s.match(/(UC[0-9A-Za-z_-]{22})/);
  if (idMatch) return { id: idMatch[1] };
  const h = s.match(/@([^/?#\s]+)/);
  if (h) return { handle: '@' + decodeURIComponent(h[1]) };
  return { handle: s.startsWith('@') ? s : '@' + s };
}

// ISO 8601 の再生時間 (PT1H2M3S) を秒に
export function isoDurationToSec(d) {
  const m = (d || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}

export const median = (a) => {
  const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export const fmt = (n) => (n == null ? '-' : n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n).toLocaleString('ja-JP'));

export function toCsv(rows, cols) {
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join('|') : v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

// 簡易CSVパーサ（ダブルクォート対応）
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((x) => x !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

// スピアマン順位相関（同順位は平均順位）
export function spearman(x, y) {
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x), ry = rank(y), n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  const rho = num / Math.sqrt(dx * dy);
  // t近似による両側p値（n>=10目安）
  const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
  const p = n > 3 ? 2 * (1 - studentTCdf(Math.abs(t), n - 2)) : null;
  return { rho, n, p };
}

function studentTCdf(t, df) {
  // 正則化不完全ベータ関数で t分布CDF
  const x = df / (df + t * t);
  return 1 - 0.5 * incBeta(x, df / 2, 0.5);
}
function incBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta);
  if (x < (a + 1) / (a + b + 2)) return (front * cf(x, a, b)) / a;
  return 1 - (front * cf(1 - x, b, a)) / b;
}
function cf(x, a, b) {
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d);
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d);
    c = 1 + aa / c; c = Math.abs(c) < 1e-30 ? 1e-30 : c;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d);
    c = 1 + aa / c; c = Math.abs(c) < 1e-30 ? 1e-30 : c;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function lgamma(z) {
  const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function slug(s) {
  return String(s).replace(/^@/, '').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'channel';
}
