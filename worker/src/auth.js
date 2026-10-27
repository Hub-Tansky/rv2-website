// Sign-in for map submitters (Discord OAuth2, `identify` scope only: user ID and names, no email) and the
// signed session cookie; Cloudflare Access check for the owner's review pages (ADR 0002).
import { base64url, cookies, fromBase64url, randomHex } from './util.js';

const SESSION_COOKIE = 'rv2_session';
const STATE_COOKIE = 'rv2_oauth_state';
const SESSION_SECONDS = 2 * 60 * 60;
const DISCORD = 'https://discord.com';

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(user, secret, now = Date.now()) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ ...user, exp: Math.floor(now / 1000) + SESSION_SECONDS })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${base64url(sig)}`;
}

// The signed-in Discord user { id, username, globalName } from the session cookie, or null.
export async function readSession(request, secret, now = Date.now()) {
  const value = cookies(request)[SESSION_COOKIE];
  if (!value || !secret) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64url(sig), new TextEncoder().encode(payload));
    if (!ok) return null;
    const user = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    if (!(user.exp > now / 1000) || !/^\d{1,20}$/.test(user.id)) return null;
    return { id: user.id, username: user.username, globalName: user.globalName ?? null };
  } catch {
    return null;
  }
}

const cookie = (name, value, maxAge) => `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;

export function loginRedirect(env) {
  const state = randomHex(16);
  const url = new URL('/oauth2/authorize', DISCORD);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.DISCORD_CLIENT_ID,
    scope: 'identify',
    state,
    redirect_uri: `${env.API_ORIGIN}/auth/callback`,
  });
  return new Response(null, { status: 302, headers: { Location: url.href, 'Set-Cookie': cookie(STATE_COOKIE, state, 600) } });
}

// Discord sends the user back here: check the state, swap the code for a token, read the user, drop the token.
export async function loginCallback(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const back = `${env.SITE_ORIGIN}/submit-map.html`;
  const fail = (reason) =>
    new Response(null, { status: 302, headers: { Location: `${back}?signin=${reason}`, 'Set-Cookie': cookie(STATE_COOKIE, '', 0) } });
  const state = cookies(request)[STATE_COOKIE];
  if (!state || url.searchParams.get('state') !== state) return fail('expired');
  const code = url.searchParams.get('code');
  if (!code) return fail('cancelled');
  const token = await fetcher(`${DISCORD}/api/v10/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${env.API_ORIGIN}/auth/callback`,
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
    }),
  });
  if (!token.ok) return fail('failed');
  const { access_token: accessToken } = await token.json();
  const me = await fetcher(`${DISCORD}/api/v10/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!me.ok) return fail('failed');
  const user = await me.json();
  const session = await signSession({ id: String(user.id), username: user.username, globalName: user.global_name ?? null }, env.SESSION_SECRET);
  const headers = new Headers({ Location: back });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, SESSION_SECONDS));
  headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
}

export function logoutCookie() {
  return cookie(SESSION_COOKIE, '', 0);
}

// Cloudflare Access puts a signed JWT in Cf-Access-Jwt-Assertion for requests it let through. Checking it here
// means the review pages stay closed even if the Access application is removed by mistake.
let accessKeys = null;

export async function accessUser(request, env, fetcher = fetch, now = Date.now()) {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(fromBase64url(h)));
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(p)));
    if (header.alg !== 'RS256') return null;
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    if (claims.iss !== issuer || !(claims.exp > now / 1000)) return null;
    if (![claims.aud].flat().includes(env.ACCESS_AUD)) return null;
    accessKeys ??= (await (await fetcher(`${issuer}/cdn-cgi/access/certs`)).json()).keys;
    const jwk = accessKeys.find((k) => k.kid === header.kid);
    if (!jwk) {
      accessKeys = null; // keys rotate: fetch them again next time
      return null;
    }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const allowed = (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    const email = String(claims.email ?? '').toLowerCase();
    return allowed.includes(email) ? email : null;
  } catch {
    return null;
  }
}

export function resetAccessKeysForTests() {
  accessKeys = null;
}
