// Map submission Worker (ADR 0002). Run: node --test worker/test/
import assert from 'node:assert/strict';
import test from 'node:test';
import { clearAgreementCacheForTests } from '../src/agreement.js';
import { accessUser, readSession, resetAccessKeysForTests, signSession } from '../src/auth.js';
import { readMapHeader } from '../src/bvm.js';
import worker from '../src/index.js';
import { purgeExpired } from '../src/purge.js';
import { verifyChain } from '../src/records.js';
import { ASSET_FIELDS, FORM_FIELDS, evidenceType } from '../src/submit.js';
import { base64url, canonicalJson, sha256 } from '../src/util.js';
import { fakeD1, fakeR2 } from './fakes.mjs';

const SITE = 'https://roboviolence.com';
const API = 'https://submit.roboviolence.com';
const AGREEMENT = 'Test agreement text.\nClause 1.\n';
const USER = { id: '123456789012345678', username: 'mapper', globalName: 'Map Maker' };

// A map in the game's newest layout (20202): version, author, theme, weather, size, two bytes per cell, spawns.
function bvm({ version = 20202, width = 4, height = 3, author = 'Tester', cells = width * height } = {}) {
  const header = version === 20202 ? 37 : version === 20201 ? 12 : 8;
  const bytes = new Uint8Array(header + cells * 2 + 2);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, version, true);
  let at = 4;
  if (version === 20202) {
    bytes.set(new TextEncoder().encode(`\x04${author}`), 4);
    at += 25;
  }
  if (version >= 20201) at += 4;
  view.setInt16(at, width, true);
  view.setInt16(at + 2, height, true);
  return bytes;
}

async function setUp(overrides = {}) {
  clearAgreementCacheForTests();
  const env = {
    SITE_ORIGIN: SITE,
    API_ORIGIN: API,
    SUBMISSIONS_PER_DAY: '5',
    DISCORD_CLIENT_ID: 'client',
    DISCORD_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'session-secret-for-tests',
    TURNSTILE_SITE_KEY: 'site-key',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    AGREEMENT_VERSION: '1.0',
    AGREEMENT_SHA256: await sha256(AGREEMENT),
    DB: fakeD1(),
    FILES: fakeR2(),
    ...overrides,
  };
  await env.FILES.put(`agreements/${await sha256(AGREEMENT)}.txt`, AGREEMENT);
  return env;
}

// Answers the Worker's outgoing calls: Turnstile says `human`, everything else is recorded.
function stubFetch({ human = true } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('turnstile')) return Response.json({ success: human });
    return new Response('{}');
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

async function form(env, fields = {}, { map = bvm(), mapName = 'CTF-Test.bvm', files = {} } = {}) {
  const data = new FormData();
  const values = { title: 'Test Map', description: 'A small map', credit_name: 'Map Maker', third_party: 'none', agree: 'yes', agreement_sha256: env.AGREEMENT_SHA256, 'cf-turnstile-response': 'token', ...fields };
  for (const [k, v] of Object.entries(values)) if (v !== undefined) data.set(k, v);
  if (map) data.set('map', new File([map], mapName));
  for (const [k, [bytes, name]] of Object.entries(files)) data.set(k, new File([bytes], name));
  return data;
}

async function submit(env, data, { user = USER, origin = SITE } = {}) {
  const headers = { Origin: origin };
  if (user) headers.Cookie = `rv2_session=${await signSession(user, env.SESSION_SECRET)}`;
  const response = await worker.fetch(new Request(`${API}/api/submissions`, { method: 'POST', headers, body: data }), env, { waitUntil() {} });
  return { response, body: await response.json() };
}

test('readMapHeader accepts every map version the game reads and rejects broken files', () => {
  assert.deepEqual(readMapHeader(bvm()), { version: 20202, width: 4, height: 3, author: 'Tester' });
  assert.equal(readMapHeader(bvm({ version: 20201 })).version, 20201);
  assert.equal(readMapHeader(bvm({ version: 10011 })).width, 4);
  assert.match(readMapHeader(bvm({ version: 30000 })).error, /unknown map version/);
  assert.match(readMapHeader(bvm().slice(0, 40)).error, /cut off/);
  assert.match(readMapHeader(bvm({ width: 300 })).error, /1 to 256/);
  assert.match(readMapHeader(new Uint8Array(3)).error, /too short/);
});

test('evidenceType goes by content: PDF, PNG, JPEG and UTF-8 text only', () => {
  assert.equal(evidenceType(new TextEncoder().encode('%PDF-1.7')).ext, 'pdf');
  assert.equal(evidenceType(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d)).ext, 'png');
  assert.equal(evidenceType(new TextEncoder().encode('Licence: CC BY 4.0, by Jane')).ext, 'txt');
  assert.equal(evidenceType(Uint8Array.of(0x4d, 0x5a, 0x00, 0x01)), null); // an .exe renamed
});

test('canonicalJson sorts keys at every level', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: null } }), '{"a":{"c":null,"d":[2,{"e":0,"f":1}]},"b":1}');
});

test('the session cookie is signed and expires', async () => {
  const cookie = await signSession(USER, 'k', Date.UTC(2026, 9, 27));
  const request = (value) => new Request(API, { headers: { Cookie: `rv2_session=${value}` } });
  assert.deepEqual(await readSession(request(cookie), 'k', Date.UTC(2026, 9, 27)), USER);
  assert.equal(await readSession(request(cookie), 'other-key', Date.UTC(2026, 9, 27)), null);
  assert.equal(await readSession(request(cookie), 'k', Date.UTC(2026, 9, 28)), null);
  const [payload, sig] = cookie.split('.');
  const forged = base64url(new TextEncoder().encode(JSON.stringify({ ...USER, id: '1', exp: 9e9 })));
  assert.equal(await readSession(request(`${forged}.${sig}`), 'k'), null, payload);
});

test('Discord sign-in checks the state and sets the session from /users/@me', async () => {
  const env = await setUp();
  const login = await worker.fetch(new Request(`${API}/auth/login`), env);
  const location = new URL(login.headers.get('Location'));
  assert.equal(location.origin, 'https://discord.com');
  assert.equal(location.searchParams.get('scope'), 'identify');
  const state = location.searchParams.get('state');

  const bad = await worker.fetch(new Request(`${API}/auth/callback?code=c&state=wrong`, { headers: { Cookie: `rv2_oauth_state=${state}` } }), env);
  assert.equal(bad.headers.get('Location'), `${SITE}/submit-map.html?signin=expired`);

  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).endsWith('/oauth2/token') ? Response.json({ access_token: 't' }) : Response.json({ id: USER.id, username: 'mapper', global_name: 'Map Maker', email: 'never@used' });
  try {
    const ok = await worker.fetch(new Request(`${API}/auth/callback?code=c&state=${state}`, { headers: { Cookie: `rv2_oauth_state=${state}` } }), env);
    assert.equal(ok.headers.get('Location'), `${SITE}/submit-map.html`);
    const session = ok.headers.getSetCookie().find((c) => c.startsWith('rv2_session='));
    assert.match(session, /HttpOnly; Secure; SameSite=Lax/);
    const me = await worker.fetch(new Request(`${API}/api/me`, { headers: { Cookie: session.split(';')[0] } }), env);
    assert.deepEqual(await me.json(), { signed_in: true, ...USER });
    assert.equal(me.headers.get('Access-Control-Allow-Origin'), SITE);
    assert.equal(me.headers.get('Access-Control-Allow-Credentials'), 'true');
  } finally {
    globalThis.fetch = original;
  }
});

test('the agreement endpoint serves the stored text with its hash, or says the form is closed', async () => {
  const env = await setUp();
  const body = await (await worker.fetch(new Request(`${API}/api/agreement`), env)).json();
  assert.equal(body.text, AGREEMENT);
  assert.equal(body.sha256, env.AGREEMENT_SHA256);
  assert.match(body.consent, /version 1\.0\. I confirm/);
  assert.equal(body.turnstile_site_key, 'site-key');
  assert.equal((await worker.fetch(new Request(`${API}/api/agreement`), await setUp({ AGREEMENT_SHA256: '' }))).status, 503);
  // A stored text that doesn't match its hash is never served as that version
  const tampered = await setUp();
  await tampered.FILES.put(`agreements/${tampered.AGREEMENT_SHA256}.txt`, 'Other text');
  assert.equal((await worker.fetch(new Request(`${API}/api/agreement`), tampered)).status, 500);
});

test('a valid submission stores the files and a record that binds account, map, agreement and time', async () => {
  const env = await setUp();
  const fake = stubFetch();
  try {
    const { response, body } = await submit(env, await form(env));
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.match(body.id, /^M-\d{8}-[0-9a-f]{8}$/);
    assert.equal(body.map.sha256, await sha256(bvm()));
    const stored = env.FILES.objects.get(`submissions/${body.id}/record.json`);
    const recordText = new TextDecoder().decode(stored.bytes);
    assert.equal(await sha256(recordText), body.receipt_sha256);
    const record = JSON.parse(recordText);
    assert.deepEqual(record.account, { provider: 'discord', id: USER.id, username: 'mapper', global_name: 'Map Maker' });
    assert.equal(record.agreement.sha256, env.AGREEMENT_SHA256);
    assert.equal(record.map.author_in_file, 'Tester');
    assert.equal(record.acceptance.accepted_at, record.received_at);
    assert.deepEqual([...env.FILES.objects.get(`submissions/${body.id}/map.bvm`).bytes], [...bvm()]);
    const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(body.id).first();
    assert.equal(row.receipt_sha256, body.receipt_sha256);
    assert.deepEqual(await verifyChain(env.DB), { ok: true, count: 1 });
    assert.ok(fake.calls.some((c) => c.url.includes('turnstile')));
  } finally {
    fake.restore();
  }
});

test('third-party assets need a full entry; missing evidence is flagged for review, not refused', async () => {
  const env = await setUp();
  const fake = stubFetch();
  try {
    const none = await submit(env, await form(env, { third_party: 'yes' }));
    assert.equal(none.response.status, 422);
    assert.ok(none.body.errors.asset_name_0);

    const partial = await submit(env, await form(env, { third_party: 'yes', asset_name_0: 'Rock texture' }));
    assert.deepEqual(Object.keys(partial.body.errors).sort(), ['asset_license_0', 'asset_rightsholder_0', 'asset_source_0']);

    const asset = { asset_rightsholder_0: 'Jane', asset_source_0: 'opengameart.org', asset_license_0: 'CC BY 4.0' };
    const flagged = await submit(env, await form(env, { third_party: 'yes', asset_name_0: 'Rock texture', ...asset }));
    assert.equal(flagged.response.status, 201);
    assert.equal(flagged.body.missing_evidence, 1);
    const event = await env.DB.prepare('SELECT note FROM events WHERE submission_id = ?').bind(flagged.body.id).first();
    assert.match(event.note, /without evidence/);

    const pdf = new TextEncoder().encode('%PDF-1.4 permission letter');
    const evidenced = await submit(env, await form(env, { third_party: 'yes', asset_name_1: 'Song', ...Object.fromEntries(Object.entries(asset).map(([k, v]) => [k.replace('_0', '_1'), v])) }, { files: { asset_evidence_file_1: [pdf, 'permission.pdf'] } }));
    assert.equal(evidenced.response.status, 201, JSON.stringify(evidenced.body));
    assert.equal(evidenced.body.missing_evidence, 0);
    const record = JSON.parse(new TextDecoder().decode(env.FILES.objects.get(`submissions/${evidenced.body.id}/record.json`).bytes));
    assert.equal(record.third_party.assets[0].evidence_file.sha256, await sha256(pdf));
    assert.ok(env.FILES.objects.has(`submissions/${evidenced.body.id}/evidence-1.pdf`));

    const exe = await submit(env, await form(env, { third_party: 'yes', asset_name_0: 'X', ...asset }, { files: { asset_evidence_file_0: [Uint8Array.of(0x4d, 0x5a, 0, 1), 'proof.pdf'] } }));
    assert.match(exe.body.errors.asset_evidence_file_0, /PDF, PNG, JPEG or plain text/);
  } finally {
    fake.restore();
  }
});

test('submissions are refused without sign-in, from other sites, with bad fields, a failed check or over the daily limit', async () => {
  const env = await setUp();
  let fake = stubFetch();
  try {
    assert.equal((await submit(env, await form(env), { user: null })).response.status, 401);
    assert.equal((await submit(env, await form(env), { origin: 'https://evil.example' })).response.status, 403);
    const bad = await submit(env, await form(env, { title: '', agree: undefined, third_party: undefined }, { map: new TextEncoder().encode('not a map'), mapName: 'x.bvm' }));
    assert.deepEqual(Object.keys(bad.body.errors).sort(), ['agree', 'map', 'third_party', 'title']);
    assert.match((await submit(env, await form(env, {}, { mapName: 'map.zip' }))).body.errors.map, /\.bvm/);
    const stale = await submit(env, await form(env, { agreement_sha256: 'f'.repeat(64) }));
    assert.match(stale.body.errors.agree, /agreement changed/);
    assert.equal(fake.calls.length, 0, 'the human check runs only once the fields are valid');
    for (let i = 0; i < 5; i++) assert.equal((await submit(env, await form(env))).response.status, 201);
    const limited = await submit(env, await form(env));
    assert.equal(limited.response.status, 429);
    fake.restore();
    fake = stubFetch({ human: false });
    const robot = await submit(await setUp(), await form(env));
    assert.ok(robot.body.errors.turnstile);
    assert.equal((await submit(await setUp({ AGREEMENT_SHA256: '' }), await form(env))).response.status, 503);
  } finally {
    fake.restore();
  }
});

test('stored records cannot be edited or deleted in the database', async () => {
  const env = await setUp();
  const fake = stubFetch();
  try {
    const { body } = await submit(env, await form(env));
    assert.throws(() => env.DB.sqlite.exec(`UPDATE submissions SET title = 'x' WHERE id = '${body.id}'`), /append-only/);
    assert.throws(() => env.DB.sqlite.exec('DELETE FROM events'), /append-only/);
  } finally {
    fake.restore();
  }
});

// A Cloudflare Access token signed with a test key, and the certs endpoint that publishes it.
async function accessFixture(claims) {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
  const enc = (o) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: 'RS256', kid: 'k1' })}.${enc(claims)}`;
  const sig = base64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsigned)));
  return { jwt: `${unsigned}.${sig}`, certs: async () => Response.json({ keys: [jwk] }) };
}

const ACCESS = { ACCESS_TEAM_DOMAIN: 'rv2.cloudflareaccess.com', ACCESS_AUD: 'aud-1', ADMIN_EMAILS: 'owner@example.org' };
const ownerClaims = { iss: 'https://rv2.cloudflareaccess.com', aud: ['aud-1'], email: 'Owner@example.org', exp: Math.floor(Date.now() / 1000) + 600 };

test('the review pages need a valid Access token for an allowed address', async () => {
  resetAccessKeysForTests();
  const { jwt, certs } = await accessFixture(ownerClaims);
  const request = (token) => new Request(`${API}/admin`, { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });
  assert.equal(await accessUser(request(jwt), ACCESS, certs), 'owner@example.org');
  assert.equal(await accessUser(request(null), ACCESS, certs), null);
  assert.equal(await accessUser(request(jwt), { ...ACCESS, ACCESS_AUD: 'other' }, certs), null);
  assert.equal(await accessUser(request(jwt), { ...ACCESS, ADMIN_EMAILS: 'someone@else.org' }, certs), null);
  resetAccessKeysForTests();
  const stranger = await accessFixture(ownerClaims); // signed by a key Access never published
  assert.equal(await accessUser(request(stranger.jwt), ACCESS, certs), null);
  const env = await setUp(ACCESS);
  assert.equal((await worker.fetch(request(null), env)).status, 403);
});

test('accepting a submission appends an event and copies its files to accepted/', async () => {
  resetAccessKeysForTests();
  const env = await setUp(ACCESS);
  const fake = stubFetch();
  const { jwt, certs } = await accessFixture(ownerClaims);
  const original = globalThis.fetch;
  globalThis.fetch = (url, init) => (String(url).includes('/cdn-cgi/access/certs') ? certs() : original(url, init));
  try {
    const { body } = await submit(env, await form(env));
    const post = (origin) =>
      worker.fetch(new Request(`${API}/admin/s/${body.id}/status`, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': jwt, Origin: origin }, body: new URLSearchParams({ status: 'accepted', note: 'Looks good' }) }), env);
    assert.equal((await post(SITE)).status, 403, 'admin forms only from the service itself');
    assert.equal((await post(API)).status, 303);
    for (const name of ['map.bvm', 'record.json']) assert.ok(env.FILES.objects.has(`accepted/${body.id}/${name}`), name);
    const events = (await env.DB.prepare('SELECT actor, status FROM events WHERE submission_id = ? ORDER BY seq').bind(body.id).all()).results;
    assert.deepEqual(events.map((e) => e.status), ['received', 'accepted']);
    assert.equal(events[1].actor, 'access:owner@example.org');
    assert.deepEqual(await verifyChain(env.DB), { ok: true, count: 2 });
    const detail = await (await worker.fetch(new Request(`${API}/admin/s/${body.id}`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), env)).text();
    assert.match(detail, /stored copy matches/);
    assert.doesNotMatch(detail, /MISSING OR CHANGED/);
    const exported = await (await worker.fetch(new Request(`${API}/admin/export?discord_id=${USER.id}`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), env)).json();
    assert.equal(exported.submissions[0].events.length, 2);
  } finally {
    globalThis.fetch = original;
    fake.restore();
  }
});

test('verifyChain finds an edited event and a record that no longer matches its hash', async () => {
  const env = await setUp();
  const fake = stubFetch();
  try {
    const first = (await submit(env, await form(env))).body;
    await submit(env, await form(env));
    assert.deepEqual(await verifyChain(env.DB), { ok: true, count: 2 });
    env.DB.sqlite.exec('DROP TRIGGER events_no_update');
    env.DB.sqlite.exec("UPDATE events SET note = 'edited' WHERE seq = 1");
    const broken = await verifyChain(env.DB);
    assert.equal(broken.ok, false);
    assert.equal(broken.seq, 1);
    assert.equal(broken.submission, first.id);
    env.DB.sqlite.exec("UPDATE events SET note = '' WHERE seq = 1");
    env.DB.sqlite.exec('DROP TRIGGER submissions_no_update');
    env.DB.sqlite.exec(`UPDATE submissions SET receipt_json = '{}' WHERE id = '${first.id}'`);
    const changed = await verifyChain(env.DB);
    assert.deepEqual([changed.ok, changed.submission, changed.seq], [false, first.id, null]);
  } finally {
    fake.restore();
  }
});

test('rejected submissions are deleted after the retention period, once the bucket lets go of the files', async () => {
  resetAccessKeysForTests();
  const env = await setUp(ACCESS);
  const fake = stubFetch();
  const { jwt, certs } = await accessFixture(ownerClaims);
  const original = globalThis.fetch;
  globalThis.fetch = (url, init) => (String(url).includes('/cdn-cgi/access/certs') ? certs() : original(url, init));
  const setStatus = (id, status) =>
    worker.fetch(new Request(`${API}/admin/s/${id}/status`, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': jwt, Origin: API }, body: new URLSearchParams({ status, note: '' }) }), env);
  try {
    const rejected = (await submit(env, await form(env))).body.id;
    const accepted = (await submit(env, await form(env))).body.id;
    const waiting = (await submit(env, await form(env))).body.id;
    await setStatus(rejected, 'rejected');
    await setStatus(accepted, 'accepted');
    await setStatus(accepted, 'taken_down');
    await setStatus(accepted, 'rejected');
    assert.deepEqual(await purgeExpired(env), [], 'nothing is old enough yet');
    const later = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000);
    env.FILES.locked = (key) => key.startsWith('submissions/');
    assert.deepEqual(await purgeExpired(env, later), [], 'locked files keep the rows too');
    env.FILES.locked = () => false;
    assert.deepEqual(await purgeExpired(env, later), [rejected], 'only never-accepted, rejected ones go');
    assert.equal(await env.DB.prepare('SELECT id FROM submissions WHERE id = ?').bind(rejected).first(), null);
    assert.ok([...env.FILES.objects.keys()].every((k) => !k.includes(rejected)));
    assert.ok(await env.DB.prepare('SELECT purged_at FROM purges WHERE submission_id = ?').bind(rejected).first());
    for (const id of [accepted, waiting]) assert.ok(await env.DB.prepare('SELECT id FROM submissions WHERE id = ?').bind(id).first(), id);
    assert.throws(() => env.DB.sqlite.exec(`DELETE FROM submissions WHERE id = '${waiting}'`), /append-only/);
    assert.deepEqual((await verifyChain(env.DB)).ok, true);
  } finally {
    globalThis.fetch = original;
    fake.restore();
  }
});

test('the nightly backup writes both tables to the bucket', async () => {
  const env = await setUp();
  const fake = stubFetch();
  try {
    await submit(env, await form(env));
    let pending;
    await worker.scheduled({}, env, { waitUntil: (p) => (pending = p) });
    await pending;
    const [key] = [...env.FILES.objects.keys()].filter((k) => k.startsWith('backups/'));
    const backup = JSON.parse(new TextDecoder().decode(env.FILES.objects.get(key).bytes));
    assert.equal(backup.tables.submissions.length, 1);
    assert.equal(backup.tables.events.length, 1);
  } finally {
    fake.restore();
  }
});

test('FORM_FIELDS and ASSET_FIELDS are the names the service reads', async () => {
  const env = await setUp();
  const fake = stubFetch();
  try {
    const values = { title: 'T', description: 'D', credit_name: 'C', third_party: 'yes', agree: 'yes', agreement_sha256: env.AGREEMENT_SHA256, 'cf-turnstile-response': 'x' };
    const asset = { asset_name: 'A', asset_rightsholder: 'R', asset_source: 'S', asset_license: 'L', asset_attribution: 'B', asset_evidence_url: 'https://example.org/l' };
    assert.deepEqual(Object.keys(values).concat('map').toSorted(), FORM_FIELDS.toSorted());
    assert.deepEqual(Object.keys(asset).concat('asset_evidence_file').toSorted(), ASSET_FIELDS.toSorted());
    const data = await form(env, { ...values, ...Object.fromEntries(Object.entries(asset).map(([k, v]) => [`${k}_0`, v])) }, { files: { asset_evidence_file_0: [new TextEncoder().encode('ok'), 'l.txt'] } });
    const { response, body } = await submit(env, data);
    assert.equal(response.status, 201, JSON.stringify(body));
    const record = JSON.parse(new TextDecoder().decode(env.FILES.objects.get(`submissions/${body.id}/record.json`).bytes));
    assert.deepEqual(
      [record.title, record.description, record.credit_name, record.third_party.assets[0].attribution, record.third_party.assets[0].evidence_url, record.third_party.assets[0].evidence_file.type],
      ['T', 'D', 'C', 'B', 'https://example.org/l', 'text/plain'],
    );
  } finally {
    fake.restore();
  }
});
