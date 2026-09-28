import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rowsToObjects, SCOPE } from '../../scripts/own/analytics_api.ts';
import { buildAuthUrl, pkcePair, upsertEnvText } from '../../scripts/own/oauth.ts';

test('rowsToObjects: 列名で対応づける。rows がなければ空', () => {
  const res = { columnHeaders: [{ name: 'day' }, { name: 'views' }], rows: [['2026-09-01', 10], ['2026-09-02', 5]] };
  assert.deepEqual(rowsToObjects(res), [{ day: '2026-09-01', views: 10 }, { day: '2026-09-02', views: 5 }]);
  assert.deepEqual(rowsToObjects({ columnHeaders: [{ name: 'day' }] }), []);
});

test('pkcePair: challenge は verifier の SHA-256（base64url）', () => {
  const { verifier, challenge } = pkcePair();
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
});

test('buildAuthUrl: 読み取り専用のスコープ、オフライン、同意、PKCE', () => {
  const u = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:5555', challenge: 'ch', state: 'st' }));
  assert.equal(u.searchParams.get('scope'), SCOPE);
  assert.equal(SCOPE, 'https://www.googleapis.com/auth/yt-analytics.readonly');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:5555');
  assert.equal(u.searchParams.get('state'), 'st');
});

test('upsertEnvText: 末尾に改行がなくても、ほかの行を残して足す', () => {
  assert.equal(upsertEnvText('# コメント\nYOUTUBE_API_KEY=abc', 'YOUTUBE_OAUTH_REFRESH_TOKEN', 'r1'), '# コメント\nYOUTUBE_API_KEY=abc\nYOUTUBE_OAUTH_REFRESH_TOKEN=r1\n');
  assert.equal(upsertEnvText('', 'K', 'v'), 'K=v\n');
});

test('upsertEnvText: 同じキーは1行だけ書き換える。値の $ はそのまま', () => {
  const before = 'A=1\nYOUTUBE_OAUTH_REFRESH_TOKEN=old\nB=2\n';
  assert.equal(upsertEnvText(before, 'YOUTUBE_OAUTH_REFRESH_TOKEN', 'x$1y$&'), 'A=1\nYOUTUBE_OAUTH_REFRESH_TOKEN=x$1y$&\nB=2\n');
  assert.equal(upsertEnvText('XK=1\n', 'K', '2'), 'XK=1\nK=2\n');
});

test('withRetry: 一時的なエラーは待ってやり直す。それ以外と、回数を使い切ったときはそのまま投げる', async () => {
  const { withRetry, TransientError } = await import('../../scripts/own/analytics_api.ts');
  let n = 0;
  assert.equal(await withRetry(async () => { if (++n < 3) throw new TransientError('500'); return 'ok'; }, [0, 0]), 'ok');
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new TransientError('500'); }, [0, 0]), /500/);
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new Error('400'); }, [0, 0]), /400/);
  assert.equal(n, 1);
});
