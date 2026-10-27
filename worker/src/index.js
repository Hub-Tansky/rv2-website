// Map submission service at submit.roboviolence.com (ADR 0002, runbook docs/ops/map-submissions.md).
// The form is website/submit-map.html on roboviolence.com; it calls /api/* here with the session cookie.
import { currentAgreement } from './agreement.js';
import { accessUser, loginCallback, loginRedirect, logoutCookie, readSession } from './auth.js';
import { handleAdmin } from './admin.js';
import { purgeExpired } from './purge.js';
import { handleSubmission } from './submit.js';

function withCors(response, env) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', env.SITE_ORIGIN);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}

// The form page itself, or this service: anything else posting here is refused (the session cookie is SameSite=Lax,
// and this is the second lock).
const trustedOrigin = (request, env) => [env.SITE_ORIGIN, env.API_ORIGIN].includes(request.headers.get('Origin'));

async function api(request, env, ctx, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Max-Age': '600' } });
  }
  if (url.pathname === '/api/agreement' && request.method === 'GET') {
    const agreement = await currentAgreement(env);
    if (!agreement) return Response.json({ error: 'closed', message: 'Map submissions are not open yet.' }, { status: 503 });
    return Response.json({ ...agreement, turnstile_site_key: env.TURNSTILE_SITE_KEY, print_url: `${env.API_ORIGIN}/agreement/${agreement.sha256}.txt` });
  }
  if (url.pathname === '/api/me' && request.method === 'GET') {
    const user = await readSession(request, env.SESSION_SECRET);
    return Response.json(user ? { signed_in: true, ...user } : { signed_in: false });
  }
  if (url.pathname === '/api/submissions' && request.method === 'POST') {
    if (!trustedOrigin(request, env)) return Response.json({ error: 'origin' }, { status: 403 });
    return handleSubmission(request, env, ctx, await readSession(request, env.SESSION_SECRET));
  }
  return Response.json({ error: 'not_found' }, { status: 404 });
}

// A plain-text copy of an agreement version, for reading in full or printing before accepting.
async function agreementText(env, hash) {
  const object = await env.FILES.get(`agreements/${hash}.txt`);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400, immutable' } });
}

// Nightly copy of both tables into the bucket (backups/ is locked for 30 days); D1 Time Travel covers the last days too.
async function backup(env, now = new Date()) {
  const tables = {};
  for (const table of ['submissions', 'events']) tables[table] = (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;
  await env.FILES.put(`backups/d1-${now.toISOString().slice(0, 10)}.json`, JSON.stringify({ at: now.toISOString(), tables }), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return withCors(await api(request, env, ctx, url), env);
      if (url.pathname === '/auth/login') return loginRedirect(env);
      if (url.pathname === '/auth/callback') return loginCallback(request, env);
      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        if (!trustedOrigin(request, env)) return new Response('Forbidden', { status: 403 });
        return withCors(new Response(null, { status: 204, headers: { 'Set-Cookie': logoutCookie() } }), env);
      }
      const agreement = url.pathname.match(/^\/agreement\/([0-9a-f]{64})\.txt$/);
      if (agreement) return agreementText(env, agreement[1]);
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        const actor = await accessUser(request, env);
        if (!actor) return new Response('Forbidden', { status: 403 });
        return handleAdmin(request, env, url, actor);
      }
      if (url.pathname === '/') return Response.redirect(`${env.SITE_ORIGIN}/submit-map.html`, 302);
      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error(error);
      const body = { error: 'server', message: 'Something went wrong on our side. Without a submission ID your map is not recorded: try again later.' };
      return url.pathname.startsWith('/api/') ? withCors(Response.json(body, { status: 500 }), env) : new Response(body.message, { status: 500 });
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(backup(env).then(() => purgeExpired(env)));
  },
};
