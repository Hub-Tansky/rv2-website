// The submission agreement shown on the form and accepted with each map (ADR 0002).
// Its text lives only in the bucket, at agreements/<sha256>.txt, never in this repository. AGREEMENT_SHA256 picks the
// current one; the hash is the version that every record cites, so a stored text can't drift from what was accepted.
import { sha256 } from './util.js';

export const agreementKey = (hash) => `agreements/${hash}.txt`;

export function consentText(version) {
  return (
    `I have read and agree to the Robo Violence 2 Community Map Submission Agreement, version ${version}. ` +
    'I confirm that I have the rights and authority described in it, and that my third-party asset disclosures are complete.'
  );
}

const cache = new Map();

// { version, sha256, text, consent } for the current agreement, or null while none is configured (form closed).
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
  return { version: env.AGREEMENT_VERSION, sha256: hash, text: cache.get(hash), consent: consentText(env.AGREEMENT_VERSION) };
}

export function clearAgreementCacheForTests() {
  cache.clear();
}
