// generate-static-site.mjs — turns content/seo/{taxonomy,articles} into static HTML
// under public/, plus sitemap.xml and llms.txt. Idempotent: the hub namespace
// (public/cleveland-rentals) is fully rebuilt each run so removed articles don't linger.
//
//   node scripts/seo/generate-static-site.mjs [--quiet]
//
// Owns and (re)writes:
//   public/cleveland-rentals/**            (master hub, cluster hubs, articles, css)
//   public/<pillar-slug>/index.html        (money pillars)
//   public/sitemap.xml                     (all indexable URLs)
//   public/llms.txt                        (AI crawler guide)

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  STYLES, renderArticle, renderHub, articlePath, clusterHubPath, masterHubPath, pillarPath,
} from "./render.mjs";
import { validateArticle, buildRouteSet } from "./validate-content.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CONTENT = join(ROOT, "content", "seo");
const ARTICLES_DIR = join(CONTENT, "articles");
const PUBLIC = join(ROOT, "public");
const QUIET = process.argv.includes("--quiet");

const log = (...a) => { if (!QUIET) console.log(...a); };

function writeFile(relPathFromPublic, html) {
  const full = join(PUBLIC, relPathFromPublic);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
}
// write an index.html for a directory URL like /cleveland-rentals/neighborhoods/
function writePage(urlPath, html) {
  const rel = urlPath.replace(/^\//, "").replace(/\/$/, "");
  writeFile(join(rel, "index.html"), html);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Load ──
const taxonomy = JSON.parse(readFileSync(join(CONTENT, "taxonomy.json"), "utf8"));
const cfg = taxonomy.config;
cfg.year = cfg.year || new Date().getFullYear();
const routes = buildRouteSet(taxonomy);
const taxonomySlugs = new Set((taxonomy.articles || []).map((a) => a.slug));

// Authored hub/pillar prose (optional) — merged over taxonomy metadata at render.
// Shape: { masterHub:{...}, pillars:{ "<slug>":{...} }, clusters:{ "<key>":{...} } }
const HUB_CONTENT_PATH = join(CONTENT, "hub-content.json");
const hubContent = existsSync(HUB_CONTENT_PATH)
  ? JSON.parse(readFileSync(HUB_CONTENT_PATH, "utf8"))
  : { masterHub: {}, pillars: {}, clusters: {} };
const BODY_FIELDS = ["answerBox", "intro", "sections", "faq", "heroSub", "eyebrow", "linkHeading", "cardDesc"];
function mergeBody(base, extra) {
  const out = { ...base };
  if (extra) for (const f of BODY_FIELDS) if (extra[f] !== undefined) out[f] = extra[f];
  return out;
}

const articleFiles = existsSync(ARTICLES_DIR)
  ? readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".json"))
  : [];
const articles = articleFiles.map((f) => JSON.parse(readFileSync(join(ARTICLES_DIR, f), "utf8")));
const bySlug = new Map(articles.map((a) => [a.slug, a]));
const byCluster = new Map();
for (const a of articles) {
  if (!byCluster.has(a.cluster)) byCluster.set(a.cluster, []);
  byCluster.get(a.cluster).push(a);
}
for (const list of byCluster.values()) list.sort((x, y) => (x.title || "").localeCompare(y.title || ""));

// ── Clean hub namespace for idempotency ──
const HUB_DIR = join(PUBLIC, cfg.hubBase.replace(/^\//, ""));
if (existsSync(HUB_DIR)) rmSync(HUB_DIR, { recursive: true, force: true });

// ── Shared CSS ──
writeFile(join(cfg.hubBase.replace(/^\//, ""), "assets", "rentals.css"), STYLES);

// ── Helper: related links for an article (same cluster, then pillar) ──
function relatedFor(article) {
  const siblings = (byCluster.get(article.cluster) || []).filter((a) => a.slug !== article.slug);
  const picks = siblings.slice(0, 6).map((a) => ({ title: a.title, path: articlePath(cfg, a) }));
  // always add the cluster hub + relevant pillar
  const cluster = taxonomy.clusters[article.cluster];
  if (cluster) picks.push({ title: cluster.hubTitle || `All ${cluster.label}`, path: clusterHubPath(cfg, article.cluster) });
  return picks.slice(0, 7);
}

function trailFor(article) {
  const cluster = taxonomy.clusters[article.cluster];
  return [
    { name: "Home", path: "/" },
    { name: "Rental Resource Center", path: masterHubPath(cfg) },
    { name: cluster?.label || article.cluster, path: clusterHubPath(cfg, article.cluster) },
    { name: article.title, path: articlePath(cfg, article) },
  ];
}

// ── Sitemap collection, bucketed by child sitemap for a proper sitemap index ──
// lastmod discipline (GEO playbook §6): articles carry their real per-file
// lastUpdated; hubs/pillars/static use a FIXED launchDate from config — never
// build time, or Google detects restamping and ignores lastmod sitewide.
const LAUNCH = cfg.launchDate || todayISO();
const sm = {}; // bucket -> [{loc, lastmod}]
function addSm(bucket, loc, lastmod) {
  (sm[bucket] ||= []).push({ loc, lastmod: lastmod || LAUNCH });
}

// ── Render articles (validate; skip hard-error ones) ──
const written = { articles: 0, hubs: 0, pillars: 0, skipped: [] };

for (const article of articles) {
  const { errors } = validateArticle(article, { file: `${article.slug}.json`, routes, taxonomySlugs, cfg });
  if (errors.length) {
    written.skipped.push({ slug: article.slug, errors });
    continue;
  }
  const cluster = taxonomy.clusters[article.cluster];
  const html = renderArticle(cfg, article, {
    trail: trailFor(article),
    related: relatedFor(article),
    clusterLabel: cluster?.label || "Cleveland Rentals",
  });
  const path = articlePath(cfg, article);
  writePage(path, html);
  written.articles++;
  addSm(article.cluster, path, article.lastUpdated);
}

// ── Cluster hubs ──
for (const [key, clusterBase] of Object.entries(taxonomy.clusters || {})) {
  const cluster = mergeBody(clusterBase, hubContent.clusters?.[key]);
  const items = (byCluster.get(key) || []).filter((a) => !written.skipped.find((s) => s.slug === a.slug));
  const links = items.map((a) => ({ title: a.title, path: articlePath(cfg, a) }));
  const page = {
    title: cluster.hubTitle || cluster.label,
    metaTitle: cluster.metaTitle || cluster.hubTitle,
    metaDescription: cluster.metaDescription,
    canonicalPath: clusterHubPath(cfg, key),
    eyebrow: cluster.eyebrow || "Cleveland Rental Resource Center",
    heroSub: cluster.heroSub,
    answerBox: cluster.answerBox,
    intro: cluster.intro || [],
    sections: cluster.sections || [],
    linkGroups: links.length ? [{ heading: cluster.linkHeading || `All ${cluster.label} guides`, links }] : [],
    faq: cluster.faq,
    cta: cluster.cta || "book-showing",
    trail: [
      { name: "Home", path: "/" },
      { name: "Rental Resource Center", path: masterHubPath(cfg) },
      { name: cluster.label, path: clusterHubPath(cfg, key) },
    ],
  };
  writePage(page.canonicalPath, renderHub(cfg, page));
  written.hubs++;
  addSm(key, page.canonicalPath, cluster.lastUpdated);
}

// ── Master hub ──
{
  const cards = Object.entries(taxonomy.clusters || {}).map(([key, c]) => ({
    title: c.hubTitle || c.label,
    desc: c.cardDesc || c.metaDescription,
    path: clusterHubPath(cfg, key),
    linkLabel: `${(byCluster.get(key) || []).length} guides →`,
  }));
  const mh = mergeBody(taxonomy.masterHub || {}, hubContent.masterHub);
  const page = {
    title: mh.title || "Cleveland Rental Resource Center",
    metaTitle: mh.metaTitle || "Cleveland Rental Guides, Neighborhoods & Section 8 Help",
    metaDescription: mh.metaDescription || "Guides to renting houses and apartments across Cleveland, OH — by neighborhood, suburb, budget, and Section 8 voucher. Schedule a showing with a local team.",
    canonicalPath: masterHubPath(cfg),
    eyebrow: "Cleveland, Ohio",
    heroSub: mh.heroSub || "Everything you need to find and rent your next home across Greater Cleveland — organized by neighborhood, suburb, budget, and housing program.",
    answerBox: mh.answerBox,
    intro: mh.intro || [],
    sections: mh.sections || [],
    cards,
    linkGroups: mh.linkGroups || [],
    faq: mh.faq,
    cta: "book-showing",
    trail: [{ name: "Home", path: "/" }, { name: "Rental Resource Center", path: masterHubPath(cfg) }],
  };
  writePage(page.canonicalPath, renderHub(cfg, page));
  written.hubs++;
  addSm("core", page.canonicalPath, cfg.masterHub?.lastUpdated);
}

// ── Pillars ──
for (const pillarBase of taxonomy.pillars || []) {
  const pillar = mergeBody(pillarBase, hubContent.pillars?.[pillarBase.slug]);
  const clusterKey = pillar.cluster;
  const items = (byCluster.get(clusterKey) || []).filter((a) => !written.skipped.find((s) => s.slug === a.slug));
  const featured = (pillar.featuredClusters || [clusterKey]).map((k) => {
    const c = taxonomy.clusters[k];
    return { title: c?.hubTitle || k, desc: c?.cardDesc || c?.metaDescription, path: clusterHubPath(cfg, k), linkLabel: "Browse →" };
  });
  const topLinks = items.slice(0, pillar.maxLinks || 24).map((a) => ({ title: a.title, path: articlePath(cfg, a) }));
  const page = {
    title: pillar.title,
    metaTitle: pillar.metaTitle,
    metaDescription: pillar.metaDescription,
    canonicalPath: pillarPath(cfg, pillar),
    eyebrow: pillar.eyebrow || "Cleveland, Ohio",
    heroSub: pillar.heroSub,
    answerBox: pillar.answerBox,
    intro: pillar.intro || [],
    sections: pillar.sections || [],
    cards: featured,
    linkGroups: topLinks.length ? [{ heading: pillar.linkHeading || "Popular guides", links: topLinks }] : [],
    faq: pillar.faq,
    cta: pillar.cta || "book-showing",
    lawTopic: pillar.lawTopic,
    trail: [{ name: "Home", path: "/" }, { name: pillar.title, path: pillarPath(cfg, pillar) }],
  };
  writePage(page.canonicalPath, renderHub(cfg, page));
  written.pillars++;
  addSm("pillars", page.canonicalPath, pillar.lastUpdated);
}

// ── Extra static routes (real public pages, not app/auth) ──
for (const s of taxonomy.extraSitemap || [
  { loc: "/" },
  { loc: "/leasingtracker" },
  { loc: "/p/book-showing" },
  { loc: "/sms-signup/" },
  { loc: "/p/privacy-policy" },
  { loc: "/p/terms-of-service" },
]) {
  addSm("core", s.loc, s.lastmod);
}

// ── sitemap index + per-bucket child sitemaps ──
// Modern engines ignore <priority>/<changefreq>, so we emit only <loc>+<lastmod>.
let sitemapUrlCount = 0;
{
  const childFiles = [];
  const buckets = Object.keys(sm).sort();
  for (const bucket of buckets) {
    // de-dupe by loc within the bucket
    const seen = new Set();
    const rows = sm[bucket].filter((u) => (seen.has(u.loc) ? false : (seen.add(u.loc), true)));
    rows.sort((a, b) => a.loc.localeCompare(b.loc));
    sitemapUrlCount += rows.length;
    const body = rows
      .map((u) => `  <url><loc>${cfg.domain}${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`)
      .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
    const fname = `sitemap-${bucket}.xml`;
    writeFileSync(join(PUBLIC, fname), xml);
    // child lastmod = newest url in the child
    const newest = rows.reduce((m, u) => (u.lastmod > m ? u.lastmod : m), "0000-00-00");
    childFiles.push({ fname, lastmod: newest === "0000-00-00" ? LAUNCH : newest });
  }
  const idxBody = childFiles
    .map((c) => `  <sitemap><loc>${cfg.domain}/${c.fname}</loc><lastmod>${c.lastmod}</lastmod></sitemap>`)
    .join("\n");
  const idx = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${idxBody}\n</sitemapindex>\n`;
  writeFileSync(join(PUBLIC, "sitemap.xml"), idx);
}

// ── llms.txt ──
{
  const lines = [];
  lines.push(`# ${cfg.brandName}`);
  lines.push("");
  lines.push(`> ${cfg.llmsSummary || "Residential rental listings and local renter guides for Cleveland, Ohio and its suburbs. We help renters find houses and apartments, including homes that welcome Housing Choice Vouchers (Section 8)."}`);
  lines.push("");
  lines.push(`Contact: ${cfg.phoneDisplay} · ${cfg.email}`);
  lines.push(`Schedule a showing: ${cfg.domain}${cfg.cta["book-showing"].href}`);
  lines.push("");
  lines.push("## Money pages");
  for (const p of taxonomy.pillars || []) lines.push(`- [${p.title}](${cfg.domain}${pillarPath(cfg, p)}): ${p.metaDescription}`);
  lines.push(`- [Cleveland Rental Resource Center](${cfg.domain}${masterHubPath(cfg)}): index of every rental guide.`);
  lines.push("");
  lines.push("## Guide categories");
  for (const [key, c] of Object.entries(taxonomy.clusters || {})) {
    lines.push(`- [${c.hubTitle || c.label}](${cfg.domain}${clusterHubPath(cfg, key)}): ${c.metaDescription || ""}`);
  }
  lines.push("");
  lines.push("## Full index");
  lines.push(`- [XML sitemap](${cfg.domain}/sitemap.xml)`);
  writeFileSync(join(PUBLIC, "llms.txt"), lines.join("\n") + "\n");
}

// ── Summary ──
log(`\n✓ Generated static content hub`);
log(`  articles : ${written.articles}${written.skipped.length ? `  (skipped ${written.skipped.length} with errors)` : ""}`);
log(`  hubs     : ${written.hubs}`);
log(`  pillars  : ${written.pillars}`);
log(`  sitemap  : ${sitemapUrlCount} urls in ${Object.keys(sm).length} child sitemaps  ->  public/sitemap.xml (index)`);
log(`  llms.txt : public/llms.txt`);
if (written.skipped.length) {
  log(`\n  Skipped (fix validation errors):`);
  for (const s of written.skipped.slice(0, 20)) log(`   - ${s.slug}: ${s.errors[0]}`);
}
