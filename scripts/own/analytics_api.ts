// YouTube Analytics API（自分のチャンネル）の呼び出し。トークンは画面にもエラーにも出さない
import { loadEnv } from '../lib.ts';

export const SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REPORTS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';

// 認証の問題。どの動画でも同じ結果になるので、呼び出し側は止める
export class AuthError extends Error {}

export type ApiRow = Record<string, string | number>;
export interface ReportResponse {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
}

export function rowsToObjects(res: ReportResponse): ApiRow[] {
  const names = (res.columnHeaders ?? []).map((h) => h.name);
  return (res.rows ?? []).map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])) as ApiRow);
}

export function requireOAuthClient(): { clientId: string; clientSecret: string } {
  loadEnv();
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AuthError('YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET が .env にありません。README の「自分のチャンネルを分析する」の手順で作ってください');
  }
  return { clientId, clientSecret };
}

let cached: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { clientId, clientSecret } = requireOAuthClient();
  const refresh = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!refresh) throw new AuthError('YOUTUBE_OAUTH_REFRESH_TOKEN が .env にありません。node scripts/own_auth.ts を実行してください');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    if (json.error === 'invalid_grant') {
      throw new AuthError('リフレッシュトークンが失効しています。node scripts/own_auth.ts をもう一度実行してください（OAuth同意画面が「テスト」のままだと7日で失効します。README参照）');
    }
    throw new AuthError(`アクセストークンを取得できません（${json.error ?? `HTTP ${res.status}`}）`);
  }
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

// Google 側の一時的なエラー（5xx・429）。少し待ってやり直せば通ることが多い
export class TransientError extends Error {}

// 一時的なエラーのときだけ、delaysMs の間隔でやり直す（回数は delaysMs の長さ）
export async function withRetry<T>(fn: () => Promise<T>, delaysMs: number[] = [2000, 5000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof TransientError) || i >= delaysMs.length) throw e;
      await new Promise((r) => setTimeout(r, delaysMs[i]));
    }
  }
}

// ids=channel==MINE を付けて reports を呼ぶ。行は列名つきのオブジェクトで返す
export function ytAnalytics(params: Record<string, string | number>): Promise<ApiRow[]> {
  return withRetry(async () => {
    const token = await getAccessToken();
    const query = new URLSearchParams({ ids: 'channel==MINE', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    const res = await fetch(`${REPORTS_URL}?${query}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as ReportResponse & { error?: { message?: string } };
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? res.statusText;
      if (res.status === 401) throw new AuthError(`Analytics API の認証エラー: ${msg}。node scripts/own_auth.ts をやり直してください`);
      const text = `Analytics API エラー（${params.dimensions ?? ''}, HTTP ${res.status}）: ${msg}`;
      if (res.status >= 500 || res.status === 429) throw new TransientError(text);
      throw new Error(`${text}${res.status === 403 ? '（YouTube Analytics API が有効か、承認したアカウントがこのチャンネルの持ち主かを確認）' : ''}`);
    }
    return rowsToObjects(json);
  });
}
