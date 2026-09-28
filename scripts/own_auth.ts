#!/usr/bin/env node
// 自分のチャンネルの YouTube Analytics API を使うための、初回だけのログイン
// 使い方: node scripts/own_auth.ts
// 事前に .env に YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET を書く（README参照）
// ブラウザで承認すると、リフレッシュトークンを .env の YOUTUBE_OAUTH_REFRESH_TOKEN に書き込む（画面には出さない）
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { ROOT } from './lib.ts';
import { requireOAuthClient, TOKEN_URL } from './own/analytics_api.ts';
import { buildAuthUrl, pkcePair, upsertEnvText } from './own/oauth.ts';

let client: { clientId: string; clientSecret: string };
try {
  client = requireOAuthClient();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

const { verifier, challenge } = pkcePair();
const state = randomBytes(16).toString('hex');
const server = http.createServer();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const url = buildAuthUrl({ clientId: client.clientId, redirectUri, challenge, state });

console.log('ブラウザで次のURLを開き、分析したいチャンネルのアカウントで承認してください:\n' + url);
// 自動で開けなくても、上のURLを手で開けばよい
execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], () => {});

let code: string;
try {
  code = await new Promise<string>((resolve, reject) => {
    server.on('request', (req, res) => {
      const u = new URL(req.url ?? '/', redirectUri);
      const err = u.searchParams.get('error');
      const c = u.searchParams.get('code');
      if (!err && !c) {
        res.writeHead(404).end(); // favicon など
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      if (err || !c || u.searchParams.get('state') !== state) {
        res.end('承認できませんでした。ターミナルを確認してください。');
        reject(new Error(`承認できませんでした（${err ?? 'state が一致しません'}）`));
        return;
      }
      res.end('承認しました。このタブは閉じてかまいません。');
      resolve(c);
    });
  });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
} finally {
  server.close();
}

const res = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code, client_id: client.clientId, client_secret: client.clientSecret,
    redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
  }),
});
const json = (await res.json()) as { refresh_token?: string; error?: string };
if (!json.refresh_token) {
  console.error(`リフレッシュトークンを受け取れませんでした（${json.error ?? `HTTP ${res.status}`}）。OAuth クライアントの種類が「デスクトップ アプリ」か確認してください`);
  process.exit(1);
}
const envPath = path.join(ROOT, '.env');
const before = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
fs.writeFileSync(envPath, upsertEnvText(before, 'YOUTUBE_OAUTH_REFRESH_TOKEN', json.refresh_token));
console.log('.env に YOUTUBE_OAUTH_REFRESH_TOKEN を保存しました。次は node scripts/fetch_own_analytics.ts data/<slug>');
