// Small helpers shared by the map submission Worker (ADR 0002). Web APIs only, so the tests run in plain Node.

const encoder = new TextEncoder();

export function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 of a string or bytes, as 64 lowercase hex characters.
export async function sha256(data) {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

// JSON with object keys sorted at every level: the same record always gives the same bytes, so its hash is stable.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function randomHex(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function cookies(request) {
  const header = request.headers.get('Cookie') ?? '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([k, v]) => k && v !== undefined)
      .map(([k, ...v]) => [k, v.join('=')]),
  );
}

// Plain text from a form field: trimmed, control characters dropped, at most `max` characters.
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

// A file name to show and record, never to build a path from: no directories, no control characters.
export function safeFilename(name) {
  const base = String(name ?? '').split(/[\\/]/).pop();
  return cleanText(base.replace(/[\r\n\t]/g, ' '), 100) || 'unnamed';
}
