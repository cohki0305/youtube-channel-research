// 初回ログイン（own_auth.ts）で使う、テストできる部分
import { createHash, randomBytes } from 'node:crypto';
import { AUTH_URL, SCOPE } from './analytics_api.ts';

// PKCE（S256）
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function buildAuthUrl(o: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  return AUTH_URL + '?' + new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // リフレッシュトークンを受け取る
    prompt: 'consent', // 2回目以降もリフレッシュトークンを受け取る
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
    state: o.state,
  });
}

// .env の KEY= の行だけを書き換える（なければ末尾に足す）。ほかの行はそのまま
export function upsertEnvText(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, () => line); // 値の $ を置換の記号として扱わない
  const base = text === '' || text.endsWith('\n') ? text : text + '\n';
  return base + line + '\n';
}
