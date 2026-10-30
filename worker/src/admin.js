// Review pages for the owner at /admin, behind Cloudflare Access (ADR 0003): list, one submission with its files
// and history, status changes (appended events), a contributor's export and the event chain check.
import { STATUSES, appendEvent, currentStatus, verifyChain } from './records.js';
import { escapeHtml as e, sha256 } from './util.js';

const page = (title, body) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${e(title)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;background:#12141b;color:#e6e8ef;margin:0 auto;max-width:1100px;padding:16px}
a{color:#7fb0ff}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2c3040;padding:6px;text-align:left;vertical-align:top}
pre{background:#1b1e28;padding:12px;overflow-x:auto;white-space:pre-wrap}.bad{color:#e5383b}.ok{color:#5fd38d}
input,select,textarea,button{font:inherit;background:#1b1e28;color:#e6e8ef;border:1px solid #2c3040;padding:6px}
</style></head><body><p><a href="/admin">All submissions</a> · <a href="/admin/verify">Check event chain</a></p>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

async function list(env) {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.received_at, s.title, s.credit_name, s.discord_username, s.third_party_count, s.missing_evidence,
       (SELECT status FROM events v WHERE v.submission_id = s.id ORDER BY seq DESC LIMIT 1) AS status
     FROM submissions s ORDER BY s.received_at DESC LIMIT 200`,
  ).all();
  const rows = results
    .map(
      (r) => `<tr><td><a href="/admin/s/${e(r.id)}">${e(r.id)}</a></td><td>${e(r.received_at)}</td><td>${e(r.title)}</td>
<td>${r.credit_name ? e(r.credit_name) : "<i>anonymous</i>"} (${e(r.discord_username)})</td><td>${e(r.status)}</td><td>${r.third_party_count}${r.missing_evidence ? ` <span class="bad">${r.missing_evidence} without evidence</span>` : ''}</td></tr>`,
    )
    .join('');
  return page('Map submissions', `<h1>Map submissions</h1><table><tr><th>ID</th><th>Received (UTC)</th><th>Title</th><th>Credit (Discord)</th><th>Status</th><th>Third-party assets</th></tr>${rows}</table>`);
}

// Every file the record names, with its stored key and expected SHA-256.
const recordFiles = (record) => [
  { label: 'map', key: record.map.key, sha256: record.map.sha256 },
  ...record.third_party.assets.filter((a) => a.evidence_file).map((a) => ({ label: `evidence: ${a.name}`, key: a.evidence_file.key, sha256: a.evidence_file.sha256 })),
];

async function detail(env, id) {
  const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });
  const record = JSON.parse(row.receipt_json);
  const stored = await env.FILES.get(`submissions/${id}/record.json`);
  const storedText = stored ? await stored.text() : null;
  const recordOk = storedText === row.receipt_json && (await sha256(storedText)) === row.receipt_sha256;
  const checks = [];
  for (const f of recordFiles(record)) {
    const object = await env.FILES.get(f.key);
    const ok = object && (await sha256(new Uint8Array(await object.arrayBuffer()))) === f.sha256;
    checks.push(`<li><a href="/admin/file/${encodeURIComponent(f.key)}">${e(f.label)}</a> <code>${e(f.sha256)}</code> <span class="${ok ? 'ok' : 'bad'}">${ok ? 'matches' : 'MISSING OR CHANGED'}</span></li>`);
  }
  const { results: events } = await env.DB.prepare('SELECT * FROM events WHERE submission_id = ? ORDER BY seq').bind(id).all();
  const history = events.map((v) => `<tr><td>${e(v.at)}</td><td>${e(v.actor)}</td><td>${e(v.kind)}</td><td>${e(v.status)}</td><td>${e(v.note)}</td></tr>`).join('');
  const options = STATUSES.filter((s) => s !== 'received').map((s) => `<option>${s}</option>`).join('');
  return page(
    id,
    `<h1>${e(record.title)}</h1>
<p>${e(id)} · received ${e(record.received_at)} · status <strong>${e(events.at(-1)?.status)}</strong></p>
<p>Record <code>${e(row.receipt_sha256)}</code> <span class="${recordOk ? 'ok' : 'bad'}">${recordOk ? 'stored copy matches' : 'STORED COPY MISSING OR CHANGED'}</span> ·
<a href="/admin/file/${encodeURIComponent(`agreements/${record.agreement.sha256}.txt`)}">agreement ${e(record.agreement.version)}</a></p>
<h2>Files</h2><ul>${checks.join('')}</ul>
<h2>History</h2><table><tr><th>At (UTC)</th><th>By</th><th>Kind</th><th>Status</th><th>Note</th></tr>${history}</table>
<form method="post" action="/admin/s/${e(id)}/status"><p><select name="status">${options}</select>
<input name="note" size="60" maxlength="500" placeholder="Note (reason, follow-up asked, takedown cause)"> <button>Add event</button></p></form>
<p><a href="/admin/export?discord_id=${e(record.account.id)}">Export everything for this contributor</a></p>
<h2>Record</h2><pre>${e(JSON.stringify(record, null, 2))}</pre>`,
  );
}

// A new event; accepting copies the files and the record to accepted/, which the bucket keeps indefinitely.
async function addStatus(request, env, id, actor) {
  const form = await request.formData();
  const status = String(form.get('status'));
  const note = String(form.get('note') ?? '').trim().slice(0, 500);
  const row = await env.DB.prepare('SELECT receipt_json FROM submissions WHERE id = ?').bind(id).first();
  if (!row || !STATUSES.includes(status) || status === 'received') return new Response('Bad request', { status: 400 });
  if (status === 'accepted' && (await currentStatus(env.DB, id)) !== 'accepted') {
    const record = JSON.parse(row.receipt_json);
    for (const key of [...recordFiles(record).map((f) => f.key), `submissions/${id}/record.json`]) {
      const object = await env.FILES.get(key);
      if (!object) return new Response(`Stored file missing: ${key}`, { status: 409 });
      const target = key.replace(/^submissions\//, 'accepted/');
      if (!(await env.FILES.head(target))) await env.FILES.put(target, await object.arrayBuffer(), { httpMetadata: object.httpMetadata });
    }
  }
  await appendEvent(env.DB, { submission_id: id, at: new Date().toISOString(), actor: `access:${actor}`, kind: 'status', status, note });
  return new Response(null, { status: 303, headers: { Location: `/admin/s/${id}` } });
}

// Everything held about one Discord account: the records and their histories, as JSON (GDPR access requests).
async function exportAccount(env, discordId) {
  const { results } = await env.DB.prepare('SELECT id, receipt_json, receipt_sha256 FROM submissions WHERE discord_id = ? ORDER BY received_at').bind(discordId).all();
  const submissions = [];
  for (const r of results) {
    const { results: events } = await env.DB.prepare('SELECT at, kind, status, note FROM events WHERE submission_id = ? ORDER BY seq').bind(r.id).all();
    submissions.push({ record: JSON.parse(r.receipt_json), record_sha256: r.receipt_sha256, events });
  }
  return new Response(JSON.stringify({ discord_id: discordId, exported_at: new Date().toISOString(), submissions }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="rv2-maps-${discordId}.json"` },
  });
}

async function file(env, key) {
  if (!/^(submissions|accepted|agreements)\/[\w./-]+$/.test(key) || key.includes('..')) return new Response('Not found', { status: 404 });
  const object = await env.FILES.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${key.split('/').slice(-2).join('-')}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function handleAdmin(request, env, url, actor) {
  const path = url.pathname;
  if (request.method === 'POST') {
    // Same-origin forms only: a page elsewhere can't make the owner's browser change a status.
    if (request.headers.get('Origin') !== env.API_ORIGIN) return new Response('Forbidden', { status: 403 });
    const m = path.match(/^\/admin\/s\/(M-\d{8}-[0-9a-f]{8})\/status$/);
    return m ? addStatus(request, env, m[1], actor) : new Response('Not found', { status: 404 });
  }
  if (path === '/admin' || path === '/admin/') return list(env);
  if (path === '/admin/verify') {
    const result = await verifyChain(env.DB);
    return page('Event chain', result.ok ? `<p class="ok">All ${result.count} events chain correctly.</p>` : `<p class="bad">Submission ${e(result.submission)}: ${result.seq ? `the chain breaks at event ${result.seq}` : 'the record no longer matches its hash'}.</p>`);
  }
  if (path === '/admin/export') return exportAccount(env, url.searchParams.get('discord_id') ?? '');
  const s = path.match(/^\/admin\/s\/(M-\d{8}-[0-9a-f]{8})$/);
  if (s) return detail(env, s[1]);
  if (path.startsWith('/admin/file/')) return file(env, decodeURIComponent(path.slice('/admin/file/'.length)));
  return new Response('Not found', { status: 404 });
}
