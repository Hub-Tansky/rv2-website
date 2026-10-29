// Map submission form (submit-map.html, ADR 0003). The service at submit.roboviolence.com signs players in with
// Discord, serves the agreement and stores submissions; this module only drives the form.
// The exports are for tests/website/site.test.mjs; the DOM part runs only in a browser.

export const API = 'https://submit.roboviolence.com';
export const MAX_MAP_BYTES = 256 * 1024;
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
export const MAX_ASSETS = 10;
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// What the browser can check before upload; the service checks the file content again.
export function mapFileProblem(file) {
  if (!file) return 'Choose your .bvm map file.';
  if (!/\.bvm$/i.test(file.name)) return 'The map file must end in .bvm.';
  if (file.size === 0) return 'The map file is empty.';
  if (file.size > MAX_MAP_BYTES) return 'The map file is larger than 256 kB.';
  return '';
}

export function evidenceFileProblem(file) {
  if (!file) return '';
  if (!/\.(pdf|png|jpe?g|txt)$/i.test(file.name)) return 'Evidence must be a PDF, PNG, JPEG or plain text file.';
  if (file.size > MAX_EVIDENCE_BYTES) return 'Evidence files can be at most 4 MB.';
  return '';
}

// The receipt lines shown after a successful submission.
export function receiptLines(r) {
  return [
    ['Submission ID', r.id],
    ['Received (UTC)', r.received_at],
    ['Map file', `${r.map.filename} (${r.map.size} bytes)`],
    ['Map SHA-256', r.map.sha256],
    ['Agreement version', `${r.agreement_version} (SHA-256 ${r.agreement_sha256})`],
    ['Third-party assets declared', String(r.third_party_count)],
    ...(r.missing_evidence ? [['Assets without evidence', `${r.missing_evidence}: these are checked by hand before the map is accepted`]] : []),
    ['Record fingerprint (SHA-256)', r.receipt_sha256],
  ];
}

export const SIGNIN_PROBLEMS = {
  expired: 'The Discord sign-in took too long. Try again.',
  cancelled: 'The Discord sign-in was cancelled.',
  failed: 'Discord sign-in failed. Try again in a moment.',
};

const $ = (id) => document.getElementById(id);

function say(text) {
  const status = $('status');
  status.textContent = text;
  status.hidden = !text;
}

// The Turnstile script loads only for signed-in players, so other visitors never contact Cloudflare.
function loadTurnstile() {
  if (typeof globalThis.turnstile?.render === 'function') return Promise.resolve(globalThis.turnstile);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => resolve(globalThis.turnstile);
    script.onerror = reject;
    document.head.append(script);
  });
}

function setUpForm(form, agreement, user) {
  let token = '';
  let widget = null;
  const button = $('submit-button');
  const assetList = $('asset-list');

  $('account').value = `${user.username} (Discord ID ${user.id})`;
  form.elements.credit_name.value = user.globalName || user.username;
  $('agreement-version').textContent = agreement.version;
  $('agreement-text').textContent = agreement.text;
  $('agreement-print').href = agreement.print_url;
  $('consent-text').textContent = agreement.consent;
  form.elements.agreement_sha256.value = agreement.sha256;

  const errorSpan = (input) => {
    let span = form.querySelector(`[data-error-for="${input.name}"]`);
    if (!span) {
      span = document.createElement('span');
      span.className = 'field-error';
      span.dataset.errorFor = input.name;
      span.hidden = true;
      input.closest('label, .field')?.append(span);
    }
    return span;
  };
  const showError = (name, message) => {
    const input = form.elements[name];
    const span = input instanceof Element ? errorSpan(input) : form.querySelector(`[data-error-for="${name}"]`);
    if (input instanceof Element) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (span) {
      span.textContent = message;
      span.hidden = !message;
    }
  };
  const clearErrors = () => {
    for (const span of form.querySelectorAll('[data-error-for]')) span.hidden = true;
    for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
    $('form-error').hidden = true;
  };

  const update = () => {
    form.elements.map.setCustomValidity(mapFileProblem(form.elements.map.files[0]));
    for (const input of form.querySelectorAll('input[type=file][name^="asset_evidence_file_"]')) input.setCustomValidity(evidenceFileProblem(input.files[0]));
    const thirdParty = form.elements.third_party.value === 'yes';
    $('assets').hidden = !thirdParty;
    for (const input of assetList.querySelectorAll('input, textarea')) input.disabled = !thirdParty;
    if (thirdParty && assetList.children.length === 0) addAsset();
    button.disabled = !(form.checkValidity() && token);
  };

  const renumber = () => {
    [...assetList.children].forEach((entry, i) => {
      entry.querySelector('[data-number]').textContent = String(i + 1);
      for (const input of entry.querySelectorAll('[data-name]')) input.name = `${input.dataset.name}_${i}`;
    });
    $('add-asset').disabled = assetList.children.length >= MAX_ASSETS;
  };
  function addAsset() {
    if (assetList.children.length >= MAX_ASSETS) return;
    const entry = $('asset-template').content.firstElementChild.cloneNode(true);
    entry.querySelector('[data-remove]').addEventListener('click', () => {
      entry.remove();
      renumber();
      update();
    });
    assetList.append(entry);
    renumber();
    globalThis.lucide?.createIcons();
  }
  $('add-asset').addEventListener('click', () => {
    addAsset();
    update();
  });

  form.addEventListener('input', update);
  form.addEventListener('change', (event) => {
    if (event.target === form.elements.map) showError('map', mapFileProblem(event.target.files[0]));
    else if (event.target.name?.startsWith('asset_evidence_file_')) showError(event.target.name, evidenceFileProblem(event.target.files[0]));
    update();
  });

  $('signout').addEventListener('click', async () => {
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    location.reload();
  });

  loadTurnstile()
    .then((turnstile) => {
      widget = turnstile.render('#human-check', {
        sitekey: agreement.turnstile_site_key,
        theme: 'dark',
        callback: (t) => {
          token = t;
          update();
        },
        'expired-callback': () => {
          token = '';
          update();
        },
      });
    })
    .catch(() => showError('turnstile', 'The human check could not load. Allow challenges.cloudflare.com or try another browser.'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    update();
    if (button.disabled) return;
    clearErrors();
    button.disabled = true;
    say('Uploading your map...');
    let response;
    let body;
    try {
      response = await fetch(`${API}/api/submissions`, { method: 'POST', credentials: 'include', body: new FormData(form) });
      body = await response.json();
    } catch {
      body = { message: 'The upload failed. Check your connection and try again.' };
    }
    say('');
    if (response?.status === 201) {
      form.hidden = true;
      $('receipt-list').replaceChildren(
        ...receiptLines(body).map(([label, value]) => {
          const item = document.createElement('li');
          const strong = document.createElement('strong');
          strong.textContent = `${label}: `;
          const code = document.createElement('code');
          code.textContent = value;
          item.append(strong, code);
          return item;
        }),
      );
      $('receipt').hidden = false;
      $('receipt').scrollIntoView();
      return;
    }
    if (response?.status === 401) {
      location.reload();
      return;
    }
    // A token is good for one check: get a new one before the next try. The form keeps everything typed.
    token = '';
    if (widget !== null) globalThis.turnstile?.reset(widget);
    for (const [name, message] of Object.entries(body.errors ?? {})) showError(name, message);
    const general = body.errors ? 'Some fields need attention: see the messages above.' : body.message;
    $('form-error').textContent = general || 'The submission failed. Try again.';
    $('form-error').hidden = false;
    form.querySelector('[aria-invalid="true"]')?.focus();
    update();
  });

  update();
}

async function main() {
  const form = $('submit-form');
  if (!form) return;
  const signinProblem = SIGNIN_PROBLEMS[new URLSearchParams(location.search).get('signin')];
  let agreement;
  let user;
  try {
    const [a, me] = await Promise.all([fetch(`${API}/api/agreement`), fetch(`${API}/api/me`, { credentials: 'include' })]);
    if (a.status === 503) {
      say('Map submissions are not open yet. Watch the Discord server for the announcement.');
      return;
    }
    if (!a.ok || !me.ok) throw new Error('service');
    agreement = await a.json();
    user = await me.json();
  } catch {
    say('The submission service can\'t be reached right now. Try again later.');
    return;
  }
  if (!user.signed_in) {
    say(signinProblem ?? 'Sign in with Discord to open the form.');
    $('signin-link').href = `${API}/auth/login`;
    $('signin').hidden = false;
    return;
  }
  say('');
  form.hidden = false;
  setUpForm(form, agreement, user);
}

if (typeof document !== 'undefined') main();
