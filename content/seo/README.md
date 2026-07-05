# Cleveland Rentals SEO Content System

Static, pre-rendered content hub published under `public/` (served verbatim by the
host — verified: `/<dir>` and `/<dir>/` both resolve to `/<dir>/index.html`).
Source of truth lives here; HTML is generated, committed, and shipped by any
`vite build` (Lovable included) with zero build-pipeline changes.

## Layout

```
content/seo/
  taxonomy.json          # site config, clusters, pillar + article map (slugs, keywords, briefs)
  articles/<slug>.json   # one file per article (content, written by agents)
scripts/seo/
  render.mjs             # HTML template + JSON-LD builders
  validate-content.mjs   # schema + Fair Housing + link validation (CLI + lib)
  generate-static-site.mjs  # emits public/ pages + sitemap.xml + llms.txt
```

Regenerate everything:

```bash
node scripts/seo/generate-static-site.mjs        # writes into public/
node scripts/seo/validate-content.mjs            # validation only
```

## URL architecture

- `/houses-for-rent-cleveland-oh/` — money pillar ("Houses For Rent in Cleveland OH")
- `/apartments-for-rent-cleveland-oh/` — apartments pillar
- `/section-8-housing-cleveland-oh/` — Section 8 pillar
- `/cleveland-rentals/` — master hub (resource center)
- `/cleveland-rentals/<cluster>/` — cluster hubs
- `/cleveland-rentals/<cluster>/<slug>/` — articles

Clusters: `neighborhoods`, `suburbs`, `houses`, `apartments`, `section-8`, `guides`, `more`
(`more` = funnel-only topics we don't service directly; article routes reader to a form).

All canonical URLs use trailing slash. Internal links must too.

## Article JSON schema (`content/seo/articles/<slug>.json`)

```jsonc
{
  "slug": "houses-for-rent-ohio-city-cleveland",   // must match filename + taxonomy entry
  "cluster": "neighborhoods",
  "title": "Houses for Rent in Ohio City, Cleveland",   // H1, no brand suffix
  "metaTitle": "Houses for Rent in Ohio City, Cleveland OH",  // ≤60 chars, brand appended by template
  "metaDescription": "…",                          // 120–160 chars, includes primary keyword
  "primaryKeyword": "houses for rent ohio city",
  "secondaryKeywords": ["…", "…"],
  "answerBox": "40–60 word direct answer to the page's core query (GEO snippet).",
  "sections": [
    {
      "h2": "Section heading",
      "body": ["Paragraph with **bold** and [internal links](/cleveland-rentals/guides/some-slug/)."],
      "h3s": [ { "h3": "Sub heading", "body": ["…"] } ],       // optional
      "list": { "type": "ul", "items": ["…"] },                 // optional, ul|ol
      "table": { "headers": ["A","B"], "rows": [["1","2"]] }    // optional
    }
  ],
  "faq": [ { "q": "Question?", "a": "Concise answer (plain text, 40–90 words)." } ],  // 4–6 items
  "cta": "book-showing",        // book-showing | apply | sms-alerts | contact
  "sources": ["https://cmha.net/…"],   // external facts used (from the facts pack ONLY)
  "lastUpdated": "2026-07-04"
}
```

### Inline markup allowed in body paragraphs
Only `**bold**` and `[text](href)` links. Links must be:
- internal (start with `/`), resolving to a known article/hub/app route, or
- external `https://` URLs to allowlisted authority domains (see validator) that
  appear in the facts pack.

## Editorial rules (enforced by validator + review agents)

1. **Fair Housing**: never characterize areas by race, religion, national origin,
   familial status, disability, or proxies ("safe", "low crime", "good schools",
   "family-friendly", "exclusive"). Describe housing stock, transit, parks,
   landmarks, distances — objective facts only.
2. **No fabrication**: every number (rents, payment standards, dates, laws) must
   come from `content/seo/facts/` packs with its source. No invented statistics.
3. **Honest claims only**: never promise "no credit check", guaranteed approval,
   or specific availability. We welcome housing vouchers; we don't guarantee any
   specific unit qualifies.
4. **Word count**: 900–1600 words (pillars 1800+). Answer-first writing.
5. **Not legal/financial advice** disclaimer is added by the template — articles
   on law/money topics should still phrase carefully ("Ohio law generally…").
6. No images (by design). No emojis. American English.
