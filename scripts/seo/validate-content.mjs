// validate-content.mjs — content QA gate for the Cleveland rentals hub.
// Run as CLI:   node scripts/seo/validate-content.mjs
// Or import { validateArticle, validateAll, buildRouteSet } for use in the generator.
//
// Checks per article:
//   1. Schema — required fields, types, slug == filename == taxonomy entry.
//   2. Meta lengths — metaTitle ≤ 60, metaDescription 110–165, primary keyword present.
//   3. Fair Housing — banned steering/discriminatory language (hard error).
//   4. Honesty — banned false-promise phrases (hard error).
//   5. Links — every internal [text](/path) resolves to a known route; external
//      links must be https and on the authority allowlist.
//   6. Word count — 850–2600 (pillars may exceed via allowWords).
//   7. FAQ — 3–6 Q&A, answers non-empty.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CONTENT = join(ROOT, "content", "seo");
const ARTICLES_DIR = join(CONTENT, "articles");

// ── Fair Housing: forbidden language (case-insensitive, word-ish boundaries) ──
// These describe or steer by protected class or use loaded proxies. HUD ad guidance.
const FAIR_HOUSING_BANNED = [
  "safe neighborhood", "safe area", "safest", "unsafe", "crime-free", "crime free", "low crime", "high crime",
  "good schools", "great schools", "best schools", "top schools", "quality schools",
  "family-friendly", "family friendly", "families welcome", "perfect for families", "ideal for families",
  "great for families", "kid-friendly", "adult community", "no kids", "no children", "childless",
  "bachelor pad", "singles only", "couples only", "mature", "empty nester",
  "christian", "catholic", "jewish", "muslim", "church", "synagogue", "mosque", "gentile",
  "white", "black neighborhood", "hispanic", "latino community", "asian", "ethnic", "integrated",
  "exclusive neighborhood", "exclusive community", "restricted", "traditional neighborhood",
  "able-bodied", "handicap", "no wheelchairs", "not handicap", "healthy only", "no disabled",
  "english speaking", "english-speaking only", "americans only", "no immigrants",
  "male only", "female only", "men only", "women only",
  "sober", "no section 8 losers", "up-and-coming", "up and coming", "transitional neighborhood",
];

// Softer proxies → warnings (allowed in some contexts but flag for human eyes)
const FAIR_HOUSING_WARN = [
  "walkable", "young professional", "vibrant", "desirable", "trendy", "prestigious", "nice area",
];

// ── Honesty: false PROMISES we must never make (hard errors) ──
// Note: bare "no credit check" / "bad credit" are legitimate SEARCH TERMS (some of
// our target keywords). They may appear in titles/questions and be debunked in the
// body — only actual guarantees of no-screening/approval are banned outright.
const HONESTY_BANNED = [
  "guaranteed approval", "guaranteed to be approved", "instant approval", "approval guaranteed",
  "everyone approved", "everyone is approved", "we accept everyone", "no background check",
  "no screening", "skip the credit check", "we don't check credit", "we do not check credit",
  "we don't run credit", "lowest price guaranteed", "cheapest in cleveland", "best deal guaranteed",
  "no credit check required", "zero screening",
];

// Phrases that are OK as a topic but must never be a promise → warning for human eyes.
const HONESTY_WARN = [
  "no credit check", "bad credit ok", "second chance guaranteed", "no questions asked",
  "no deposit", "move in today", "same day approval",
];

// ── External link allowlist (authority domains only) ──
const EXTERNAL_ALLOW = [
  "hud.gov", "cmha.net", "cuyahogacounty.gov", "cuyahogacounty.us", "clevelandohio.gov", "city.cleveland.oh.us",
  "codes.ohio.gov", "ohio.gov", "consumerfinance.gov", "usa.gov", "epa.gov", "energy.gov",
  "riderta.com", "clevelandwater.com", "cpp.org", "firstenergycorp.com", "dominionenergy.com",
  "neorsd.org", "irs.gov", "ftc.gov", "usps.com", "benefits.gov", "affordablehousingonline.com",
  "hudexchange.info", "cdc.gov",
];

// ── Known static app routes that internal links may target ──
const APP_ROUTES = new Set([
  "/", "/p/book-showing", "/apply", "/p/apply", "/sms-signup/", "/leasingtracker",
  "/p/privacy-policy", "/p/terms-of-service", "/auth/login",
  "/houses-for-rent-cleveland-oh/", "/apartments-for-rent-cleveland-oh/", "/section-8-housing-cleveland-oh/",
]);

export function loadTaxonomy() {
  return JSON.parse(readFileSync(join(CONTENT, "taxonomy.json"), "utf8"));
}

export function loadArticles() {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(ARTICLES_DIR, f), "utf8")) }));
}

// Build the full set of valid internal routes from taxonomy + app routes.
export function buildRouteSet(taxonomy) {
  const cfg = taxonomy.config;
  const routes = new Set(APP_ROUTES);
  routes.add(`${cfg.hubBase}/`);
  for (const key of Object.keys(taxonomy.clusters || {})) routes.add(`${cfg.hubBase}/${key}/`);
  for (const p of taxonomy.pillars || []) routes.add(`/${p.slug}/`);
  for (const a of taxonomy.articles || []) routes.add(`${cfg.hubBase}/${a.cluster}/${a.slug}/`);
  return routes;
}

function scanText(article) {
  // Concatenate all human-readable text for term scanning.
  const parts = [article.title, article.metaTitle, article.metaDescription, article.answerBox];
  for (const s of article.sections || []) {
    parts.push(s.h2);
    (s.body || []).forEach((b) => parts.push(b));
    for (const h of s.h3s || []) { parts.push(h.h3); (h.body || []).forEach((b) => parts.push(b)); }
    for (const it of s.list?.items || []) parts.push(it);
    for (const row of s.table?.rows || []) row.forEach((c) => parts.push(c));
  }
  for (const f of article.faq || []) { parts.push(f.q); parts.push(f.a); }
  return parts.filter(Boolean).join("\n");
}

function extractLinks(text) {
  const out = [];
  const re = /\[[^\]]+\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

function countWords(article) {
  return scanText(article).split(/\s+/).filter(Boolean).length;
}

export function validateArticle(article, { file, routes, taxonomySlugs, cfg }) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  // 1. Schema
  const required = ["slug", "cluster", "title", "metaTitle", "metaDescription", "primaryKeyword", "sections", "cta", "lastUpdated"];
  for (const k of required) {
    if (article[k] === undefined || article[k] === null || (typeof article[k] === "string" && !article[k].trim())) {
      err(`missing required field "${k}"`);
    }
  }
  if (file && article.slug && file !== `${article.slug}.json`) {
    err(`filename "${file}" does not match slug "${article.slug}"`);
  }
  if (taxonomySlugs && article.slug && !taxonomySlugs.has(article.slug)) {
    err(`slug "${article.slug}" not present in taxonomy.articles`);
  }
  if (cfg && article.cta && !cfg.cta[article.cta]) {
    err(`unknown cta "${article.cta}" (valid: ${Object.keys(cfg.cta).join(", ")})`);
  }
  if (!Array.isArray(article.sections) || article.sections.length < 3) {
    err(`needs at least 3 sections (has ${article.sections?.length || 0})`);
  }

  // 2. Meta
  if (article.metaTitle && article.metaTitle.length > 62) warn(`metaTitle ${article.metaTitle.length} chars (>62; brand suffix added at render — keep tight)`);
  if (article.metaDescription) {
    const L = article.metaDescription.length;
    if (L < 110 || L > 165) warn(`metaDescription ${L} chars (target 120–160)`);
  }
  if (article.primaryKeyword && article.metaTitle &&
      !article.metaTitle.toLowerCase().includes(article.primaryKeyword.toLowerCase().split(" ").slice(0, 2).join(" "))) {
    warn(`metaTitle may not contain the primary keyword head "${article.primaryKeyword}"`);
  }

  const text = scanText(article).toLowerCase();

  // 3. Fair Housing (hard errors)
  for (const term of FAIR_HOUSING_BANNED) {
    if (text.includes(term)) err(`FAIR HOUSING violation: contains "${term}"`);
  }
  for (const term of FAIR_HOUSING_WARN) {
    if (text.includes(term)) warn(`Fair-Housing proxy word "${term}" — verify context is about the property, not people`);
  }

  // 4. Honesty (hard errors + soft warnings)
  for (const term of HONESTY_BANNED) {
    if (text.includes(term)) err(`HONESTY violation: false-promise phrase "${term}"`);
  }
  for (const term of HONESTY_WARN) {
    if (text.includes(term)) warn(`honesty-sensitive phrase "${term}" — must be debunked/reframed, never promised`);
  }

  // 5. Links
  const links = extractLinks(scanText(article));
  for (const href of links) {
    if (href.startsWith("/")) {
      // internal — must resolve. Strip nothing; trailing slash required by convention.
      if (routes && !routes.has(href)) {
        err(`internal link "${href}" does not resolve to a known route (check trailing slash)`);
      }
    } else if (href.startsWith("https://")) {
      let host;
      try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { err(`malformed URL "${href}"`); continue; }
      const ok = EXTERNAL_ALLOW.some((d) => host === d || host.endsWith("." + d));
      if (!ok) warn(`external link to non-allowlisted domain "${host}" — must be an authority source from the facts pack`);
    } else if (href.startsWith("tel:") || href.startsWith("mailto:")) {
      // fine
    } else {
      err(`link "${href}" must be an absolute site path (/...) or https URL`);
    }
  }

  // 6. Word count
  const words = countWords(article);
  const min = article.allowWords?.min || 850;
  const max = article.allowWords?.max || 2600;
  if (words < min) warn(`only ${words} words (target ≥ ${min})`);
  if (words > max) warn(`${words} words (over ${max})`);

  // 7. FAQ
  if (article.faq) {
    if (article.faq.length < 3) warn(`only ${article.faq.length} FAQ items (target 4–6)`);
    for (const f of article.faq) {
      if (!f.q || !f.a || !f.a.trim()) err(`FAQ item has empty question or answer`);
    }
  } else {
    warn(`no FAQ block (recommended for GEO)`);
  }

  // 8. answerBox length (GEO snippet 40–60 words ideal)
  if (article.answerBox) {
    const w = article.answerBox.split(/\s+/).filter(Boolean).length;
    if (w < 25 || w > 80) warn(`answerBox is ${w} words (ideal 40–60)`);
  } else {
    warn(`no answerBox (the answer-first GEO snippet) — strongly recommended`);
  }

  return { errors, warnings, words };
}

export function validateAll() {
  const taxonomy = loadTaxonomy();
  const cfg = taxonomy.config;
  const routes = buildRouteSet(taxonomy);
  const taxonomySlugs = new Set((taxonomy.articles || []).map((a) => a.slug));
  const loaded = loadArticles();

  let totalErrors = 0;
  let totalWarnings = 0;
  const perFile = [];

  for (const { file, data } of loaded) {
    const { errors, warnings, words } = validateArticle(data, { file, routes, taxonomySlugs, cfg });
    totalErrors += errors.length;
    totalWarnings += warnings.length;
    if (errors.length || warnings.length) perFile.push({ file, errors, warnings, words });
  }

  // Coverage: taxonomy slugs with no article file yet
  const haveSlugs = new Set(loaded.map((l) => l.data.slug));
  const missing = [...taxonomySlugs].filter((s) => !haveSlugs.has(s));

  return {
    taxonomy, cfg, routes,
    counts: { articles: loaded.length, taxonomy: taxonomySlugs.size, missing: missing.length, errors: totalErrors, warnings: totalWarnings },
    missing, perFile,
  };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const { counts, perFile, missing } = validateAll();
  for (const { file, errors, warnings, words } of perFile) {
    if (errors.length) {
      console.log(`\n\x1b[31m✗ ${file}\x1b[0m (${words}w)`);
      for (const e of errors) console.log(`   ERROR  ${e}`);
      for (const w of warnings) console.log(`   warn   ${w}`);
    } else if (warnings.length) {
      console.log(`\n\x1b[33m~ ${file}\x1b[0m (${words}w)`);
      for (const w of warnings) console.log(`   warn   ${w}`);
    }
  }
  if (missing.length) {
    console.log(`\n\x1b[33m${missing.length} taxonomy slugs have no article file yet:\x1b[0m`);
    console.log("   " + missing.slice(0, 40).join(", ") + (missing.length > 40 ? ` … +${missing.length - 40}` : ""));
  }
  console.log(`\n─────────────────────────────────────────`);
  console.log(`Articles: ${counts.articles} / ${counts.taxonomy} taxonomy   Errors: ${counts.errors}   Warnings: ${counts.warnings}`);
  process.exit(counts.errors > 0 ? 1 : 0);
}
