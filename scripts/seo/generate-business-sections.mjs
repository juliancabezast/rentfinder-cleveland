// ─────────────────────────────────────────────────────────────────────────────
// generate-business-sections.mjs
//
// Self-contained generator for the two TOP-LEVEL B2B sections:
//   /housing-partners/            + /housing-partners/<slug>/
//   /corporate-leasing/           + /corporate-leasing/<slug>/
//
// Reuses render helpers (renderInline, absUrl, orgNode, STYLES) but has its own
// page shell so it never touches the renter generator. Each page embeds a short
// name/email/phone lead form that POSTs to the public submit-business-lead edge
// fn (→ business_leads → the "Business" sidebar page).
//
// Run AFTER generate-static-site.mjs (it appends a child sitemap to the existing
// public/sitemap.xml index and reuses /cleveland-rentals/assets/rentals.css).
//
//   node scripts/seo/generate-business-sections.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderInline, absUrl, orgNode } from "./render.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const PUBLIC = join(ROOT, "public");

const SUPABASE_URL = "https://glzzzthgotfwoiaranmp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsenp6dGhnb3Rmd29pYXJhbm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NjM5NTksImV4cCI6MjA4NTMzOTk1OX0.zis7q1VXP1IKbL8Zc9B5oe9MPcSyVJbXVCNDYE7d690";

const cfg = JSON.parse(readFileSync(join(ROOT, "content/seo/taxonomy.json"), "utf8")).config;
const { sections } = JSON.parse(readFileSync(join(ROOT, "content/seo/business-sections.json"), "utf8"));

// Load child articles, grouped by section slug
const ARTICLE_DIR = join(ROOT, "content/seo/business-articles");
const bySection = {};
for (const s of sections) bySection[s.slug] = [];
if (existsSync(ARTICLE_DIR)) {
  for (const f of readdirSync(ARTICLE_DIR)) {
    if (!f.endsWith(".json")) continue;
    const a = JSON.parse(readFileSync(join(ARTICLE_DIR, f), "utf8"));
    if (bySection[a.section]) bySection[a.section].push(a);
  }
}
for (const k of Object.keys(bySection)) bySection[k].sort((a, b) => (a.title || "").localeCompare(b.title || ""));

// ── escapers ──
const E = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const A = (s = "") => E(s).replace(/"/g, "&quot;");
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

function writeFile(rel, html) {
  const full = join(PUBLIC, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
}

// ── shared page chrome ──
function head({ title, metaTitle, description, canonicalPath, ldBlocks }) {
  const canonical = absUrl(cfg, canonicalPath);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${A(metaTitle || title)}</title>
  <meta name="description" content="${A(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="canonical" href="${A(canonical)}">
  <meta name="geo.region" content="US-OH">
  <meta name="geo.placename" content="Cleveland, Ohio">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="en_US">
  <meta property="og:site_name" content="${A(cfg.brandName)}">
  <meta property="og:title" content="${A(metaTitle || title)}">
  <meta property="og:description" content="${A(description)}">
  <meta property="og:url" content="${A(canonical)}">
  ${cfg.ogImage ? `<meta property="og:image" content="${A(cfg.ogImage)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${A(metaTitle || title)}">
  <meta name="twitter:description" content="${A(description)}">
  ${cfg.favicon ? `<link rel="icon" href="${A(cfg.favicon)}">` : ""}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${cfg.hubBase}/assets/rentals.css">
  <style>
    .sec-sub{font-size:1.15rem;color:#4b5563;margin:.25rem 0 1.25rem;max-width:52ch}
    .biz-form{display:flex;flex-direction:column;gap:10px;max-width:440px}
    .biz-form input{padding:12px 14px;border:1px solid #d7d7e0;border-radius:10px;font:inherit;background:#fff}
    .biz-form .hp{position:absolute;left:-9999px}
    .biz-form button{padding:12px 18px;border:0;border-radius:10px;background:#4F46E5;color:#fff;font-weight:700;cursor:pointer}
    .biz-form button:disabled{opacity:.6}
    .biz-msg{color:#166534;font-weight:600;margin:0}
    .biz-cta{background:linear-gradient(135deg,rgba(79,70,229,.08),rgba(255,178,44,.06));border:1px solid #e6e6ef;border-radius:16px;padding:24px;margin:32px 0}
    .biz-cta h2{margin-top:0}
    .biz-faq details{border-bottom:1px solid #e6e6ef;padding:12px 0}
    .biz-faq summary{font-weight:700;cursor:pointer}
    .biz-faq details>div{margin-top:8px;color:#4b5563}
    .sources{margin-top:28px;font-size:.9rem}
    .sources a{word-break:break-all}
  </style>
  ${ldBlocks}
</head>`;
}

function breadcrumb(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: absUrl(cfg, t.path) })),
  };
}
function faqNode(faq) {
  if (!faq || !faq.length) return null;
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}

// Service + Offer, emitted only for sections that declare `offers`.
//
// This is the GEO play: an answer engine asked "how much does Section 8
// property management cost in Cleveland" can lift a real, attributed price
// instead of guessing. Prices come from the section JSON — never hardcoded
// here — so the page and the structured data can't drift apart.
function serviceNode(cfg, section) {
  if (!section.offers || !section.offers.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: section.serviceName || section.title,
    serviceType: section.serviceType || section.title,
    description: section.metaDescription,
    provider: {
      "@type": "RealEstateAgent",
      name: cfg.brandName,
      telephone: cfg.phoneE164,
      email: cfg.email,
      url: cfg.domain + "/",
      ...(cfg.logo ? { image: cfg.logo } : {}),
    },
    areaServed: (section.areaServed || []).map((n) => ({ "@type": "City", name: n })),
    url: absUrl(cfg, `/${section.slug}/`),
    offers: section.offers.map((o) => ({
      "@type": "Offer",
      name: o.name,
      description: o.description,
      priceCurrency: "USD",
      ...(o.price != null ? { price: String(o.price) } : {}),
      ...(o.priceNote ? { priceSpecification: { "@type": "PriceSpecification", description: o.priceNote } } : {}),
      availability: "https://schema.org/InStock",
    })),
  };
}

function pageHeader() {
  return `<header class="site-header"><div class="hdr-inner">
    <a class="brand" href="/"><span class="brand-mark"></span>${E(cfg.brandName)}</a>
    <nav class="hdr-actions"><a class="btn btn-ghost" href="/#listings">Browse Rentals</a><a class="hdr-phone" href="tel:${A(cfg.phoneE164)}">${E(cfg.phoneDisplay)}</a></nav>
  </div></header>`;
}
function pageFooter() {
  return `<footer class="site-footer"><div class="foot-inner">
    <p class="foot-brand"><strong>${E(cfg.brandName)}</strong> — <a href="tel:${A(cfg.phoneE164)}">${E(cfg.phoneDisplay)}</a> · <a href="mailto:${A(cfg.email)}">${E(cfg.email)}</a></p>
    <nav class="foot-links"><a href="/">Home</a> · <a href="/cleveland-rentals/">Renter Guides</a> · <a href="/housing-partners/">Housing Partners</a> · <a href="/corporate-leasing/">Corporate Leasing</a> · <a href="/saas">For Property Managers</a></nav>
    <p class="foot-legal">© ${new Date(cfg.launchDate).getFullYear()} ${E(cfg.legalName || cfg.brandName)}. Equal housing opportunity provider, in accordance with the Fair Housing Act. Cleveland, Ohio.</p>
  </div></footer>`;
}

function leadForm(section) {
  const id = "blf-" + section.slug;
  return `<div class="biz-cta">
    <h2>${E(section.formTitle)}</h2>
    <p>${E(section.formSub)}</p>
    <form class="biz-form" id="${id}">
      <input name="full_name" placeholder="Your name" autocomplete="name" required>
      <input name="email" type="email" placeholder="Work email" autocomplete="email" required>
      <input name="phone" type="tel" placeholder="Phone (optional)" autocomplete="tel">
      <input class="hp" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit">Get in touch</button>
      <p class="biz-msg" hidden></p>
    </form>
  </div>
  <script>(function(){var f=document.getElementById(${JSON.stringify(id)});if(!f)return;f.addEventListener("submit",function(e){e.preventDefault();var m=f.querySelector(".biz-msg"),b=f.querySelector("button");if(f.company_website.value)return;if(!f.full_name.value.trim()||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(f.email.value)){m.hidden=false;m.style.color="#b91c1c";m.textContent="Please enter your name and a valid email.";return;}b.disabled=true;b.textContent="Sending…";fetch(${JSON.stringify(SUPABASE_URL + "/functions/v1/submit-business-lead")},{method:"POST",headers:{"Content-Type":"application/json","apikey":${JSON.stringify(SUPABASE_ANON)},"Authorization":"Bearer "+${JSON.stringify(SUPABASE_ANON)}},body:JSON.stringify({lead_type:${JSON.stringify(section.leadType)},full_name:f.full_name.value,email:f.email.value,phone:f.phone.value,source:"article",source_detail:location.pathname,user_agent:navigator.userAgent})}).then(function(r){return r.json();}).then(function(d){if(d&&d.success){f.querySelectorAll("input,button").forEach(function(el){el.style.display="none";});m.hidden=false;m.style.color="#166534";m.textContent="Thanks — our team will reach out shortly.";}else{b.disabled=false;b.textContent="Get in touch";m.hidden=false;m.style.color="#b91c1c";m.textContent=(d&&d.error)||"Something went wrong — email ${cfg.email}";}}).catch(function(){b.disabled=false;b.textContent="Get in touch";m.hidden=false;m.style.color="#b91c1c";m.textContent="Something went wrong — email ${cfg.email}";});});})();</script>`;
}

function renderSection(s) {
  let html = `<h2>${renderInline(s.h2)}</h2>`;
  for (const p of s.body || []) html += `<p>${renderInline(p)}</p>`;
  if (s.list && s.list.items) {
    const tag = s.list.type === "ol" ? "ol" : "ul";
    html += `<${tag}>${s.list.items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</${tag}>`;
  }
  for (const h of s.h3s || []) {
    html += `<h3>${renderInline(h.h3)}</h3>`;
    for (const p of h.body || []) html += `<p>${renderInline(p)}</p>`;
  }
  return html;
}
function renderFaq(faq) {
  if (!faq || !faq.length) return "";
  return `<section class="biz-faq"><h2>Frequently asked questions</h2>${faq
    .map((f) => `<details><summary>${E(f.q)}</summary><div>${renderInline(f.a)}</div></details>`)
    .join("")}</section>`;
}

const LAUNCH = cfg.launchDate;
const smUrls = []; // {loc, lastmod}

// ── Section landing pages ──
for (const section of sections) {
  const path = `/${section.slug}/`;
  const arts = bySection[section.slug] || [];
  const trail = [{ name: "Home", path: "/" }, { name: section.title, path }];
  const links = arts.map((a) => ({ title: a.title, path: `/${section.slug}/${a.slug}/` }));
  const itemList = links.length
    ? { "@context": "https://schema.org", "@type": "ItemList", itemListElement: links.map((l, i) => ({ "@type": "ListItem", position: i + 1, name: l.title, url: absUrl(cfg, l.path) })) }
    : null;
  const ldBlocks = [orgNode(cfg), breadcrumb(trail), faqNode(section.faq), itemList, serviceNode(cfg, section)]
    .filter(Boolean).map(ld).join("\n  ");

  const body = `${pageHeader()}
  <main class="wrap">
    <p class="eyebrow">${E(section.eyebrow || "")}</p>
    <h1>${E(section.title)}</h1>
    <p class="sec-sub">${E(section.heroSub || "")}</p>
    ${section.answerBox ? `<div class="answer-box">${renderInline(section.answerBox)}</div>` : ""}
    ${(section.intro || []).map((p) => `<p>${renderInline(p)}</p>`).join("")}
    ${leadForm(section)}
    ${links.length ? `<section class="link-list"><h2>${E(section.linkHeading || "Guides")}</h2><ul>${links.map((l) => `<li><a href="${A(l.path)}">${E(l.title)}</a></li>`).join("")}</ul></section>` : ""}
    ${renderFaq(section.faq)}
  </main>
  ${pageFooter()}
</body></html>`;
  writeFile(join(section.slug, "index.html"), head({ title: section.title, metaTitle: section.metaTitle, description: section.metaDescription, canonicalPath: path, ldBlocks }) + "\n<body>\n" + body);
  smUrls.push({ loc: absUrl(cfg, path), lastmod: LAUNCH });

  // ── Child article pages ──
  for (const a of arts) {
    const apath = `/${section.slug}/${a.slug}/`;
    const atrail = [{ name: "Home", path: "/" }, { name: section.title, path }, { name: a.title, path: apath }];
    const articleLd = {
      "@context": "https://schema.org", "@type": "Article",
      headline: a.title, description: a.metaDescription, inLanguage: "en-US",
      datePublished: a.lastUpdated || LAUNCH, dateModified: a.lastUpdated || LAUNCH,
      mainEntityOfPage: { "@type": "WebPage", "@id": absUrl(cfg, apath) },
      author: { "@type": "Organization", name: cfg.brandName, url: cfg.domain + "/" },
      publisher: { "@type": "Organization", name: cfg.brandName, ...(cfg.logo ? { logo: { "@type": "ImageObject", url: cfg.logo } } : {}) },
      ...(a.primaryKeyword ? { about: a.primaryKeyword } : {}),
    };
    const aLd = [orgNode(cfg), breadcrumb(atrail), articleLd, faqNode(a.faq)].filter(Boolean).map(ld).join("\n  ");
    const related = arts.filter((x) => x.slug !== a.slug).slice(0, 6).map((x) => ({ title: x.title, path: `/${section.slug}/${x.slug}/` }));
    const body = `${pageHeader()}
  <main class="wrap">
    <nav class="crumb"><ol><li><a href="/">Home</a></li><li><a href="${A(path)}">${E(section.title)}</a></li><li>${E(a.title)}</li></ol></nav>
    <h1>${E(a.title)}</h1>
    ${a.answerBox ? `<div class="answer-box">${renderInline(a.answerBox)}</div>` : ""}
    ${(a.sections || []).map(renderSection).join("")}
    ${leadForm(section)}
    ${renderFaq(a.faq)}
    ${related.length ? `<section class="link-list"><h2>More for ${E(section.title.toLowerCase())}</h2><ul>${related.map((l) => `<li><a href="${A(l.path)}">${E(l.title)}</a></li>`).join("")}</ul></section>` : ""}
    ${a.sources && a.sources.length ? `<section class="sources"><h2>Sources</h2><ul>${a.sources.map((s) => `<li><a href="${A(s)}" rel="nofollow noopener" target="_blank">${E(s)}</a></li>`).join("")}</ul></section>` : ""}
  </main>
  ${pageFooter()}
</body></html>`;
    writeFile(join(section.slug, a.slug, "index.html"), head({ title: a.title, metaTitle: a.metaTitle, description: a.metaDescription, canonicalPath: apath, ldBlocks: aLd }) + "\n<body>\n" + body);
    smUrls.push({ loc: absUrl(cfg, apath), lastmod: a.lastUpdated || LAUNCH });
  }
}

// ── sitemap-business.xml ──
const smXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${smUrls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}
</urlset>`;
writeFileSync(join(PUBLIC, "sitemap-business.xml"), smXml);

// ── inject child sitemap into the existing sitemap.xml index (idempotent) ──
const idxPath = join(PUBLIC, "sitemap.xml");
if (existsSync(idxPath)) {
  let idx = readFileSync(idxPath, "utf8");
  const bizLoc = absUrl(cfg, "/sitemap-business.xml");
  if (!idx.includes("sitemap-business.xml")) {
    idx = idx.replace("</sitemapindex>", `  <sitemap><loc>${bizLoc}</loc><lastmod>${LAUNCH}</lastmod></sitemap>\n</sitemapindex>`);
    writeFileSync(idxPath, idx);
  }
}

// ── inject the business sections into llms.txt (idempotent; for AI crawlers) ──
const llmsPath = join(PUBLIC, "llms.txt");
if (existsSync(llmsPath)) {
  let llms = readFileSync(llmsPath, "utf8");
  if (!llms.includes("/housing-partners/") && !llms.includes("/corporate-leasing/")) {
    const block =
      "## For housing partners & employers\n" +
      sections.map((s) => `- [${s.title}](${absUrl(cfg, "/" + s.slug + "/")}): ${s.metaDescription}`).join("\n") +
      "\n\n";
    llms = llms.includes("## Full index")
      ? llms.replace("## Full index", block + "## Full index")
      : llms.trimEnd() + "\n\n" + block;
    writeFileSync(llmsPath, llms);
  }
}

const total = smUrls.length;
const landings = sections.length;
console.log(`✓ Generated business sections`);
console.log(`  sections : ${landings} (${sections.map((s) => s.slug).join(", ")})`);
console.log(`  articles : ${total - landings}`);
console.log(`  sitemap  : ${total} urls -> public/sitemap-business.xml (+ injected into sitemap.xml index)`);
