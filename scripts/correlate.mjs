#!/usr/bin/env node
// 動画の再生数と、題材語の月間検索数（ラッコ）の相関を、題材語の「種類」ごとに出す
// 使い方: node scripts/correlate.mjs data/<slug> [--since YYYY-MM] [--until YYYY-MM]
// 入力:
//   data/<slug>/keywords.csv  … 列: video_id,keyword,type
//       type は題材語の種類（例: 銘柄名 / 用語 / 時事 / 人名 / 制度）。
//       種類が違う語を1つの相関に混ぜると、逆向きの効果が打ち消し合って結論を誤る。
//       type 列がない行は、「◯◯ 株価」なら「銘柄名」、それ以外は「未分類」とみなす
//   data/<slug>/volumes.csv   … 列: keyword,search_volume[,yoy]（rakko_cache.mjs volumes で作る）
// 出力: data/<slug>/correlation.md
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseCsv, spearman, median, fmt } from './lib.mjs';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('使い方: node scripts/correlate.mjs data/<slug> [--since YYYY-MM] [--until YYYY-MM]');
  process.exit(1);
}
const opt = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const since = opt('--since');
const until = opt('--until');
const dir = path.resolve(ROOT, dirArg);
const videos = JSON.parse(fs.readFileSync(path.join(dir, 'videos.json'), 'utf8'));
const byId = Object.fromEntries(videos.map((v) => [v.id, v]));
const kw = parseCsv(fs.readFileSync(path.join(dir, 'keywords.csv'), 'utf8'));
const vol = Object.fromEntries(parseCsv(fs.readFileSync(path.join(dir, 'volumes.csv'), 'utf8')).map((r) => [r.keyword.trim(), r]));

const excludeDays = 7;
const rows = [];
const missing = [];
let untyped = 0;
for (const r of kw) {
  const v = byId[r.video_id?.trim()];
  const k = r.keyword?.trim();
  if (!v || !k) continue;
  const month = v.publishedAt.slice(0, 7);
  if (since && month < since) continue;
  if (until && month > until) continue;
  if ((Date.now() - Date.parse(v.publishedAt)) / 86400000 < excludeDays) continue;
  let type = r.type?.trim();
  if (!type) {
    untyped++;
    type = / 株価$/.test(k) ? '銘柄名' : '未分類';
  }
  const sv = vol[k] ? +vol[k].search_volume : NaN;
  if (!Number.isFinite(sv)) { missing.push(k); continue; }
  rows.push({ title: v.title, views: v.views, publishedAt: v.publishedAt, keyword: k, type, volume: sv });
}
if (rows.length < 5) {
  console.error(`対応づけできた動画が ${rows.length} 本しかありません（5本以上必要）。keywords.csv と volumes.csv を確認してください。`);
  process.exit(1);
}

const months = (a) => {
  const m = a.map((r) => r.publishedAt.slice(0, 7)).sort();
  return `${m[0]}〜${m.at(-1)}`;
};
const spanMonths = (a) => {
  const m = a.map((r) => r.publishedAt.slice(0, 7)).sort();
  const [y1, m1] = m[0].split('-').map(Number);
  const [y2, m2] = m.at(-1).split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};
const corrLine = (a) => {
  if (a.length < 8) return { text: `n=${a.length}（8本未満のため相関は出さない）`, rho: null };
  const { rho, n, p } = spearman(a.map((r) => r.views), a.map((r) => r.volume));
  const ptxt = p == null ? '' : `、p ≈ ${p < 0.0001 ? '<0.0001' : p.toFixed(4)}`;
  return { text: `ρ = **${rho.toFixed(2)}**（n=${n}${ptxt}）`, rho };
};

const types = [...new Set(rows.map((r) => r.type))];
const byType = Object.fromEntries(types.map((t) => [t, rows.filter((r) => r.type === t)]));

const L = [];
const o = (s = '') => L.push(s);
o('# 再生数 × 検索数の相関（題材語の種類ごと）');
o();
o(`- 対象: ${rows.length} 本（投稿${excludeDays}日未満は除外${since || until ? `、期間 ${since || '最初'}〜${until || '最新'}` : ''}）`);
o('- 検索数の出典: ラッコキーワード（Googleの月間検索数。YouTube内の検索数ではない）');
if (untyped) o(`- 注意: ${untyped} 行に type がなく、自動で推定した（「◯◯ 株価」→銘柄名、ほかは未分類）。keywords.csv に type を書くこと`);
if (spanMonths(rows) > 12) o(`- 注意: 期間が ${spanMonths(rows)} か月にまたがる。チャンネルの規模が変わった時期が混ざると、相関がゆがむ。--since で直近12か月程度に絞った結果とも比べること`);
o();
o('## 種類ごとの相関（こちらを主に見る）');
o();
o('| 種類 | 本数 | 相関 | 再生数中央値 | 検索数中央値 | 期間 |');
o('|---|---|---|---|---|---|');
for (const t of types.sort((a, b) => byType[b].length - byType[a].length)) {
  const a = byType[t];
  o(`| ${t} | ${a.length} | ${corrLine(a).text} | ${fmt(median(a.map((r) => r.views)))} | ${fmt(median(a.map((r) => r.volume)))} | ${months(a)} |`);
}
o();
const all = corrLine(rows);
if (types.length > 1) {
  const signs = types.map((t) => corrLine(byType[t]).rho).filter((x) => x != null);
  const mixedSign = signs.some((x) => x > 0.2) && signs.some((x) => x < -0.2);
  o(`全種類をまとめた相関（参考）: ${all.text}`);
  o();
  o('種類が混在しているので、まとめた値だけで結論を出さない。' + (mixedSign ? '**種類によって相関の向きが逆で、まとめた値では打ち消し合っている。**' : ''));
} else {
  o(`相関: ${all.text}`);
}
o();

for (const t of types) {
  const a = byType[t];
  const vols = a.map((r) => r.volume).sort((x, y) => x - y);
  if (a.length < 8) continue;
  const q = (f) => vols[Math.min(vols.length - 1, Math.floor(f * vols.length))];
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const tiers = [[0, cuts[0]], [cuts[0], cuts[1]], [cuts[1], cuts[2]], [cuts[2], Infinity]];
  o(`## ${t}：検索数の区分ごとの再生数`);
  o();
  o('| 検索数の区分 | 本数 | 再生数中央値 |');
  o('|---|---|---|');
  for (const [lo, hi] of tiers) {
    const b = a.filter((r) => r.volume >= lo && r.volume < hi);
    if (b.length) o(`| ${fmt(lo)}〜${hi === Infinity ? '' : fmt(hi)} | ${b.length} | ${fmt(median(b.map((r) => r.views)))} |`);
  }
  o();
}

o('## 明細（種類ごと、検索数の多い順）');
o();
o('| 種類 | 題材語 | 月間検索数 | 再生 | 投稿日 | タイトル |');
o('|---|---|---|---|---|---|');
for (const r of [...rows].sort((a, b) => a.type.localeCompare(b.type) || b.volume - a.volume)) {
  o(`| ${r.type} | ${r.keyword} | ${fmt(r.volume)} | ${fmt(r.views)} | ${r.publishedAt.slice(0, 10)} | ${r.title.slice(0, 50).replace(/\|/g, '｜')} |`);
}
if (missing.length) {
  o();
  o(`検索数が見つからなかった題材語: ${[...new Set(missing)].join('、')}`);
}

const out = path.join(dir, 'correlation.md');
fs.writeFileSync(out, L.join('\n') + '\n');
console.log(types.map((t) => `${t}: ${corrLine(byType[t]).text.replace(/\*/g, '')}`).join(' / ') + ` → ${path.relative(ROOT, out)}`);
