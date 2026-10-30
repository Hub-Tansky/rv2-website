// The submission agreement shown on the form and accepted with each map (ADR 0003).
// Its text lives only in the bucket, at agreements/<sha256>.txt, never in this repository. AGREEMENT_SHA256 picks the
// current one; the hash is the version that every record cites, so a stored text can't drift from what was accepted.
import { sha256 } from './util.js';

export const agreementKey = (hash) => `agreements/${hash}.txt`;

// The heading of the text's closing section: an intro line, "- " confirmations, and the acceptance statement last.
export const ACCEPTANCE_HEADING = 'Contributor Acceptance';

export function consentText(version) {
  return `I agree to the Robo Violence 2 Community Map Submission Agreement, version ${version}.`;
}

// Splits the stored text into the terms and its acceptance section. A text without that section is all terms and
// gets the default statement.
export function splitAgreement(text, version) {
  const lines = text.split('\n');
  const at = lines.findLastIndex((line) => line.trim() === ACCEPTANCE_HEADING);
  if (at < 0) return { terms: text, intro: '', confirmations: [], consent: consentText(version) };
  const rest = lines.slice(at + 1).map((line) => line.trim()).filter(Boolean);
  const confirmations = rest.filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim());
  const others = rest.filter((line) => !line.startsWith('- '));
  const consent = others.length > 1 ? others.at(-1) : consentText(version);
  const intro = others.length > 1 ? others.slice(0, -1).join(' ') : (others[0] ?? '');
  const terms = lines.slice(0, at).join('\n').replace(/\s*-{3,}\s*$/, '').trimEnd() + '\n';
  return { terms, intro, confirmations, consent };
}

const cache = new Map();

// { version, sha256, text, terms, intro, confirmations, consent } for the current agreement, or null while none is
// configured (form closed).
export async function currentAgreement(env) {
  const hash = env.AGREEMENT_SHA256;
  if (!/^[0-9a-f]{64}$/.test(hash ?? '') || !env.AGREEMENT_VERSION) return null;
  if (!cache.has(hash)) {
    const object = await env.FILES.get(agreementKey(hash));
    if (!object) return null;
    const text = await object.text();
    if ((await sha256(text)) !== hash) throw new Error(`${agreementKey(hash)} does not match its hash`);
    cache.set(hash, text);
  }
  const text = cache.get(hash);
  return { version: env.AGREEMENT_VERSION, sha256: hash, text, ...splitAgreement(text, env.AGREEMENT_VERSION) };
}

export function clearAgreementCacheForTests() {
  cache.clear();
}
