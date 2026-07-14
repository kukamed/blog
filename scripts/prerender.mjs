// Bakes the Soro post list into index.html so content renders before any JS.
// The embed script replaces #soro-blog's innerHTML on load, so the baked
// markup must mirror renderList() in https://app.trysoro.com/api/embed/<id>.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const EMBED_URL = "https://app.trysoro.com/api/embed/c5228703-9f48-4d86-b9ae-ea922c4627b5";
const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
const START = "<!-- soro-static:start -->";
const END = "<!-- soro-static:end -->";

const escapeHtml = s =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const resized = (url, w) =>
  url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
  `?width=${w}&quality=75&resize=contain`;

const js = await (await fetch(EMBED_URL)).text();
const line = js.split("\n").find(l => l.includes("var SORO_ARTICLES ="));
if (!line) throw new Error("SORO_ARTICLES not found in embed script");
const articles = JSON.parse(line.slice(line.indexOf("["), line.lastIndexOf("]") + 1));
if (!Array.isArray(articles) || articles.length === 0) throw new Error("no articles parsed — refusing to bake an empty list");

let cards = "";
articles.forEach((a, i) => {
  const eager = i === 0 ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"';
  let img = "";
  if (a.image) {
    const opt = a.image.includes("/storage/v1/object/public/")
      ? ` srcset="${resized(a.image, 480)} 480w, ${resized(a.image, 960)} 960w" sizes="(max-width: 720px) 100vw, 240px"`
      : "";
    img = `<img class="soro-blog-card-image" src="${a.image}"${opt} alt="${escapeHtml(a.title)}"${eager} data-tuned="1" itemprop="image">`;
  }
  cards +=
    `<a href="/?post=${a.slug}" class="soro-blog-card" data-slug="${escapeHtml(a.slug)}" itemscope itemtype="https://schema.org/BlogPosting">` +
    img +
    `<div class="soro-blog-card-content">` +
    `<h2 class="soro-blog-card-title" itemprop="headline">${escapeHtml(a.title)}</h2>` +
    `<p class="soro-blog-card-excerpt" itemprop="description">${escapeHtml(a.excerpt)}</p>` +
    `<time class="soro-blog-card-date" datetime="${a.isoDate}" itemprop="datePublished">${a.date}</time>` +
    `</div></a>`;
});

const snapshot =
  `${START}<div class="soro-static"><div class="soro-blog"><div class="soro-blog-content">` +
  `<section class="soro-blog-list" role="feed" aria-label="Artigos do blog">${cards}</section>` +
  `</div></div></div>${END}`;

const html = readFileSync(INDEX, "utf8");
const startIdx = html.indexOf(START);
const endIdx = html.indexOf(END);
if (startIdx === -1 || endIdx === -1) throw new Error("soro-static markers not found in index.html");
writeFileSync(INDEX, html.slice(0, startIdx) + snapshot + html.slice(endIdx + END.length));
console.log(`baked ${articles.length} article(s) into index.html`);
