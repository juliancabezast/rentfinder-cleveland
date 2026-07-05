// render.mjs — pure functions that turn taxonomy + article JSON into static HTML.
// No side effects, no fs. The generator imports these and writes files.
//
// Design goals:
//  - Fast: one small shared stylesheet (cached across the hub), no JS, no images.
//  - Crawlable: real content in the initial HTML, semantic headings, breadcrumbs.
//  - GEO-friendly: answer-first lead paragraph, FAQ blocks, entity-consistent NAP,
//    visible "last updated" date, rich JSON-LD.
//  - Brand values come ONLY from taxonomy `config` — nothing hardcoded here.

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

export function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Attribute-safe (for href/content values inside double quotes)
function escAttr(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// A safe internal/external href: absolute site path or https URL only.
function safeHref(href) {
  const h = String(href || "").trim();
  if (h.startsWith("/") || h.startsWith("https://") || h.startsWith("mailto:") || h.startsWith("tel:")) {
    return h;
  }
  return "#";
}

// Inline markup: escape first, then apply **bold** and [text](href).
// Only these two tokens are supported (validator enforces the same).
export function renderInline(text = "") {
  let out = esc(text);
  // links: [label](href) — label may contain escaped entities, href must be safe
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, href) => {
    const h = safeHref(href.trim());
    const ext = h.startsWith("https://");
    const rel = ext ? ' rel="noopener"' : "";
    const tgt = ext ? ' target="_blank"' : "";
    return `<a href="${escAttr(h)}"${tgt}${rel}>${label}</a>`;
  });
  // bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

function para(text) {
  return `<p>${renderInline(text)}</p>`;
}

function wordCount(article) {
  let n = 0;
  const bump = (t) => { n += String(t || "").trim().split(/\s+/).filter(Boolean).length; };
  bump(article.answerBox);
  for (const s of article.sections || []) {
    (s.body || []).forEach(bump);
    for (const h of s.h3s || []) (h.body || []).forEach(bump);
    for (const it of s.list?.items || []) bump(it);
    for (const row of s.table?.rows || []) row.forEach(bump);
  }
  for (const f of article.faq || []) { bump(f.q); bump(f.a); }
  return n;
}

function readingMinutes(words) {
  return Math.max(2, Math.round(words / 220));
}

// Human date "July 4, 2026" from YYYY-MM-DD
function humanDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[(m || 1) - 1]} ${d}, ${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// URL builders (single source of truth for the URL architecture)
// ─────────────────────────────────────────────────────────────────────────────

export function articlePath(cfg, article) {
  return `${cfg.hubBase}/${article.cluster}/${article.slug}/`;
}
export function clusterHubPath(cfg, clusterKey) {
  return `${cfg.hubBase}/${clusterKey}/`;
}
export function masterHubPath(cfg) {
  return `${cfg.hubBase}/`;
}
export function pillarPath(cfg, pillar) {
  return `/${pillar.slug}/`;
}
export function absUrl(cfg, path) {
  return `${cfg.domain}${path}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared CSS (written once to /cleveland-rentals/assets/rentals.css)
// Current brand: indigo #4F46E5, gold #FFB22C, cool-gray bg, Montserrat.
// ─────────────────────────────────────────────────────────────────────────────

export const STYLES = `
:root{
  --indigo:#4F46E5;--indigo-600:#4F46E5;--indigo-500:#6366F1;--indigo-050:#eef2ff;
  --gold:#FFB22C;--ink:#111827;--body:#374151;--muted:#6b7280;--line:#e5e7eb;
  --bg:#f3f4f6;--card:#ffffff;--radius:14px;--maxw:760px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:var(--bg);color:var(--body);line-height:1.7;font-size:17px;
  display:flex;flex-direction:column;min-height:100vh}
a{color:var(--indigo);text-decoration:none}
a:hover{text-decoration:underline}
strong{color:var(--ink);font-weight:600}
img{max-width:100%;height:auto}

/* Header */
.site-header{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.85);
  backdrop-filter:saturate(1.8) blur(16px);border-bottom:1px solid var(--line)}
.hdr-inner{max-width:1100px;margin:0 auto;padding:12px 20px;display:flex;
  align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--ink);font-size:17px}
.brand:hover{text-decoration:none}
.brand-mark{width:34px;height:34px;border-radius:9px;background:var(--indigo);color:#fff;
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}
.hdr-actions{display:flex;align-items:center;gap:14px}
.hdr-phone{font-weight:600;color:var(--ink);font-size:15px;white-space:nowrap}
.hdr-phone:hover{color:var(--indigo);text-decoration:none}
.btn{display:inline-block;background:var(--indigo);color:#fff;font-weight:600;
  padding:10px 18px;border-radius:10px;font-size:15px;transition:background .15s,transform .1s;
  border:none;cursor:pointer;text-align:center}
.btn:hover{background:#4338ca;text-decoration:none;color:#fff}
.btn:active{transform:scale(.98)}
.btn-gold{background:var(--gold);color:#3a2a00}
.btn-gold:hover{background:#f0a417;color:#3a2a00}
.btn-ghost{background:#fff;color:var(--indigo);border:1.5px solid var(--indigo)}
.btn-ghost:hover{background:var(--indigo-050);color:var(--indigo)}

/* Layout */
main{flex:1;width:100%}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 20px}
.wrap-wide{max-width:1100px;margin:0 auto;padding:0 20px}

/* Breadcrumb */
.crumb{max-width:var(--maxw);margin:18px auto 0;padding:0 20px;font-size:13px;color:var(--muted)}
.crumb ol{list-style:none;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.crumb li::after{content:"›";margin-left:6px;color:#c4c9d2}
.crumb li:last-child::after{content:""}
.crumb a{color:var(--muted)}
.crumb li:last-child{color:var(--ink);font-weight:600}

/* Article */
article{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
  margin:16px auto 40px;padding:34px 30px;box-shadow:0 1px 3px rgba(16,24,40,.04)}
.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:700;
  color:var(--indigo);margin-bottom:10px}
h1{font-size:clamp(26px,4.5vw,36px);line-height:1.2;color:var(--ink);font-weight:800;margin-bottom:14px}
.answer-box{font-size:19px;line-height:1.6;color:var(--ink);background:var(--indigo-050);
  border-left:4px solid var(--indigo);border-radius:0 10px 10px 0;padding:16px 18px;margin:6px 0 18px}
.meta-row{font-size:13px;color:var(--muted);margin-bottom:22px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.meta-row .dot{color:#c4c9d2}
article h2{font-size:clamp(21px,3vw,26px);color:var(--ink);font-weight:700;margin:32px 0 12px;
  padding-top:6px;line-height:1.3}
article h3{font-size:19px;color:var(--ink);font-weight:600;margin:22px 0 8px}
article p{margin:0 0 16px}
article ul,article ol{margin:0 0 18px;padding-left:22px}
article li{margin-bottom:8px}
.tbl-wrap{overflow-x:auto;margin:0 0 20px}
article table{border-collapse:collapse;width:100%;font-size:15px;min-width:400px}
article th,article td{border:1px solid var(--line);padding:9px 12px;text-align:left;vertical-align:top}
article th{background:#f9fafb;font-weight:600;color:var(--ink)}
article tr:nth-child(even) td{background:#fcfcfd}

/* Inline CTA */
.cta-inline{background:linear-gradient(135deg,var(--indigo) 0%,var(--indigo-500) 100%);
  color:#fff;border-radius:12px;padding:20px 22px;margin:26px 0;display:flex;
  align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.cta-inline .cta-txt{font-weight:600;font-size:16px;max-width:60ch}
.cta-inline .cta-txt small{display:block;font-weight:400;opacity:.9;font-size:13px;margin-top:3px}

/* FAQ */
.faq{margin-top:34px;border-top:1px solid var(--line);padding-top:22px}
.faq h2{margin-top:0}
.faq details{border:1px solid var(--line);border-radius:10px;margin-bottom:10px;background:#fff}
.faq summary{cursor:pointer;font-weight:600;color:var(--ink);padding:14px 16px;list-style:none;
  font-size:16px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--indigo);font-weight:700;font-size:20px}
.faq details[open] summary::after{content:"–"}
.faq details[open] summary{border-bottom:1px solid var(--line)}
.faq .faq-a{padding:14px 16px;color:var(--body);font-size:15.5px}

/* Related / hub grids */
.related{margin-top:34px;border-top:1px solid var(--line);padding-top:20px}
.related h2{margin-top:0;font-size:20px}
.link-list{list-style:none;padding:0;display:grid;gap:8px}
.link-list a{display:block;padding:11px 14px;background:#f9fafb;border:1px solid var(--line);
  border-radius:10px;color:var(--ink);font-weight:500;font-size:15px}
.link-list a:hover{background:var(--indigo-050);border-color:var(--indigo);text-decoration:none}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;margin:18px 0}
.hub-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;
  display:flex;flex-direction:column;gap:8px}
.hub-card h3{margin:0;font-size:18px;color:var(--ink)}
.hub-card p{margin:0;font-size:14px;color:var(--muted)}
.hub-card a.card-link{margin-top:auto;font-weight:600;font-size:14px}

/* Disclaimer */
.disclaimer{margin-top:26px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--line);
  padding-top:14px;line-height:1.6}

/* Big CTA block */
.cta-block{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
  padding:30px 26px;margin:16px auto 40px;text-align:center;box-shadow:0 1px 3px rgba(16,24,40,.04)}
.cta-block h2{font-size:24px;color:var(--ink);margin-bottom:8px}
.cta-block p{color:var(--muted);margin:0 auto 18px;max-width:52ch}
.cta-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}

/* Hub hero */
.hub-hero{background:linear-gradient(135deg,var(--indigo) 0%,var(--indigo-500) 100%);color:#fff;
  padding:52px 20px 44px;text-align:center}
.hub-hero h1{color:#fff}
.hub-hero p{max-width:620px;margin:12px auto 0;opacity:.94;font-size:17px}
.hub-hero .eyebrow{color:var(--gold)}

/* Footer */
.site-footer{background:var(--ink);color:#cbd0d8;padding:34px 20px;font-size:14px;line-height:1.9;margin-top:auto}
.foot-inner{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;justify-content:space-between;gap:24px}
.site-footer a{color:var(--gold)}
.foot-brand{font-weight:700;color:#fff;font-size:16px;margin-bottom:6px;display:block}
.foot-links{display:flex;flex-wrap:wrap;gap:14px;margin-top:6px}
.foot-legal{width:100%;border-top:1px solid #2a3140;margin-top:18px;padding-top:14px;font-size:12px;color:#8b93a1}

@media(max-width:640px){
  body{font-size:16px}
  article{padding:24px 18px;border-radius:12px}
  .cta-inline{flex-direction:column;align-items:flex-start}
}
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// Shared chrome (header/footer) + <head>
// ─────────────────────────────────────────────────────────────────────────────

function brandMark(cfg) {
  const initials = (cfg.brandName || "RF").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return initials;
}

function header(cfg, primaryCta) {
  const cta = cfg.cta[primaryCta] || cfg.cta["book-showing"];
  return `
<header class="site-header">
  <div class="hdr-inner">
    <a class="brand" href="/"><span class="brand-mark">${esc(brandMark(cfg))}</span>${esc(cfg.brandName)}</a>
    <div class="hdr-actions">
      <a class="hdr-phone" href="tel:${escAttr(cfg.phoneE164)}">${esc(cfg.phoneDisplay)}</a>
      <a class="btn" href="${escAttr(safeHref(cta.href))}">${esc(cta.label)}</a>
    </div>
  </div>
</header>`;
}

function footer(cfg) {
  const year = cfg.year || 2026;
  const hub = cfg.hubBase;
  return `
<footer class="site-footer">
  <div class="foot-inner">
    <div>
      <span class="foot-brand">${esc(cfg.brandName)}</span>
      ${esc(cfg.footerTagline || "Residential rentals across Greater Cleveland.")}<br>
      <a href="tel:${escAttr(cfg.phoneE164)}">${esc(cfg.phoneDisplay)}</a> ·
      <a href="mailto:${escAttr(cfg.email)}">${esc(cfg.email)}</a>
    </div>
    <div>
      <span class="foot-brand">Explore</span>
      <div class="foot-links">
        <a href="${hub}/">Rental Resource Center</a>
        <a href="/houses-for-rent-cleveland-oh/">Houses for Rent</a>
        <a href="/apartments-for-rent-cleveland-oh/">Apartments</a>
        <a href="/section-8-housing-cleveland-oh/">Section 8</a>
      </div>
    </div>
    <div>
      <span class="foot-brand">Get Started</span>
      <div class="foot-links">
        <a href="${escAttr(safeHref(cfg.cta["book-showing"].href))}">Schedule a Showing</a>
        <a href="${escAttr(safeHref(cfg.cta["apply"].href))}">Apply Now</a>
        <a href="tel:${escAttr(cfg.phoneE164)}">Call Us</a>
      </div>
    </div>
    <div class="foot-legal">
      &copy; ${year} ${esc(cfg.legalName)}. All rights reserved. ·
      <a href="/p/privacy-policy">Privacy Policy</a> ·
      <a href="/p/terms-of-service">Terms of Service</a><br>
      ${esc(cfg.brandName)} is an equal housing opportunity provider. We do business in accordance with the Fair Housing Act.
    </div>
  </div>
</footer>`;
}

// <head> shared across all page types
function head(cfg, { title, metaTitle, description, canonicalPath, jsonLd, robots }) {
  const canonical = absUrl(cfg, canonicalPath);
  const ogImage = cfg.ogImage || cfg.logo || "";
  const ldBlocks = (jsonLd || [])
    .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join("\n    ");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(metaTitle || title)}</title>
  <meta name="description" content="${escAttr(description)}">
  <meta name="robots" content="${escAttr(robots || "index, follow, max-image-preview:large, max-snippet:-1")}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <meta name="geo.region" content="${escAttr(cfg.geo.region)}">
  <meta name="geo.placename" content="${escAttr(cfg.geo.placename)}">
  <meta name="geo.position" content="${escAttr(cfg.geo.lat + ";" + cfg.geo.lng)}">
  <meta name="ICBM" content="${escAttr(cfg.geo.lat + ", " + cfg.geo.lng)}">
  <link rel="alternate" hreflang="en-us" href="${escAttr(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${escAttr(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escAttr(cfg.brandName)}">
  <meta property="og:locale" content="en_US">
  <meta property="og:title" content="${escAttr(metaTitle || title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  ${ogImage ? `<meta property="og:image" content="${escAttr(ogImage)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escAttr(metaTitle || title)}">
  <meta name="twitter:description" content="${escAttr(description)}">
  ${cfg.favicon ? `<link rel="icon" href="${escAttr(cfg.favicon)}">` : ""}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${cfg.hubBase}/assets/rentals.css">
  ${ldBlocks ? "\n    " + ldBlocks : ""}
</head>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON-LD builders
// ─────────────────────────────────────────────────────────────────────────────

// Site-wide organization node (RealEstateAgent = a LocalBusiness subtype).
export function orgNode(cfg) {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "@id": cfg.domain + "/#organization",
    name: cfg.brandName,
    legalName: cfg.legalName,
    url: cfg.domain + "/",
    telephone: cfg.phoneE164,
    email: cfg.email,
    ...(cfg.logo ? { logo: cfg.logo, image: cfg.logo } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Cleveland",
      addressRegion: "OH",
      addressCountry: "US",
    },
    areaServed: (cfg.areaServed || ["Cleveland", "Cuyahoga County", "Greater Cleveland"]).map((n) => ({
      "@type": "City",
      name: n,
    })),
    ...(cfg.sameAs && cfg.sameAs.length ? { sameAs: cfg.sameAs } : {}),
  };
}

function breadcrumbNode(cfg, trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: absUrl(cfg, t.path),
    })),
  };
}

function articleNode(cfg, article, canonicalPath) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    inLanguage: "en-US",
    datePublished: article.datePublished || article.lastUpdated,
    dateModified: article.lastUpdated,
    mainEntityOfPage: { "@type": "WebPage", "@id": absUrl(cfg, canonicalPath) },
    author: { "@type": "Organization", name: cfg.brandName, url: cfg.domain + "/" },
    publisher: {
      "@type": "Organization",
      name: cfg.brandName,
      ...(cfg.logo ? { logo: { "@type": "ImageObject", url: cfg.logo } } : {}),
    },
    ...(article.primaryKeyword ? { about: article.primaryKeyword } : {}),
  };
}

function faqNode(article) {
  if (!article.faq || !article.faq.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section / body rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderList(list) {
  if (!list || !list.items || !list.items.length) return "";
  const tag = list.type === "ol" ? "ol" : "ul";
  const items = list.items.map((it) => `<li>${renderInline(it)}</li>`).join("");
  return `<${tag}>${items}</${tag}>`;
}

function renderTable(table) {
  if (!table || !table.headers || !table.rows) return "";
  const head = `<tr>${table.headers.map((h) => `<th>${renderInline(h)}</th>`).join("")}</tr>`;
  const body = table.rows
    .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="tbl-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderSection(s) {
  let html = `<h2>${renderInline(s.h2)}</h2>`;
  for (const p of s.body || []) html += para(p);
  html += renderList(s.list);
  html += renderTable(s.table);
  for (const h of s.h3s || []) {
    html += `<h3>${renderInline(h.h3)}</h3>`;
    for (const p of h.body || []) html += para(p);
    html += renderList(h.list);
    html += renderTable(h.table);
  }
  return html;
}

function ctaInline(cfg, ctaKey) {
  const c = cfg.cta[ctaKey] || cfg.cta["book-showing"];
  return `
<div class="cta-inline">
  <div class="cta-txt">${esc(c.pitch || c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ""}</div>
  <a class="btn btn-gold" href="${escAttr(safeHref(c.href))}">${esc(c.label)}</a>
</div>`;
}

function ctaBlock(cfg, ctaKey) {
  const c = cfg.cta[ctaKey] || cfg.cta["book-showing"];
  // Secondary is always a phone link — it works regardless of live inventory,
  // so no page ever dead-ends. Primary routes to the real, submitting funnel.
  return `
<div class="wrap"><div class="cta-block">
  <h2>${esc(c.blockTitle || "Ready to find your next Cleveland rental?")}</h2>
  <p>${esc(c.blockBody || "Tell us what you're looking for and our local leasing team will help you line up a showing.")}</p>
  <div class="cta-row">
    <a class="btn" href="${escAttr(safeHref(c.href))}">${esc(c.label)}</a>
    <a class="btn btn-ghost" href="tel:${escAttr(cfg.phoneE164)}">Call ${esc(cfg.phoneDisplay)}</a>
  </div>
</div></div>`;
}

function faqSection(article) {
  if (!article.faq || !article.faq.length) return "";
  const items = article.faq
    .map(
      (f) => `<details><summary>${esc(f.q)}</summary><div class="faq-a">${renderInline(f.a)}</div></details>`
    )
    .join("\n      ");
  return `
<section class="faq">
  <h2>Frequently asked questions</h2>
  ${items}
</section>`;
}

function relatedSection(cfg, related) {
  if (!related || !related.length) return "";
  const items = related
    .map((r) => `<li><a href="${escAttr(r.path)}">${esc(r.title)}</a></li>`)
    .join("\n      ");
  return `
<aside class="related">
  <h2>Keep exploring</h2>
  <ul class="link-list">
      ${items}
  </ul>
</aside>`;
}

function breadcrumbHtml(trail) {
  const items = trail
    .map((t, i) =>
      i === trail.length - 1
        ? `<li>${esc(t.name)}</li>`
        : `<li><a href="${escAttr(t.path)}">${esc(t.name)}</a></li>`
    )
    .join("");
  return `<nav class="crumb" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page renderers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a full article page.
 * @param cfg taxonomy.config
 * @param article article JSON
 * @param ctx { trail:[{name,path}], related:[{title,path}] }
 */
export function renderArticle(cfg, article, ctx = {}) {
  const canonicalPath = articlePath(cfg, article);
  const words = wordCount(article);
  const mins = readingMinutes(words);
  const trail = ctx.trail || [{ name: "Home", path: "/" }, { name: article.title, path: canonicalPath }];

  const jsonLd = [
    orgNode(cfg),
    breadcrumbNode(cfg, trail),
    articleNode(cfg, article, canonicalPath),
  ];
  const fq = faqNode(article);
  if (fq) jsonLd.push(fq);

  const cta = article.cta || "book-showing";

  // Insert an inline CTA after the first section for engagement.
  const sections = article.sections || [];
  let bodyHtml = "";
  sections.forEach((s, i) => {
    bodyHtml += renderSection(s);
    if (i === 0 && sections.length > 2) bodyHtml += ctaInline(cfg, cta);
  });

  const disclaimer = article.lawTopic
    ? `This article is general information about renting in the Cleveland area, not legal advice. Ohio landlord-tenant rules can change and individual situations vary — consult the cited sources or a qualified professional before acting. ${esc(cfg.brandName)} is an equal housing opportunity provider.`
    : `${esc(cfg.brandName)} is an equal housing opportunity provider and does business in accordance with the Fair Housing Act. Availability, pricing, and terms are subject to change.`;

  return `${head(cfg, {
    title: article.title,
    metaTitle: article.metaTitle,
    description: article.metaDescription,
    canonicalPath,
    jsonLd,
  })}
<body>
${header(cfg, cta)}
${breadcrumbHtml(trail)}
<main>
  <div class="wrap">
    <article>
      <p class="eyebrow">${esc(ctx.clusterLabel || "Cleveland Rentals")} · Cleveland, OH</p>
      <h1>${esc(article.title)}</h1>
      ${article.answerBox ? `<p class="answer-box">${renderInline(article.answerBox)}</p>` : ""}
      <div class="meta-row">
        <span>Updated <time datetime="${escAttr(article.lastUpdated)}">${esc(humanDate(article.lastUpdated))}</time></span>
        <span class="dot">·</span><span>${mins} min read</span>
        <span class="dot">·</span><span>By the ${esc(cfg.brandName)} team</span>
      </div>
      ${bodyHtml}
      ${faqSection(article)}
      ${relatedSection(cfg, ctx.related)}
      <p class="disclaimer">${disclaimer}</p>
    </article>
  </div>
  ${ctaBlock(cfg, cta)}
</main>
${footer(cfg)}
</body>
</html>`;
}

/**
 * Render a hub/pillar page.
 * @param cfg
 * @param page { title, metaTitle, metaDescription, canonicalPath, answerBox, intro:[..],
 *               sections:[...], cards:[{title,desc,path}], linkGroups:[{heading,links:[{title,path}]}],
 *               faq, cta, trail, lawTopic }
 */
export function renderHub(cfg, page) {
  const canonicalPath = page.canonicalPath;
  const trail = page.trail || [{ name: "Home", path: "/" }, { name: page.title, path: canonicalPath }];
  const cta = page.cta || "book-showing";

  const jsonLd = [orgNode(cfg), breadcrumbNode(cfg, trail)];
  // Hub pages describe a collection → CollectionPage + ItemList when we have links
  const allLinks = [];
  for (const g of page.linkGroups || []) for (const l of g.links || []) allLinks.push(l);
  for (const c of page.cards || []) allLinks.push({ title: c.title, path: c.path });
  if (allLinks.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: page.title,
      description: page.metaDescription,
      url: absUrl(cfg, canonicalPath),
      mainEntity: {
        "@type": "ItemList",
        itemListElement: allLinks.slice(0, 100).map((l, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: l.title,
          url: absUrl(cfg, l.path),
        })),
      },
    });
  }
  const fq = faqNode(page);
  if (fq) jsonLd.push(fq);

  const cards = (page.cards || [])
    .map(
      (c) => `
    <div class="hub-card">
      <h3>${esc(c.title)}</h3>
      ${c.desc ? `<p>${esc(c.desc)}</p>` : ""}
      <a class="card-link" href="${escAttr(c.path)}">${esc(c.linkLabel || "Explore →")}</a>
    </div>`
    )
    .join("");

  const linkGroups = (page.linkGroups || [])
    .map(
      (g) => `
    <section>
      <h2>${esc(g.heading)}</h2>
      <ul class="link-list">
        ${g.links.map((l) => `<li><a href="${escAttr(l.path)}">${esc(l.title)}</a></li>`).join("\n        ")}
      </ul>
    </section>`
    )
    .join("");

  const introHtml = (page.intro || []).map(para).join("");
  const sectionsHtml = (page.sections || []).map(renderSection).join("");

  return `${head(cfg, {
    title: page.title,
    metaTitle: page.metaTitle,
    description: page.metaDescription,
    canonicalPath,
    jsonLd,
  })}
<body>
${header(cfg, cta)}
<div class="hub-hero">
  <div class="wrap-wide">
    <p class="eyebrow">${esc(page.eyebrow || "Cleveland Rental Resource Center")}</p>
    <h1>${esc(page.title)}</h1>
    ${page.heroSub ? `<p>${esc(page.heroSub)}</p>` : ""}
  </div>
</div>
${breadcrumbHtml(trail)}
<main>
  <div class="wrap">
    ${page.answerBox ? `<p class="answer-box">${renderInline(page.answerBox)}</p>` : ""}
    ${introHtml}
    ${sectionsHtml}
    ${cards ? `<div class="card-grid">${cards}</div>` : ""}
    ${linkGroups}
    ${faqSection(page)}
  </div>
  ${ctaBlock(cfg, cta)}
</main>
${footer(cfg)}
</body>
</html>`;
}
