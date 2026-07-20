// Static site build: content/*.md -> index.html, posts/<slug>/index.html,
// sitemap.xml, feed.xml. Templates in templates/, shared CSS in styles.css
// (inlined into every page). No dependencies beyond the vendored marked.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "./vendor/marked.esm.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://blog.sertaoprofundo.com";
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fill = (tpl, vars) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

function parsePost(file) {
  const raw = readFileSync(join(ROOT, "content", file), "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing frontmatter`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  for (const req of ["title", "date", "excerpt", "image"]) {
    if (!meta[req]) throw new Error(`${file}: missing "${req}" in frontmatter`);
  }
  const [y, mo, d] = meta.date.split("-").map(Number);
  return {
    ...meta,
    slug: file.replace(/\.md$/, ""),
    iso: meta.date,
    dateDisplay: `${d} de ${MONTHS[mo - 1]} de ${y}`,
    pubDate: new Date(`${meta.date}T12:00:00Z`).toUTCString(),
    html: marked(m[2]).trim(),
  };
}

const styles = readFileSync(join(ROOT, "styles.css"), "utf8").trim();
const indexTpl = readFileSync(join(ROOT, "templates", "index.html"), "utf8");
const postTpl = readFileSync(join(ROOT, "templates", "post.html"), "utf8");

const posts = readdirSync(join(ROOT, "content"))
  .filter(f => f.endsWith(".md"))
  .map(parsePost)
  .sort((a, b) => b.iso.localeCompare(a.iso));

if (posts.length === 0) throw new Error("no posts in content/");

// Index cards: first image is the largest paint, load it eagerly.
const cards = posts.map((p, i) => {
  const eager = i === 0
    ? ' loading="eager" fetchpriority="high"'
    : ' loading="lazy"';
  const srcset = p.thumb480 && p.thumb960
    ? ` srcset="${p.thumb480} 480w, ${p.thumb960} 960w" sizes="(max-width: 720px) 100vw, 240px"`
    : "";
  return `<a href="/posts/${p.slug}/" class="post-card">` +
    `<img class="post-card-image" src="${p.thumb480 || p.image}"${srcset} alt="${esc(p.title)}" width="480" height="320"${eager}>` +
    `<div class="post-card-body">` +
    `<h2 class="post-card-title">${esc(p.title)}</h2>` +
    `<p class="post-card-excerpt">${esc(p.excerpt)}</p>` +
    `<time class="post-card-date" datetime="${p.iso}">${p.dateDisplay}</time>` +
    `</div></a>`;
}).join("\n");

writeFileSync(join(ROOT, "index.html"),
  fill(indexTpl, { site: SITE, styles, cards }));

for (const p of posts) {
  const dir = join(ROOT, "posts", p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), fill(postTpl, {
    site: SITE,
    styles,
    slug: p.slug,
    title: esc(p.title),
    excerpt: esc(p.excerpt),
    image: p.image,
    iso: p.iso,
    date: p.dateDisplay,
    content: p.html,
  }));
}

writeFileSync(join(ROOT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  `<url><loc>${SITE}/</loc></url>\n` +
  posts.map(p => `<url><loc>${SITE}/posts/${p.slug}/</loc><lastmod>${p.iso}</lastmod></url>`).join("\n") +
  `\n</urlset>\n`);

writeFileSync(join(ROOT, "feed.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<rss version="2.0"><channel>\n` +
  `<title>Diário · Sertão Profundo</title>\n` +
  `<link>${SITE}/</link>\n` +
  `<description>Histórias de moda autoral, cultura e memória do Nordeste.</description>\n` +
  `<language>pt-BR</language>\n` +
  posts.map(p =>
    `<item><title>${esc(p.title)}</title>` +
    `<link>${SITE}/posts/${p.slug}/</link>` +
    `<guid>${SITE}/posts/${p.slug}/</guid>` +
    `<pubDate>${p.pubDate}</pubDate>` +
    `<description>${esc(p.excerpt)}</description></item>`).join("\n") +
  `\n</channel></rss>\n`);

console.log(`built ${posts.length} post(s): index, post pages, sitemap, feed`);
