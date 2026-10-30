// POST /api/submissions: checks a map submission, stores the files and an immutable record, and answers with the
// receipt the form shows (ADR 0003). Field names match website/submit-map.html.
import { currentAgreement } from './agreement.js';
import { MAX_MAP_BYTES, readMapHeader } from './bvm.js';
import { eventStatement } from './records.js';
import { canonicalJson, cleanText, randomHex, safeFilename, sha256 } from './util.js';

export const LIMITS = {
  title: 60,
  description: 500,
  creditName: 40,
  assetText: 200,
  assetLicense: 500,
  assets: 10,
  evidenceBytes: 4 * 1024 * 1024,
  requestBytes: 24 * 1024 * 1024,
};

// The form's field names (website/submit-map.html); asset fields carry a _0 to _9 suffix.
export const FORM_FIELDS = ['title', 'description', 'credit_name', 'map', 'third_party', 'agree', 'agreement_sha256', 'cf-turnstile-response'];
export const ASSET_FIELDS = ['asset_name', 'asset_rightsholder', 'asset_source', 'asset_license', 'asset_attribution', 'asset_evidence_url', 'asset_evidence_file'];

const EVIDENCE_TYPES = [
  { type: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  { type: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
];

// The evidence file's real type from its first bytes; plain text when it is valid UTF-8 without NUL bytes.
export function evidenceType(bytes) {
  const data = new Uint8Array(bytes);
  const known = EVIDENCE_TYPES.find((t) => t.magic.every((b, i) => data[i] === b));
  if (known) return known;
  if (data.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data);
    return { type: 'text/plain', ext: 'txt' };
  } catch {
    return null;
  }
}

const isFile = (value) => value && typeof value === 'object' && typeof value.arrayBuffer === 'function';

const isUrl = (text) => {
  try {
    return ['https:', 'http:'].includes(new URL(text).protocol);
  } catch {
    return false;
  }
};

async function verifyTurnstile(token, env, fetcher) {
  if (!token) return false;
  const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
  });
  return response.ok && (await response.json()).success === true;
}

// Reads and checks the form. { errors } keyed by field name, or { fields, map, assets } ready to store.
export async function readForm(form, agreement) {
  const errors = {};
  const text = (name, max) => cleanText(form.get(name), max);
  const title = text('title', LIMITS.title);
  if (!title) errors.title = 'Give the map a title.';
  const description = text('description', LIMITS.description);
  const creditName = text('credit_name', LIMITS.creditName);
  if (!creditName) errors.credit_name = 'Give the name to credit you with.';

  let map = null;
  const file = form.get('map');
  if (!isFile(file) || file.size === 0) errors.map = 'Choose your .bvm map file.';
  else if (!/\.bvm$/i.test(file.name)) errors.map = 'The map file must end in .bvm.';
  else if (file.size > MAX_MAP_BYTES) errors.map = `The map file is larger than ${MAX_MAP_BYTES / 1024} kB.`;
  else {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = readMapHeader(bytes);
    if (header.error) errors.map = header.error;
    else map = { bytes, filename: safeFilename(file.name), header };
  }

  const thirdParty = form.get('third_party');
  if (thirdParty !== 'none' && thirdParty !== 'yes') errors.third_party = 'Say whether the map includes third-party assets.';
  const assets = [];
  if (thirdParty === 'yes') {
    for (let i = 0; i < LIMITS.assets; i++) {
      const name = text(`asset_name_${i}`, LIMITS.assetText);
      const fields = {
        rightsholder: text(`asset_rightsholder_${i}`, LIMITS.assetText),
        source: text(`asset_source_${i}`, LIMITS.assetText),
        license: text(`asset_license_${i}`, LIMITS.assetLicense),
        attribution: text(`asset_attribution_${i}`, LIMITS.assetText),
        evidenceUrl: text(`asset_evidence_url_${i}`, LIMITS.assetText),
      };
      const evidence = form.get(`asset_evidence_file_${i}`);
      const hasEvidenceFile = isFile(evidence) && evidence.size > 0;
      if (!name && !Object.values(fields).some(Boolean) && !hasEvidenceFile) continue;
      if (!name) errors[`asset_name_${i}`] = 'Name the asset.';
      if (!fields.rightsholder) errors[`asset_rightsholder_${i}`] = 'Name the creator or rights holder.';
      if (!fields.source) errors[`asset_source_${i}`] = 'Say where the asset comes from.';
      if (!fields.license) errors[`asset_license_${i}`] = 'Give the licence or permission.';
      if (fields.evidenceUrl && !isUrl(fields.evidenceUrl)) errors[`asset_evidence_url_${i}`] = 'Give a full web address (https://...).';
      let file = null;
      if (hasEvidenceFile) {
        if (evidence.size > LIMITS.evidenceBytes) errors[`asset_evidence_file_${i}`] = 'Evidence files can be at most 4 MB.';
        else {
          const bytes = new Uint8Array(await evidence.arrayBuffer());
          const type = evidenceType(bytes);
          if (!type) errors[`asset_evidence_file_${i}`] = 'Evidence must be a PDF, PNG, JPEG or plain text file.';
          else file = { bytes, filename: safeFilename(evidence.name), ...type };
        }
      }
      assets.push({ index: i, name, ...fields, file });
    }
    if (assets.length === 0) errors.asset_name_0 = 'List at least one third-party asset, or choose "No third-party assets".';
  }

  if (form.get('agreement_sha256') !== agreement.sha256) errors.agree = 'The agreement changed while the form was open. Reload the page and read it again.';
  else if (form.get('agree') !== 'yes') errors.agree = 'Tick the box to accept the agreement.';

  if (Object.keys(errors).length) return { errors };
  return { fields: { title, description, creditName }, map, assets };
}

export async function handleSubmission(request, env, ctx, user, fetcher = fetch, now = () => new Date()) {
  const json = (status, body) => Response.json(body, { status });
  if (!user) return json(401, { error: 'signin', message: 'Sign in with Discord first.' });
  const agreement = await currentAgreement(env);
  if (!agreement) return json(503, { error: 'closed', message: 'Map submissions are not open yet.' });
  if (Number(request.headers.get('Content-Length') ?? 0) > LIMITS.requestBytes) {
    return json(413, { error: 'too_large', message: 'The files together are larger than 24 MB.' });
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: 'bad_form', message: 'The form could not be read. Reload the page and try again.' });
  }
  const parsed = await readForm(form, agreement);
  if (parsed.errors) return json(422, { error: 'invalid', errors: parsed.errors });

  if (!(await verifyTurnstile(form.get('cf-turnstile-response'), env, fetcher))) {
    return json(422, { error: 'invalid', errors: { turnstile: 'The human check failed or expired. Try it again.' } });
  }
  const perDay = Number(env.SUBMISSIONS_PER_DAY ?? 5);
  const since = new Date(now().getTime() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions WHERE discord_id = ? AND received_at > ?').bind(user.id, since).first();
  if (recent.n >= perDay) return json(429, { error: 'limit', message: `You can submit up to ${perDay} maps a day. Try again tomorrow.` });

  const receivedAt = now().toISOString();
  const id = `M-${receivedAt.slice(0, 10).replace(/-/g, '')}-${randomHex(4)}`;
  const prefix = `submissions/${id}`;
  const { fields, map, assets } = parsed;

  const mapSha = await sha256(map.bytes);
  const mapKey = `${prefix}/map.bvm`;
  const puts = [[mapKey, map.bytes, 'application/octet-stream']];
  const disclosed = [];
  for (const asset of assets) {
    let evidenceFile = null;
    if (asset.file) {
      const key = `${prefix}/evidence-${asset.index}.${asset.file.ext}`;
      evidenceFile = { filename: asset.file.filename, type: asset.file.type, size: asset.file.bytes.length, sha256: await sha256(asset.file.bytes), key };
      puts.push([key, asset.file.bytes, asset.file.type]);
    }
    disclosed.push({
      name: asset.name,
      rightsholder: asset.rightsholder,
      source: asset.source,
      license: asset.license,
      attribution: asset.attribution,
      evidence_url: asset.evidenceUrl || null,
      evidence_file: evidenceFile,
      evidence_missing: !asset.evidenceUrl && !evidenceFile,
    });
  }

  const record = {
    record_format: 1,
    submission_id: id,
    received_at: receivedAt,
    account: { provider: 'discord', id: user.id, username: user.username, global_name: user.globalName },
    credit_name: fields.creditName,
    title: fields.title,
    description: fields.description,
    map: {
      filename: map.filename,
      size: map.bytes.length,
      sha256: mapSha,
      key: mapKey,
      format: 'bvm',
      version: map.header.version,
      width: map.header.width,
      height: map.header.height,
      author_in_file: map.header.author,
    },
    agreement: { version: agreement.version, sha256: agreement.sha256, key: `agreements/${agreement.sha256}.txt` },
    acceptance: { action: 'Submit map and accept agreement', consent_text: agreement.consent, accepted_at: receivedAt },
    third_party: { declared: assets.length > 0, assets: disclosed },
    service: { worker_release: env.RELEASE ?? 'dev' },
  };
  const receipt = canonicalJson(record);
  const receiptSha = await sha256(receipt);
  puts.push([`${prefix}/record.json`, receipt, 'application/json']);

  for (const [key, body, type] of puts) await env.FILES.put(key, body, { httpMetadata: { contentType: type } });

  const missingEvidence = disclosed.filter((d) => d.evidence_missing).length;
  const insert = env.DB.prepare(
    'INSERT INTO submissions (id, received_at, discord_id, discord_username, credit_name, title, map_filename, map_sha256, agreement_version, agreement_sha256, third_party_count, missing_evidence, receipt_json, receipt_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, receivedAt, user.id, user.username, fields.creditName, fields.title, map.filename, mapSha, agreement.version, agreement.sha256, disclosed.length, missingEvidence, receipt, receiptSha);
  const event = {
    submission_id: id,
    at: receivedAt,
    actor: `discord:${user.id}`,
    kind: 'submitted',
    status: 'received',
    note: missingEvidence ? `${missingEvidence} third-party asset(s) without evidence: check before accepting` : '',
  };
  for (let attempt = 0; ; attempt++) {
    try {
      await env.DB.batch([insert, await eventStatement(env.DB, event, receiptSha)]);
      break;
    } catch (error) {
      if (attempt > 0 || !/UNIQUE/i.test(String(error?.message))) throw error;
    }
  }

  if (env.REVIEW_WEBHOOK_URL) {
    const notice = fetcher(env.REVIEW_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `New map submission ${id}: "${fields.title}" by ${fields.creditName}. Review: ${env.API_ORIGIN}/admin/s/${id}`,
        allowed_mentions: { parse: [] },
      }),
    }).catch(() => {});
    ctx?.waitUntil?.(notice);
  }

  return json(201, {
    id,
    received_at: receivedAt,
    map: { filename: map.filename, size: map.bytes.length, sha256: mapSha },
    agreement_version: agreement.version,
    agreement_sha256: agreement.sha256,
    third_party_count: disclosed.length,
    missing_evidence: missingEvidence,
    receipt_sha256: receiptSha,
  });
}
