// Player docs from the Robo2-docs vault (Hub-Tansky/rv2-docs, folder 10-public) as pages of the site (ADR 0004).
// Usage: node tools/build-docs.mjs <10-public folder> <site folder>. pages.yml runs it on a copy of website/ before
// deploying, so docs.html, docs/<slug>.html, docs/<slug>.md and docs/_attachments/ are never committed here.
// A missing or empty source folder still gives a docs.html that says no articles exist yet.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { marked } from 'marked';

const SITE = 'https://roboviolence.com/';

// Headings get GitHub-style ids, so links like console-commands.md#a-user-commands land.
export const headingId = (text) => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/ /g, '-');
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      return `<h${depth} id="${headingId(html)}">${html}</h${depth}>\n`;
    },
  },
});

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Flat YAML frontmatter only (key: value, quoted or bare), as the vault's AGENTS.md prescribes.
export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^".*"$/.test(v)) v = JSON.parse(v);
    else if (/^'.*'$/.test(v)) v = v.slice(1, -1);
    meta[kv[1]] = v;
  }
  return { meta, body: text.slice(m[0].length) };
}

// Links between vault notes (foo.md, foo.md#x) point at the built pages; everything else stays as written.
export function htmlLinks(html) {
  return html.replace(/href="([^"#:]+)\.md(#[^"]*)?"/g, (_, path, hash = '') => `href="${path}.html${hash}"`);
}

export function readArticles(src) {
  if (!src || !existsSync(src)) return [];
  return readdirSync(src)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map((file) => {
      const raw = readFileSync(join(src, file), 'utf8');
      const { meta, body } = frontmatter(raw);
      const slug = file.replace(/\.md$/, '');
      const title = meta.title || body.match(/^# (.+)$/m)?.[1] || slug;
      return { slug, title, description: meta.description || '', order: Number(meta.order ?? 1000), draft: meta.draft === 'true', body };
    })
    .filter((a) => !a.draft)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

// The site's chrome (head, menu, footer) from an existing page, so docs pages can never drift from the others.
function chrome(siteDir) {
  const html = readFileSync(join(siteDir, 'about.html'), 'utf8').replace(' aria-current="page"', '');
  return { head: html.slice(0, html.indexOf('<main')), foot: html.slice(html.indexOf('</main>') + '</main>'.length) };
}

// One page: title, description, canonical address, current menu entry; `up` = '../' for pages in docs/.
function page({ head, foot }, { path, title, description, md, main, up = '' }) {
  let top = head
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/https:\/\/roboviolence\.com\/about\.html/g, SITE + path)
    .replace('href="about.md"', `href="${md}"`)
    .replace('<a class="nav-link" href="docs.html">', '<a class="nav-link" href="docs.html" aria-current="page">');
  let bottom = foot;
  if (up) {
    // Relative addresses in the chrome are written for the site root.
    const fix = (s) => s.replace(/(href|src)="(?!https?:|#|\/|mailto:|data:)([^"]*)"/g, (_, a, u) => `${a}="${up}${u === './' ? '' : u}"`);
    top = fix(top).replace(`href="${up}${md}"`, `href="${md}"`);
    bottom = fix(bottom);
  }
  return `${top}<main class="page">\n  <div class="page-body site-container">\n    <div class="prose-rv">\n${main}\n    </div>\n  </div>\n</main>${bottom}`;
}

export function build(src, siteDir) {
  const articles = readArticles(src);
  const parts = chrome(siteDir);
  const docsDir = join(siteDir, 'docs');
  mkdirSync(docsDir, { recursive: true });
  if (src && existsSync(join(src, '_attachments'))) cpSync(join(src, '_attachments'), join(docsDir, '_attachments'), { recursive: true });

  for (const a of articles) {
    const main = htmlLinks(marked.parse(a.body));
    const html = page(parts, { path: `docs/${a.slug}.html`, title: a.title, description: a.description || a.title, md: `${a.slug}.md`, main, up: '../' });
    writeFileSync(join(docsDir, `${a.slug}.html`), html);
    writeFileSync(join(docsDir, `${a.slug}.md`), a.body.replace(/^\s+/, ''));
  }

  const listMd = articles.length
    ? articles.map((a) => `- [${a.title}](docs/${a.slug}.md)${a.description ? `: ${a.description}` : ''}`).join('\n')
    : 'No articles yet.';
  const md = `# Docs\n\nGuides for players and server hosts.\n\n${listMd}\n`;
  const items = articles.length
    ? `<ul>\n${articles.map((a) => `        <li><a href="docs/${a.slug}.html">${esc(a.title)}</a>${a.description ? `: ${esc(a.description)}` : ''}</li>`).join('\n')}\n      </ul>`
    : '<p>No articles yet.</p>';
  const main = `      <h1>Docs</h1>\n      <p>Guides for players and server hosts.</p>\n      ${items}`;
  writeFileSync(join(siteDir, 'docs.html'), page(parts, { path: 'docs.html', title: 'Robo Violence 2 docs', description: 'Guides for players and server hosts of Robo Violence 2.', md: 'docs.md', main }));
  writeFileSync(join(siteDir, 'docs.md'), md);

  // Built pages join the sitemap and llms.txt of the deployed copy.
  const urls = ['docs.html', ...articles.map((a) => `docs/${a.slug}.html`)].map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n');
  const sitemap = join(siteDir, 'sitemap.xml');
  writeFileSync(sitemap, readFileSync(sitemap, 'utf8').replace('</urlset>', `${urls}\n</urlset>`));
  const llms = join(siteDir, 'llms.txt');
  const docsLines = [`- [Docs](${SITE}docs.md): list of guides for players and server hosts`,
    ...articles.map((a) => `- [${a.title}](${SITE}docs/${a.slug}.md)${a.description ? `: ${a.description}` : ''}`)].join('\n');
  writeFileSync(llms, readFileSync(llms, 'utf8').replace('\n## Project', `\n## Docs\n\n${docsLines}\n\n## Project`));
  return articles;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src, site] = process.argv.slice(2);
  if (!site) {
    console.error('usage: node tools/build-docs.mjs <10-public folder> <site folder>');
    process.exit(2);
  }
  console.log(`docs: ${build(src, site).length} articles`);
}
