// build-taxonomy.mjs — deterministically turn the researched keyword universe
// into content/seo/taxonomy.json: config + pillars + clusters + masterHub (metadata)
// + a selected, slugged, CTA-assigned articles[] (the writing plan).
//
//   node scripts/seo/build-taxonomy.mjs [path/to/keyword-universe.json]
//
// Rich hub/pillar PROSE is authored separately into content/seo/hub-content.json
// and merged at generate time. This file owns structure + honest CTA assignment.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CONTENT = join(ROOT, "content", "seo");
const KW_PATH = process.argv[2] || "/Users/julian/.claude/jobs/723b1913/tmp/seo/keyword-universe.json";
const LAUNCH = "2026-07-04";

// ── Config (all grounded in business-truth.md; canonical NAP locked) ──
const config = {
  domain: "https://rentfindercleveland.com",
  brandName: "Rent Finder Cleveland",
  legalName: "Rent Finder Cleveland, LLC",
  phoneDisplay: "(440) 444-4737",
  phoneE164: "+14404444737",
  email: "support@rentfindercleveland.com",
  logo: "https://storage.googleapis.com/gpt-engineer-file-uploads/jsXsoAQvR4VUmghLAayF9urSzXF2/uploads/1770090739139-Rentfinder.png",
  ogImage: "https://storage.googleapis.com/gpt-engineer-file-uploads/jsXsoAQvR4VUmghLAayF9urSzXF2/social-images/social-1770090754992-Rentfinder.png",
  favicon: "https://storage.googleapis.com/gpt-engineer-file-uploads/jsXsoAQvR4VUmghLAayF9urSzXF2/uploads/1770090739139-Rentfinder.png",
  hubBase: "/cleveland-rentals",
  launchDate: LAUNCH,
  footerTagline: "Section 8-friendly rental homes across Greater Cleveland.",
  llmsSummary:
    "Rent Finder Cleveland is a local residential rental service in Cleveland, Ohio. We work with 90+ rental homes — every one accepts Section 8 / Housing Choice Vouchers and is HUD-inspection-ready — concentrated on Cleveland's East and Southeast sides. This site helps renters find houses and apartments for rent in Cleveland OH, understand Section 8 vouchers, and book showings.",
  geo: { region: "US-OH", placename: "Cleveland, Ohio", lat: "41.4993", lng: "-81.6944" },
  areaServed: ["Cleveland", "Cuyahoga County", "East Cleveland", "Slavic Village", "Collinwood", "Glenville", "Buckeye-Shaker", "Old Brooklyn", "Akron", "Lorain", "Elyria"],
  sameAs: ["https://twitter.com/RentFinderCLE", "https://www.facebook.com/RentFinderCleveland"],
  cta: {
    "book-showing": {
      href: "/p/book-showing",
      label: "Schedule a Free Showing",
      pitch: "Ready to see a Section 8-friendly Cleveland home in person?",
      sub: "Pick a time that works for you — no cost, no obligation.",
      blockTitle: "See a Cleveland rental in person",
      blockBody: "Book a free showing with our local leasing team. Every home we work with welcomes Housing Choice Vouchers and is HUD-inspection-ready.",
    },
    contact: {
      href: "/p/book-showing",
      label: "See Available Homes",
      pitch: "Tell our local team what you're looking for.",
      sub: "We add Section 8-ready homes regularly across Greater Cleveland.",
      blockTitle: "Looking for a rental in this area?",
      blockBody: "Tell us what you need and we'll show you what's available now. We work with 90+ voucher-friendly homes across the Cleveland area and add more regularly.",
    },
    apply: {
      href: "/apply",
      label: "Apply Now",
      pitch: "Found a home you like?",
      sub: "Start your rental application online through our secure portal.",
      blockTitle: "Ready to apply?",
      blockBody: "Start your application online in minutes through our secure DoorLoop portal, or book a showing first to see the home in person.",
    },
    "sms-alerts": {
      href: "/p/book-showing",
      label: "Get Rental Updates",
      pitch: "Want to hear about new Cleveland homes first?",
      sub: "Tell us your criteria and we'll reach out when something fits.",
      blockTitle: "Be first to know about new homes",
      blockBody: "Share what you're looking for and our team will contact you as voucher-friendly homes open up across Cleveland.",
    },
  },
};

// ── Cluster metadata (bodies authored in hub-content.json) ──
const clusters = {
  neighborhoods: {
    label: "Cleveland Neighborhoods", hubTitle: "Houses for Rent by Cleveland Neighborhood",
    metaTitle: "Houses for Rent by Cleveland Neighborhood",
    metaDescription: "Rent ranges, transit, and housing stock for renting a house or apartment in every major Cleveland, OH neighborhood — plus Section 8-friendly homes.",
    heroSub: "Compare rent ranges, transit, and what to expect renting in each Cleveland neighborhood — from Ohio City and Tremont to Slavic Village, Collinwood, and Glenville.",
    cardDesc: "Rent-by-neighborhood guides across the city.", cta: "contact", lastUpdated: LAUNCH,
  },
  suburbs: {
    label: "Cleveland Suburbs", hubTitle: "Houses for Rent in Cleveland Suburbs",
    metaTitle: "Houses for Rent in the Cleveland Suburbs",
    metaDescription: "Renting in the Cleveland suburbs — Lakewood, Parma, Euclid, Cleveland Heights and more. Rent ranges, commute, and what renters should know.",
    heroSub: "What to know about renting a house or apartment across the Cleveland suburbs — rent ranges, commute times, and local details for each community.",
    cardDesc: "Suburb-by-suburb rental guides.", cta: "contact", lastUpdated: LAUNCH,
  },
  houses: {
    label: "Houses by Type & Budget", hubTitle: "Houses for Rent in Cleveland by Type & Budget",
    metaTitle: "Cleveland Houses for Rent by Type & Budget",
    metaDescription: "Find Cleveland houses for rent by bedrooms, budget, and features — 2 and 3 bedroom homes, under $1,000, pet friendly, with a yard, and more.",
    heroSub: "Browse Cleveland rental homes the way you actually search — by bedrooms, monthly budget, and the features that matter to you.",
    cardDesc: "By bedrooms, price, and features.", cta: "book-showing", lastUpdated: LAUNCH,
  },
  apartments: {
    label: "Cleveland Apartments", hubTitle: "Apartments for Rent in Cleveland",
    metaTitle: "Apartments for Rent in Cleveland OH by Area & Budget",
    metaDescription: "Cleveland apartments for rent by neighborhood, size, and budget — studios, 1 and 2 bedrooms, downtown lofts, and cheap apartments under $1,000.",
    heroSub: "Apartment-hunting in Cleveland — by neighborhood, size, and budget, including affordable and voucher-friendly options.",
    cardDesc: "Studios to 2-bedrooms, by area and price.", cta: "book-showing", lastUpdated: LAUNCH,
  },
  "section-8": {
    label: "Section 8 & Vouchers", hubTitle: "Section 8 Housing & Vouchers in Cleveland",
    metaTitle: "Section 8 Housing & Vouchers in Cleveland OH",
    metaDescription: "How Section 8 and Housing Choice Vouchers work in Cleveland (CMHA) — applying, waitlists, payment standards, inspections, and finding voucher-friendly homes.",
    heroSub: "Everything Cleveland renters need to know about Housing Choice Vouchers and CMHA — and how to find homes that welcome them. Every home we work with accepts Section 8.",
    cardDesc: "CMHA vouchers, applying, and voucher-friendly homes.", cta: "book-showing", lastUpdated: LAUNCH,
  },
  guides: {
    label: "Renter Guides", hubTitle: "Cleveland & Ohio Renter Guides",
    metaTitle: "Cleveland Renter Guides: Deposits, Applications & Rights",
    metaDescription: "Practical guides for renting in Cleveland and Ohio — security deposits, applications, credit, utilities, tenant rights, and avoiding rental scams.",
    heroSub: "Straight answers to the questions Cleveland renters actually ask — deposits, applications, credit, utilities, Ohio tenant rights, and more.",
    cardDesc: "Deposits, applications, rights, utilities.", cta: "contact", lastUpdated: LAUNCH,
  },
  more: {
    label: "Other Rentals", hubTitle: "Other Cleveland Rentals & Housing Needs",
    metaTitle: "Rooms, Short-Term & Other Cleveland Rentals",
    metaDescription: "Rooms for rent, short-term stays, senior and student housing, and other Cleveland rental needs — what's realistic and where to start.",
    heroSub: "We focus on residential rental homes — here's honest guidance on other Cleveland housing needs and how we can help point you in the right direction.",
    cardDesc: "Rooms, short-term, senior, student and more.", cta: "contact", lastUpdated: LAUNCH,
  },
};

// ── Pillars (metadata; prose in hub-content.json) ──
const pillars = [
  {
    slug: "houses-for-rent-cleveland-oh", cluster: "houses",
    title: "Houses for Rent in Cleveland, OH",
    metaTitle: "Houses for Rent in Cleveland OH | Section 8 Friendly",
    metaDescription: "Houses for rent in Cleveland, OH from a local rental team. 2–3 bedroom homes, ~$700–$1,800/mo, and every home accepts Section 8. Book a free showing.",
    heroSub: "Local, Section 8-friendly rental homes across Cleveland's East, Southeast, and West sides — with a real leasing team you can actually reach.",
    cta: "book-showing", featuredClusters: ["neighborhoods", "houses", "section-8", "suburbs"],
    maxLinks: 30, lastUpdated: LAUNCH,
  },
  {
    slug: "apartments-for-rent-cleveland-oh", cluster: "apartments",
    title: "Apartments for Rent in Cleveland, OH",
    metaTitle: "Apartments for Rent in Cleveland OH by Area & Budget",
    metaDescription: "Apartments for rent in Cleveland, OH — by neighborhood, size, and budget. Affordable and voucher-friendly options, plus how to tour and apply. Book a showing.",
    heroSub: "From downtown lofts to affordable neighborhood apartments — how to find, tour, and rent an apartment in Cleveland.",
    cta: "book-showing", featuredClusters: ["apartments", "neighborhoods", "section-8", "guides"],
    maxLinks: 30, lastUpdated: LAUNCH,
  },
  {
    slug: "section-8-housing-cleveland-oh", cluster: "section-8",
    title: "Section 8 Housing in Cleveland, OH",
    metaTitle: "Section 8 Housing in Cleveland OH | Voucher-Friendly Homes",
    metaDescription: "Section 8 housing in Cleveland, OH — how CMHA vouchers work, applying, payment standards, and finding homes that accept them. Every home we work with is voucher-friendly.",
    heroSub: "The complete Cleveland renter's guide to Housing Choice Vouchers — and a local team whose homes all welcome them.",
    cta: "book-showing", featuredClusters: ["section-8", "guides", "neighborhoods", "houses"],
    maxLinks: 30, lawTopic: true, lastUpdated: LAUNCH,
  },
];

const masterHub = {
  title: "Cleveland Rental Resource Center",
  metaTitle: "Cleveland Rental Guides: Neighborhoods, Section 8 & More",
  metaDescription: "Your guide to renting in Cleveland, OH — houses and apartments by neighborhood, suburb, and budget, plus Section 8 help and renter tips. Book a showing.",
  heroSub: "Everything you need to find and rent your next home across Greater Cleveland — organized by neighborhood, suburb, budget, and housing program.",
  lastUpdated: LAUNCH,
};

// ── Selection + slugging ──
const CLUSTER_MAP = { A: "neighborhoods", B: "suburbs", C: "houses", D: "apartments", E: "section-8", F: "guides", G: "more" };
// how many to keep per source cluster (quality-weighted; C/D/E/F/G kept in full)
const KEEP = { A: 66, B: 46, C: 999, D: 999, E: 999, F: 999, G: 999 };

// Areas where we ACTUALLY manage homes (from business-truth ZIP data) → book-showing
// + inventoryArea flag. Matched as whole words against the TITLE only, and only on
// area clusters, so "central air" / "central business district" can't false-match.
const INVENTORY_AREA_NAMES = [
  // East / Southeast Cleveland (bulk of the portfolio)
  "slavic village", "union-miles", "union miles", "collinwood", "nottingham", "glenville",
  "fairfax", "central", "kinsman", "hough", "st. clair-superior", "st. clair", "st clair",
  "buckeye", "buckeye-shaker", "shaker square", "lee-harvard", "lee-miles",
  // West side (smaller presence)
  "cudell", "detroit-shoreway", "detroit shoreway", "gordon square", "old brooklyn",
  "brooklyn centre", "ohio city", "tremont",
  // Secondary OH cities we actually manage in
  "akron", "lorain", "elyria",
];
const INVENTORY_RE = INVENTORY_AREA_NAMES.map(
  (n) => new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i")
);
const AREA_CLUSTERS = new Set(["neighborhoods", "suburbs", "apartments"]);
// Law/rights topics → lawTopic disclaimer.
const LAW_HINTS = ["deposit", "tenant right", "eviction", "lease", "law", "lead paint", "lead-safe", "source of income", "source-of-income", "landlord", "fair housing", "renters insurance", "notice", "escrow", "application fee", "credit", "co-signer", "cosigner", "income requirement"];

function slugify(s) {
  return s.toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/\$/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function titleize(topic) {
  return topic.replace(/\s*\(Cleveland\)\s*$/i, "").trim();
}

const kw = JSON.parse(readFileSync(KW_PATH, "utf8"));

// bucket by source cluster, keep intent/volume ordering (high>med>low>longtail)
const VOL_RANK = { high: 0, med: 1, low: 2, longtail: 3 };
const bySrc = {};
for (const row of kw) (bySrc[row.cluster] ||= []).push(row);

function chooseCta(clusterKey, isInventory, lawTopic, topic) {
  const t = topic.toLowerCase();
  if (clusterKey === "section-8") return "book-showing";
  if (clusterKey === "houses" || clusterKey === "apartments") return "book-showing";
  if (clusterKey === "guides") {
    if (t.includes("apply") || t.includes("application")) return "apply";
    return "contact";
  }
  if (clusterKey === "more") return "contact";
  // neighborhoods / suburbs
  return isInventory ? "book-showing" : "contact";
}

const articles = [];
const seenSlugs = new Set();
const stats = {};

for (const [src, rows] of Object.entries(bySrc)) {
  const clusterKey = CLUSTER_MAP[src];
  if (!clusterKey) continue;
  const sorted = [...rows].sort((a, b) => (VOL_RANK[a.est_volume] ?? 9) - (VOL_RANK[b.est_volume] ?? 9));
  const keep = KEEP[src] ?? 999;
  let kept = 0;
  for (const row of sorted) {
    if (kept >= keep) break;
    const topic = titleize(row.topic);
    const tl = (row.topic + " " + row.primary_kw + " " + (row.notes || "")).toLowerCase();
    // inventory match: whole-word against TITLE only, area clusters only
    const isInventory = AREA_CLUSTERS.has(clusterKey) && INVENTORY_RE.some((re) => re.test(topic));
    const lawTopic = LAW_HINTS.some((h) => tl.includes(h)) && (clusterKey === "guides" || clusterKey === "section-8");

    let base = slugify(row.primary_kw || topic);
    // tidy: ensure cleveland/oh context is present for area/house/apartment slugs
    if ((clusterKey === "neighborhoods" || clusterKey === "houses" || clusterKey === "apartments") &&
        !/cleveland/.test(base)) base += "-cleveland";
    let slug = base, n = 2;
    while (seenSlugs.has(slug)) slug = `${base}-${n++}`;
    seenSlugs.add(slug);

    articles.push({
      slug,
      cluster: clusterKey,
      title: topic,
      primaryKeyword: row.primary_kw,
      intent: row.intent,
      volume: row.est_volume,
      cta: chooseCta(clusterKey, isInventory, lawTopic, topic),
      ...(isInventory ? { inventoryArea: true } : {}),
      ...(lawTopic ? { lawTopic: true } : {}),
      brief: row.notes || "",
    });
    kept++;
    stats[clusterKey] = (stats[clusterKey] || 0) + 1;
  }
}

const taxonomy = { config, masterHub, pillars, clusters, articles };
mkdirSync(CONTENT, { recursive: true });
writeFileSync(join(CONTENT, "taxonomy.json"), JSON.stringify(taxonomy, null, 2) + "\n");

// report
console.log(`taxonomy.json written: ${articles.length} articles, ${pillars.length} pillars, ${Object.keys(clusters).length} clusters`);
for (const [k, v] of Object.entries(stats)) console.log(`  ${String(v).padStart(4)}  ${k}`);
const ctaCounts = {};
for (const a of articles) ctaCounts[a.cta] = (ctaCounts[a.cta] || 0) + 1;
console.log("  CTA:", JSON.stringify(ctaCounts));
console.log("  inventoryArea articles:", articles.filter((a) => a.inventoryArea).length);
console.log("  lawTopic articles:", articles.filter((a) => a.lawTopic).length);
