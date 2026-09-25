// 例：田端大学 投資学部（@tabbata）で使った分類ルール。data/<slug>/why/classify.mjs にコピーし、ルールをチャンネルに合わせて書き換えて使う
// @tabbata 直近12か月の通常動画を、タイトルの語で機械的に分類する（上から順に最初に当たった種類）
import fs from 'node:fs';
import { median } from '../../../scripts/lib.mjs';
const v = JSON.parse(fs.readFileSync(new URL('../videos.json', import.meta.url)));
const since = '2025-09-24';
const rules = [
  ['企業取材・社長対談', /社長|潜入取材|直撃|見学|突撃|取材|リアルゲイト|SQUEEZE|チームスピリット/],
  ['ゲスト（著名投資家・有名人）', /片山|テスタ|ちょる子|井村|岐阜|造船太郎|きこ|キャバ嬢|こーくん|マックスむらい|ホリエモン|亀山|コムドット|佐田志歩|投資家とガチ対談|専門家に聞いて|高野|元金融庁|元外交官/],
  ['炎上・告発・ガバナンス', /炎上|告発|質問状|社外取|クソ経営|株主総会|株主提案|上場ゴール|IR|TOB|MBO|闇|差し止め|侮辱罪|名誉毀損|逮捕|書類送検|不起訴|セクハラ/],
  ['企画（株バトル・初心者）', /株バトル|投資対決|ど素人|100万円|クソ株|総決算|vlog|新年|人生相談|爆買い/],
  ['相場・マクロ速報', /急落|暴落|爆上げ|爆アゲ|急反発|突破|緊急|速報|攻撃|停戦|演説|会談|解散|発足|崩壊|指名|利下げ|利上げ|ショック|最高値|バク上げ|円高|円安|夏枯れ|トランプ|高市|イラン|原油/],
  ['用語・概念の解説', /そもそも|とは|なぜ|理由|違い|本質|仕組み|解説|法則|格差|関係/],
];
const L = v.filter((x) => !x.isShortLikely && !x.isLive && x.publishedAt >= since && (Date.now() - Date.parse(x.publishedAt)) / 864e5 >= 7);
const rows = L.map((x) => ({ ...x, cat: (rules.find(([, re]) => re.test(x.title)) || ['その他'])[0] }));
const out = ['video_id,category,views,title'];
for (const r of rows) out.push([r.id, r.cat, r.views, JSON.stringify(r.title)].join(','));
fs.writeFileSync(new URL('./categories.csv', import.meta.url), out.join('\n') + '\n');
const cats = {};
for (const r of rows) (cats[r.cat] ||= []).push(r);
console.log(`対象 ${rows.length} 本（${since}〜、投稿7日未満を除く）。全体中央値 ${median(rows.map((r) => r.views))}`);
for (const [c, a] of Object.entries(cats).sort((x, y) => median(y[1].map((r) => r.views)) - median(x[1].map((r) => r.views)))) {
  const s = [...a].sort((x, y) => y.views - x.views);
  console.log(`\n■ ${c}: ${a.length}本 / 中央値 ${Math.round(median(a.map((r) => r.views)) / 1000)}k / 尺中央値 ${Math.round(median(a.map((r) => r.durationSec)) / 60)}分`);
  for (const r of [...s.slice(0, 3), ...s.slice(-2)]) console.log(`  ${Math.round(r.views / 1000)}k ${r.title.slice(0, 55)}`);
}
