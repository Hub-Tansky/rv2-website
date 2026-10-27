// The append-only event log of map submissions (D1 table `events`, ADR 0002). Each submission's events form a
// SHA-256 chain that starts from the hash of its stored record, so an edited or removed event, or a record that no
// longer matches its events, breaks the chain that /admin/verify walks.
import { canonicalJson, sha256 } from './util.js';

// Review states. `received` is set by the form; the others by the owner on the review pages.
export const STATUSES = ['received', 'in_review', 'needs_info', 'accepted', 'rejected', 'taken_down'];

const eventHash = (prevHash, event) =>
  sha256(`${prevHash}\n${canonicalJson({ submission_id: event.submission_id, at: event.at, actor: event.actor, kind: event.kind, status: event.status, note: event.note })}`);

// The statement that appends `event` to its submission's chain, for running alone or in a batch with the
// submission insert (then the row isn't there yet, and `receiptSha256` gives the chain start).
export async function eventStatement(db, event, receiptSha256 = null) {
  const last = await db.prepare('SELECT hash FROM events WHERE submission_id = ? ORDER BY seq DESC LIMIT 1').bind(event.submission_id).first();
  let prevHash = last?.hash ?? receiptSha256;
  if (!prevHash) prevHash = (await db.prepare('SELECT receipt_sha256 FROM submissions WHERE id = ?').bind(event.submission_id).first()).receipt_sha256;
  const hash = await eventHash(prevHash, event);
  return db
    .prepare('INSERT INTO events (submission_id, at, actor, kind, status, note, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(event.submission_id, event.at, event.actor, event.kind, event.status, event.note, prevHash, hash);
}

// Appends one event; a concurrent writer that took the same chain end makes the insert fail, so try once more.
export async function appendEvent(db, event) {
  for (let attempt = 0; ; attempt++) {
    try {
      await (await eventStatement(db, event)).run();
      return;
    } catch (error) {
      if (attempt > 0 || !/UNIQUE/i.test(String(error?.message))) throw error;
    }
  }
}

// { ok, count } over every submission's chain, or { ok: false, seq } with the first event that doesn't match.
export async function verifyChain(db) {
  const { results: subs } = await db.prepare('SELECT id, receipt_json, receipt_sha256 FROM submissions ORDER BY id').all();
  let count = 0;
  for (const s of subs) {
    if ((await sha256(s.receipt_json)) !== s.receipt_sha256) return { ok: false, submission: s.id, seq: null, count };
    const { results } = await db.prepare('SELECT * FROM events WHERE submission_id = ? ORDER BY seq').bind(s.id).all();
    let prev = s.receipt_sha256;
    for (const row of results) {
      count++;
      if (row.prev_hash !== prev || row.hash !== (await eventHash(prev, row))) return { ok: false, submission: s.id, seq: row.seq, count };
      prev = row.hash;
    }
  }
  return { ok: true, count };
}

export async function currentStatus(db, submissionId) {
  const row = await db.prepare('SELECT status FROM events WHERE submission_id = ? ORDER BY seq DESC LIMIT 1').bind(submissionId).first();
  return row?.status ?? null;
}
