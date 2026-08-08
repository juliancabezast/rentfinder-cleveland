#!/usr/bin/env node
/**
 * Genera una página estática por propiedad disponible en public/rentals/.
 *
 * POR QUÉ EXISTE
 * El inventario real —lo único que un inquilino busca de verdad— vivía solo
 * dentro del SPA. Una ficha en /property/<uuid> devuelve el HTML genérico del
 * home: sin dirección, sin precio, sin fotos y sin schema, así que Google no
 * puede indexar una sola casa. Estas páginas son HTML servido tal cual, igual
 * que las 542 guías que ya funcionan.
 *
 * NO tocan /property/:id. Un archivo estático en esa ruta ensombrecería la ruta
 * de React y rompería la ficha interactiva, así que el inventario indexable vive
 * en /rentals/<ciudad>/<direccion>/ — que además es una URL con palabras en vez
 * de un UUID.
 *
 * IDEMPOTENTE. Regenera el árbol completo. Una propiedad que se alquila no se
 * borra: su página se reescribe como "ya no disponible" con noindex,follow y
 * enlaces a las que sí están libres. Borrarla daría un 200 con el shell del SPA
 * (soft 404) y perdería el link equity.
 *
 * USO:  node scripts/generate-listing-pages.mjs
 *       node scripts/generate-listing-pages.mjs --dry
 *
 * Usa la anon key, la misma que ya viaja pública en las páginas estáticas: RLS
 * solo deja ver el catálogo público. No hace falta ningún secreto.
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'rentals')
const DRY = process.argv.includes('--dry')

const SUPABASE = 'https://glzzzthgotfwoiaranmp.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsenp6dGhnb3Rmd29pYXJhbm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NjM5NTksImV4cCI6MjA4NTMzOTk1OX0.zis7q1VXP1IKbL8Zc9B5oe9MPcSyVJbXVCNDYE7d690'
const BASE = 'https://rentfindercleveland.com'
const PHONE = '(440) 444-4737'
const TEL = '+14404444737'
const TODAY = new Date().toISOString().slice(0, 10)

// ── utilidades ──────────────────────────────────────────────────────────────
const e = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const slug = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })

const citySlug = (p) => slug(`${p.city} ${p.state}`)

function propSlug(p) {
  const unit = p.unit_number ? ` unit ${p.unit_number.replace(/[()]/g, '')}` : ''
  return slug(p.address + unit)
}

/** "3 Bedroom Duplex" — tipo legible, sin adjetivos de valor. */
function propTypeLabel(p) {
  const t = { duplex: 'Duplex', single_family: 'House', multi_family: 'Multi-Family Home',
    apartment: 'Apartment', townhouse: 'Townhouse', condo: 'Condo' }[p.property_type]
    || (p.property_type ? p.property_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Home')
  return t
}

/** schema.org: el tipo de residencia que corresponde al property_type. */
function schemaResidenceType(p) {
  return { single_family: 'SingleFamilyResidence', apartment: 'Apartment', condo: 'Apartment' }[p.property_type]
    || 'Residence'
}

const HEAD_ASSETS = `  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <meta name="theme-color" content="#4F46E5">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/cleveland-rentals/assets/rentals.css">`

const ORG_SCHEMA = {
  '@context': 'https://schema.org', '@type': 'RealEstateAgent',
  '@id': `${BASE}/#organization`, name: 'Rent Finder Cleveland',
  legalName: 'Rent Finder Cleveland, LLC', url: `${BASE}/`, telephone: TEL,
  email: 'support@rentfindercleveland.com', logo: `${BASE}/logo-512.png`, image: `${BASE}/og-image.png`,
  address: { '@type': 'PostalAddress', addressLocality: 'Cleveland', addressRegion: 'OH', addressCountry: 'US' },
  areaServed: [
    { '@type': 'City', name: 'Cleveland' }, { '@type': 'City', name: 'East Cleveland' },
    { '@type': 'City', name: 'Akron' }, { '@type': 'City', name: 'Lorain' },
    { '@type': 'City', name: 'Elyria' }, { '@type': 'City', name: 'Milwaukee' },
    { '@type': 'AdministrativeArea', name: 'Cuyahoga County, Ohio' },
    { '@type': 'AdministrativeArea', name: 'Milwaukee County, Wisconsin' },
  ],
  sameAs: ['https://www.facebook.com/RentFinderCleveland'],
}

const header = (cta) => `<header class="site-header">
  <div class="hdr-inner">
    <a class="brand" href="/"><span class="brand-mark">RF</span>Rent Finder Cleveland</a>
    <div class="hdr-actions">
      <a class="hdr-phone" href="tel:${TEL}">${PHONE}</a>
      <a class="btn" href="${cta}">See Available Homes</a>
    </div>
  </div>
</header>`

const footer = () => `<footer class="site-footer"><div class="foot-inner">
    <p class="foot-brand"><strong>Rent Finder Cleveland</strong> — <a href="tel:${TEL}">${PHONE}</a> · <a href="mailto:support@rentfindercleveland.com">support@rentfindercleveland.com</a></p>
    <nav class="foot-links"><a href="/">Home</a> · <a href="/rentals/">Available Rentals</a> · <a href="/cleveland-rentals/">Renter Guides</a> · <a href="/section-8-housing-cleveland-oh/">Section 8 Housing</a> · <a href="/housing-partners/">Housing Partners</a> · <a href="/corporate-leasing/">Corporate Leasing</a></nav>
    <p class="foot-legal">© ${new Date().getFullYear()} Rent Finder Cleveland, LLC. Equal housing opportunity provider, in accordance with the Fair Housing Act. Cleveland, Ohio.</p>
  </div></footer>`

const crumb = (items) => `<nav class="crumb" aria-label="Breadcrumb"><ol>${
  items.map((it, i) => i === items.length - 1
    ? `<li>${e(it.name)}</li>`
    : `<li><a href="${e(it.url)}">${e(it.name)}</a></li>`).join('')}</ol></nav>`

const crumbSchema = (items) => JSON.stringify({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem', position: i + 1, name: it.name, item: BASE + it.url,
  })),
})

function ldjson(...objs) {
  return objs.map(o => `  <script type="application/ld+json">${
    typeof o === 'string' ? o : JSON.stringify(o)}</script>`).join('\n')
}

// ── página de una propiedad ─────────────────────────────────────────────────
function propertyPage(p, hermanas) {
  const cs = citySlug(p)
  const ps = propSlug(p)
  const path = `/rentals/${cs}/${ps}/`
  const src = `seo:rentals/${cs}/${ps}`
  const book = `/p/book-showing?src=${src}`
  const type = propTypeLabel(p)
  const unit = p.unit_number ? `, Unit ${p.unit_number.replace(/[()]/g, '').trim()}` : ''
  const full = `${p.address}${unit}, ${p.city}, ${p.state} ${p.zip_code || ''}`.trim()
  const beds = p.bedrooms ?? null
  const baths = p.bathrooms != null ? Number(p.bathrooms) : null
  const photos = Array.isArray(p.photos) ? p.photos.filter(x => typeof x === 'string' && x.startsWith('http')) : []
  const amen = Array.isArray(p.amenities) ? p.amenities : []
  const soon = p.status === 'coming_soon'

  const h1 = `${beds ? beds + '-Bedroom ' : ''}${type} for Rent at ${p.address}${unit}, ${p.city}, ${p.state}`

  // El <title> DEBE llevar la unidad: sin ella, las dos mitades de un duplex en
  // la misma dirección salen con el titulo identico y compiten entre si. Se
  // arma de mas largo a mas corto y gana la primera variante que entra en 65.
  const unitShort = p.unit_number
    ? ' ' + p.unit_number.replace(/[()]/g, '').replace(/\b(Down|Up)\b/gi, '').trim().replace(/\s+/g, ' ')
    : ''
  const u = unitShort ? ` Unit ${unitShort.trim()}` : ''
  const title = [
    `${beds ? beds + ' Bed ' : ''}${type} for Rent — ${p.address}${u}, ${p.city} ${p.state}`,
    `${beds ? beds + ' Bed ' : ''}${type} — ${p.address}${u}, ${p.city} ${p.state}`,
    `${beds ? beds + ' Bed ' : ''}${type} — ${p.address}${u}, ${p.city}`,
    `${p.address}${u}, ${p.city} — ${beds ? beds + ' Bed ' : ''}${type}`,
  ].find(t => t.length <= 65) || `${p.address}${u}, ${p.city}, ${p.state}`.slice(0, 65)
  const desc = `${beds ? beds + ' bed' : ''}${baths ? ', ' + baths + ' bath' : ''} ${type.toLowerCase()} for rent at ${p.address}, ${p.city} ${p.state} — ${money(p.rent_price)}/month.${p.section_8_accepted ? ' Housing Choice Vouchers welcome.' : ''} Book a free showing online.`.slice(0, 155)

  // Sólo hechos verificables de la ficha. Nada sobre quién vive en la zona:
  // describir a los vecinos es exactamente lo que el Fair Housing Act prohíbe.
  const specs = [
    beds != null && ['Bedrooms', String(beds)],
    baths != null && ['Bathrooms', String(baths)],
    p.square_feet && ['Square feet', Number(p.square_feet).toLocaleString('en-US')],
    ['Property type', type],
    ['Monthly rent', money(p.rent_price)],
    p.deposit_amount != null && ['Security deposit', money(p.deposit_amount)],
    p.application_fee != null && ['Application fee', Number(p.application_fee) === 0 ? 'None' : money(p.application_fee)],
    ['City', `${p.city}, ${p.state}`],
    p.zip_code && ['ZIP code', p.zip_code],
    ['Housing Choice Vouchers (Section 8)', p.section_8_accepted ? 'Welcome' : 'Contact us'],
    p.hud_inspection_ready != null && ['HUD inspection ready', p.hud_inspection_ready ? 'Yes' : 'No'],
    p.pet_policy && ['Pet policy', p.pet_policy],
  ].filter(Boolean)

  const listing = {
    '@context': 'https://schema.org', '@type': 'RealEstateListing',
    '@id': BASE + path + '#listing', url: BASE + path, name: h1,
    description: (p.description || desc).slice(0, 900),
    datePosted: p.listed_date || TODAY, inLanguage: 'en-US',
    ...(photos.length ? { image: photos.slice(0, 12) } : {}),
    provider: { '@id': `${BASE}/#organization` },
    about: {
      '@type': schemaResidenceType(p), name: full,
      address: {
        '@type': 'PostalAddress', streetAddress: `${p.address}${unit}`,
        addressLocality: p.city, addressRegion: p.state,
        ...(p.zip_code ? { postalCode: p.zip_code } : {}), addressCountry: 'US',
      },
      ...(p.latitude && p.longitude
        ? { geo: { '@type': 'GeoCoordinates', latitude: p.latitude, longitude: p.longitude } } : {}),
      ...(beds != null ? { numberOfBedrooms: beds } : {}),
      ...(baths != null ? { numberOfBathroomsTotal: baths } : {}),
      ...(p.square_feet ? { floorSize: { '@type': 'QuantitativeValue', value: p.square_feet, unitCode: 'FTK' } } : {}),
      ...(amen.length ? { amenityFeature: amen.map(a => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })) } : {}),
    },
    offers: {
      '@type': 'Offer', price: Number(p.rent_price), priceCurrency: 'USD',
      businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
      availability: soon ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
      ...(soon && p.coming_soon_date ? { availabilityStarts: p.coming_soon_date } : {}),
      url: BASE + book,
      priceSpecification: {
        '@type': 'UnitPriceSpecification', price: Number(p.rent_price),
        priceCurrency: 'USD', unitCode: 'MON',
      },
    },
  }

  const crumbs = [
    { name: 'Home', url: '/' },
    { name: 'Available Rentals', url: '/rentals/' },
    { name: `${p.city}, ${p.state}`, url: `/rentals/${cs}/` },
    { name: `${p.address}${unit}`, url: path },
  ]

  const gallery = photos.length ? `
      <div class="card-grid photo-grid">${photos.slice(0, 12).map((u, i) => `
        <img src="${e(u)}" alt="${e(`${type} for rent at ${p.address}, ${p.city} ${p.state} — photo ${i + 1}`)}" ${
          i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="800" height="600">`).join('')}
      </div>` : ''

  const body = `${header(book)}
${crumb(crumbs)}
<main>
  <div class="wrap">
    <article>
      <p class="eyebrow">${e(`${p.city}, ${p.state}`)}${p.zip_code ? ' ' + e(p.zip_code) : ''} · ${soon ? 'Coming soon' : 'Available now'}</p>
      <h1>${e(h1)}</h1>
      <p class="answer-box">${e(`${money(p.rent_price)} a month${beds != null ? ` · ${beds} bed` : ''}${baths != null ? ` · ${baths} bath` : ''}${p.square_feet ? ` · ${Number(p.square_feet).toLocaleString('en-US')} sq ft` : ''}. ${p.section_8_accepted ? 'Housing Choice Vouchers (Section 8) are welcome on this home' + (p.hud_inspection_ready ? ' and it is HUD-inspection-ready' : '') + '.' : ''} ${soon ? 'This home is coming soon — book a showing to be first in line.' : 'Book a free showing online in under a minute.'}`)}</p>
      <div class="meta-row">
        <span>Updated <time datetime="${TODAY}">${TODAY}</time></span>
        <span class="dot">·</span><span>${money(p.rent_price)}/mo</span>
        <span class="dot">·</span><span>By the Rent Finder Cleveland team</span>
      </div>
${gallery}
      <div class="cta-inline">
        <div class="cta-txt">Want to see it in person?<small>Free showing, no obligation. Pick a time online or call ${PHONE}.</small></div>
        <a class="btn btn-gold" href="${book}">Book a Showing</a>
      </div>

      <h2>The details</h2>
      <div class="tbl-wrap"><table><tbody>${specs.map(([k, v]) =>
        `<tr><th scope="row">${e(k)}</th><td>${e(v)}</td></tr>`).join('')}</tbody></table></div>
${amen.length ? `
      <h2>What's included</h2>
      <ul>${amen.map(a => `<li>${e(a)}</li>`).join('')}</ul>` : ''}
${p.description ? `
      <h2>About this home</h2>
      ${String(p.description).split(/\n\s*\n/).map(par =>
        `<p>${par.split('\n').map(l => e(l.trim())).filter(Boolean).join('<br>')}</p>`).join('\n      ')}` : ''}
${p.latitude && p.longitude ? `
      <h2>Where it is</h2>
      <p>${e(full)}. <a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(full)}" rel="nofollow noopener" target="_blank">Open in Google Maps</a>.</p>` : ''}

      <h2>How to rent this home</h2>
      <ol>
        <li><strong>Book a showing.</strong> Pick a time online or call ${PHONE}. Showings are free and there is no obligation.</li>
        <li><strong>See the home.</strong> Bring photo ID. If you hold a Housing Choice Voucher, bring your voucher paperwork so we can move fast.</li>
        <li><strong>Apply online.</strong> After the showing you can <a href="/apply">start an application</a> the same day.</li>
      </ol>
${hermanas.length ? `
      <aside class="related">
        <h2>Other homes in ${e(p.city)}</h2>
        <ul class="link-list">${hermanas.slice(0, 6).map(h =>
          `<li><a href="/rentals/${citySlug(h)}/${propSlug(h)}/">${e(
            `${h.bedrooms != null ? h.bedrooms + ' bed ' : ''}${propTypeLabel(h).toLowerCase()} at ${h.address} — ${money(h.rent_price)}/mo`)}</a></li>`).join('')}
          <li><a href="/rentals/${cs}/">All available rentals in ${e(p.city)}, ${e(p.state)}</a></li>
        </ul>
      </aside>` : ''}
      <p class="disclaimer">Rent, availability and terms are current as of ${TODAY} and can change. Rent Finder Cleveland is an equal housing opportunity provider and complies with the Fair Housing Act — we do not select or steer applicants on the basis of race, color, religion, sex, national origin, familial status or disability.</p>
    </article>
  </div>
  <div class="wrap"><div class="cta-block">
    <h2>Ready to see ${e(p.address)}?</h2>
    <p>Book a free showing online in under a minute, or call us and we'll set it up for you.</p>
    <div class="cta-row">
      <a class="btn" href="${book}">Book a Showing</a>
      <a class="btn btn-ghost" href="tel:${TEL}">Call ${PHONE}</a>
    </div>
  </div></div>
</main>
${footer()}`

  return page({
    title, desc, path, body,
    image: photos[0] || `${BASE}/og-image.png`,
    schemas: [ORG_SCHEMA, crumbSchema(crumbs), listing],
  })
}

// ── página de una propiedad ya alquilada (noindex, pero conserva enlaces) ────
function goneePage(p, hermanas) {
  const cs = citySlug(p), ps = propSlug(p)
  const path = `/rentals/${cs}/${ps}/`
  const book = `/p/book-showing?src=seo:rentals/${cs}/${ps}`
  const crumbs = [{ name: 'Home', url: '/' }, { name: 'Available Rentals', url: '/rentals/' },
    { name: `${p.city}, ${p.state}`, url: `/rentals/${cs}/` }, { name: p.address, url: path }]
  const body = `${header(book)}
${crumb(crumbs)}
<main><div class="wrap"><article>
  <p class="eyebrow">${e(`${p.city}, ${p.state}`)}</p>
  <h1>${e(`${p.address} in ${p.city} is no longer available`)}</h1>
  <p class="answer-box">This home has been rented. We add homes across ${e(p.city)} regularly and every one of them welcomes Housing Choice Vouchers — here is what is open right now.</p>
${hermanas.length ? `  <aside class="related"><h2>Available now in ${e(p.city)}</h2><ul class="link-list">${
    hermanas.slice(0, 8).map(h => `<li><a href="/rentals/${citySlug(h)}/${propSlug(h)}/">${e(
      `${h.bedrooms != null ? h.bedrooms + ' bed ' : ''}${propTypeLabel(h).toLowerCase()} at ${h.address} — ${money(h.rent_price)}/mo`)}</a></li>`).join('')
    }<li><a href="/rentals/${cs}/">All available rentals in ${e(p.city)}</a></li></ul></aside>` : ''}
  <div class="cta-row"><a class="btn" href="${book}">See what's available</a><a class="btn btn-ghost" href="tel:${TEL}">Call ${PHONE}</a></div>
</article></div></main>
${footer()}`
  return page({
    title: `${p.address}, ${p.city} — no longer available`,
    desc: `${p.address} in ${p.city}, ${p.state} has been rented. See the homes we have available now.`,
    path, body, image: `${BASE}/og-image.png`, robots: 'noindex, follow',
    schemas: [ORG_SCHEMA, crumbSchema(crumbs)],
  })
}

// ── hubs ────────────────────────────────────────────────────────────────────
function card(p) {
  const photos = Array.isArray(p.photos) ? p.photos.filter(x => typeof x === 'string') : []
  const href = `/rentals/${citySlug(p)}/${propSlug(p)}/`
  return `<li class="hub-card">
    ${photos[0] ? `<a href="${href}"><img src="${e(photos[0])}" alt="${e(`${propTypeLabel(p)} for rent at ${p.address}, ${p.city}`)}" loading="lazy" decoding="async" width="600" height="450"></a>` : ''}
    <h3><a href="${href}">${e(`${p.bedrooms != null ? p.bedrooms + '-bed ' : ''}${propTypeLabel(p).toLowerCase()} — ${p.address}${p.unit_number ? ' ' + p.unit_number.replace(/[()]/g, '').trim() : ''}`)}</a></h3>
    <p>${e(`${money(p.rent_price)}/mo · ${p.city}, ${p.state}${p.zip_code ? ' ' + p.zip_code : ''}${p.square_feet ? ' · ' + Number(p.square_feet).toLocaleString('en-US') + ' sq ft' : ''}`)}${
      p.section_8_accepted ? ' · <strong>Vouchers welcome</strong>' : ''}${p.status === 'coming_soon' ? ' · Coming soon' : ''}</p>
  </li>`
}

function cityHub(city, state, props) {
  const cs = slug(`${city} ${state}`)
  const path = `/rentals/${cs}/`
  const src = `seo:rentals/${cs}`
  const rents = props.map(p => Number(p.rent_price)).filter(Boolean).sort((a, b) => a - b)
  const beds = [...new Set(props.map(p => p.bedrooms).filter(b => b != null))].sort((a, b) => a - b)
  const crumbs = [{ name: 'Home', url: '/' }, { name: 'Available Rentals', url: '/rentals/' }, { name: `${city}, ${state}`, url: path }]
  const body = `${header(`/p/book-showing?src=${src}`)}
${crumb(crumbs)}
<main><div class="wrap"><article>
  <p class="eyebrow">${e(`${city}, ${state}`)}</p>
  <h1>${e(`Houses and Apartments for Rent in ${city}, ${state}`)}</h1>
  <p class="answer-box">${e(`${props.length} home${props.length === 1 ? '' : 's'} available right now in ${city}${
    rents.length ? `, from ${money(rents[0])} to ${money(rents[rents.length - 1])} a month` : ''}${
    beds.length ? ` · ${beds.join(', ')} bedroom${beds.length > 1 ? 's' : ''}` : ''}. Every home welcomes Housing Choice Vouchers (Section 8). Book a free showing online or call ${PHONE}.`)}</p>
  <ul class="card-grid">${props.map(card).join('\n')}</ul>
  <p><a href="/rentals/">See every available rental</a> · <a href="/cleveland-rentals/">Renter guides</a> · <a href="/section-8-housing-cleveland-oh/">Section 8 housing</a></p>
  <p class="disclaimer">Rent and availability are current as of ${TODAY} and can change. Rent Finder Cleveland is an equal housing opportunity provider under the Fair Housing Act.</p>
</article></div>
<div class="wrap"><div class="cta-block">
  <h2>${e(`See a home in ${city} this week`)}</h2>
  <p>Free showings, no obligation. Pick a time online or call us.</p>
  <div class="cta-row"><a class="btn" href="/p/book-showing?src=${src}">Book a Showing</a><a class="btn btn-ghost" href="tel:${TEL}">Call ${PHONE}</a></div>
</div></div></main>
${footer()}`
  return page({
    title: `Rentals in ${city}, ${state} — ${props.length} Available Now`.slice(0, 65),
    desc: `${props.length} homes for rent in ${city}, ${state}${rents.length ? ` from ${money(rents[0])}/mo` : ''}. Housing Choice Vouchers welcome on every home. Book a free showing online.`.slice(0, 155),
    path, body, image: (props.find(p => Array.isArray(p.photos) && p.photos[0])?.photos[0]) || `${BASE}/og-image.png`,
    schemas: [ORG_SCHEMA, crumbSchema(crumbs), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: `Homes for rent in ${city}, ${state}`,
      numberOfItems: props.length,
      itemListElement: props.map((p, i) => ({
        '@type': 'ListItem', position: i + 1,
        url: `${BASE}/rentals/${citySlug(p)}/${propSlug(p)}/`,
        name: `${p.bedrooms != null ? p.bedrooms + '-bedroom ' : ''}${propTypeLabel(p).toLowerCase()} at ${p.address}, ${p.city}`,
      })),
    }],
  })
}

function rootHub(byCity, all) {
  const rents = all.map(p => Number(p.rent_price)).filter(Boolean).sort((a, b) => a - b)
  const crumbs = [{ name: 'Home', url: '/' }, { name: 'Available Rentals', url: '/rentals/' }]
  const body = `${header('/p/book-showing?src=seo:rentals')}
${crumb(crumbs)}
<main><div class="wrap"><article>
  <p class="eyebrow">Updated ${TODAY}</p>
  <h1>Available Rentals — Cleveland, East Cleveland and Milwaukee</h1>
  <p class="answer-box">${e(`${all.length} homes available right now${
    rents.length ? `, from ${money(rents[0])} to ${money(rents[rents.length - 1])} a month` : ''}. Every home welcomes Housing Choice Vouchers (Section 8) and is HUD-inspection-ready. Book a free showing online in under a minute, or call ${PHONE}.`)}</p>
  ${byCity.map(([key, props]) => {
    const [city, state] = [props[0].city, props[0].state]
    return `<h2><a href="/rentals/${key}/">${e(`${city}, ${state}`)}</a> — ${props.length} available</h2>
  <ul class="card-grid">${props.slice(0, 12).map(card).join('\n')}</ul>
  ${props.length > 12 ? `<p><a href="/rentals/${key}/">${e(`See all ${props.length} homes in ${city}`)}</a></p>` : ''}`
  }).join('\n  ')}
  <p class="disclaimer">Rent and availability are current as of ${TODAY} and can change. Rent Finder Cleveland is an equal housing opportunity provider under the Fair Housing Act.</p>
</article></div>
<div class="wrap"><div class="cta-block">
  <h2>Book a free showing</h2>
  <p>Pick a time online and we'll meet you there. No obligation, and vouchers are welcome on every home.</p>
  <div class="cta-row"><a class="btn" href="/p/book-showing?src=seo:rentals">Book a Showing</a><a class="btn btn-ghost" href="tel:${TEL}">Call ${PHONE}</a></div>
</div></div></main>
${footer()}`
  return page({
    title: 'Available Rentals in Cleveland, OH — Vouchers Welcome',
    desc: `${all.length} houses and apartments for rent in Cleveland, East Cleveland and Milwaukee${rents.length ? ` from ${money(rents[0])}/mo` : ''}. Section 8 welcome on every home. Book a free showing.`.slice(0, 155),
    path: '/rentals/', body, image: `${BASE}/og-image.png`,
    schemas: [ORG_SCHEMA, crumbSchema(crumbs), {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: 'Available Rentals — Rent Finder Cleveland', url: `${BASE}/rentals/`,
      about: { '@id': `${BASE}/#organization` },
    }],
  })
}

// ── envoltura HTML ──────────────────────────────────────────────────────────
function page({ title, desc, path, body, image, schemas, robots }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${e(title)}</title>
  <meta name="description" content="${e(desc)}">
  <meta name="robots" content="${robots || 'index, follow, max-image-preview:large, max-snippet:-1'}">
  <link rel="canonical" href="${BASE}${path}">
  <meta name="geo.region" content="US-OH">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="en_US">
  <meta property="og:site_name" content="Rent Finder Cleveland">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(desc)}">
  <meta property="og:url" content="${BASE}${path}">
  <meta property="og:image" content="${e(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${e(image)}">
  <meta name="twitter:title" content="${e(title)}">
  <meta name="twitter:description" content="${e(desc)}">
${HEAD_ASSETS}
  <style>
    .photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:20px 0}
    .photo-grid img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:10px;background:#eee}
    .card-grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
    .hub-card img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:10px;background:#eee}
    .hub-card h3{font-size:1rem;margin:.5rem 0 .25rem}
    .hub-card p{margin:0;color:#4b5563;font-size:.9rem}
    .wrap table{border-collapse:collapse;width:100%;font-size:14.5px;margin:0 0 20px}
    .wrap th,.wrap td{border:1px solid #e6e6ef;padding:9px 12px;text-align:left;vertical-align:top}
    .wrap th[scope=row]{background:#f6f7fb;font-weight:600;width:45%}
  </style>
${ldjson(...schemas)}
</head>
<body>
${body}
</body>
</html>
`
}

// ── main ────────────────────────────────────────────────────────────────────
async function fetchProps() {
  const cols = 'id,address,unit_number,city,state,zip_code,bedrooms,bathrooms,square_feet,property_type,rent_price,deposit_amount,application_fee,status,coming_soon_date,section_8_accepted,hud_inspection_ready,photos,description,amenities,pet_policy,latitude,longitude,listed_date'
  const r = await fetch(`${SUPABASE}/rest/v1/properties?select=${cols}&status=in.(available,coming_soon)&order=city.asc,address.asc`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  return r.json()
}

const props = await fetchProps()
console.log(`Propiedades publicables: ${props.length}`)

const byCityMap = new Map()
for (const p of props) {
  const k = citySlug(p)
  if (!byCityMap.has(k)) byCityMap.set(k, [])
  byCityMap.get(k).push(p)
}
const byCity = [...byCityMap.entries()].sort((a, b) => b[1].length - a[1].length)

// Páginas que existían y ya no están publicables → "ya no disponible", no borrar.
const vivos = new Set(props.map(p => `${citySlug(p)}/${propSlug(p)}`))
const previos = new Set()
if (existsSync(OUT)) {
  for (const c of readdirSync(OUT, { withFileTypes: true }).filter(d => d.isDirectory())) {
    for (const a of readdirSync(join(OUT, c.name), { withFileTypes: true }).filter(d => d.isDirectory())) {
      previos.add(`${c.name}/${a.name}`)
    }
  }
}
const retirados = [...previos].filter(x => !vivos.has(x))

const written = []
function emit(path, html) {
  written.push(path)
  if (DRY) return
  const dir = join(ROOT, 'public', path.replace(/^\/|\/$/g, ''))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html, 'utf8')
}

emit('/rentals/', rootHub(byCity, props))
for (const [key, list] of byCity) {
  emit(`/rentals/${key}/`, cityHub(list[0].city, list[0].state, list))
  for (const p of list) {
    const hermanas = list.filter(x => x.id !== p.id)
    emit(`/rentals/${key}/${propSlug(p)}/`, propertyPage(p, hermanas))
  }
}

// Retirados: se reescriben como "no disponible" apuntando a lo que sí está.
for (const rel of retirados) {
  const [cs] = rel.split('/')
  const list = byCityMap.get(cs) || props
  const dir = join(OUT, rel)
  let addr = rel.split('/')[1].replace(/-/g, ' ')
  let city = cs.replace(/-[a-z]{2}$/, '').replace(/-/g, ' ')
  try {
    const prev = readFileSync(join(dir, 'index.html'), 'utf8')
    const m = prev.match(/<h1>([^<]*)<\/h1>/)
    if (m) addr = m[1].replace(/&#39;/g, "'")
  } catch { /* la página anterior puede no existir */ }
  const fake = { address: addr.replace(/\b\w/g, c => c.toUpperCase()), city: city.replace(/\b\w/g, c => c.toUpperCase()),
    state: cs.slice(-2).toUpperCase(), unit_number: null }
  written.push(`/rentals/${rel}/ (retirada)`)
  if (!DRY) writeFileSync(join(dir, 'index.html'), goneePage(fake, list), 'utf8')
}

// Sitemap propio: sólo lo indexable (las retiradas van noindex y quedan fuera).
const locs = [`${BASE}/rentals/`, ...byCity.map(([k]) => `${BASE}/rentals/${k}/`),
  ...props.map(p => `${BASE}/rentals/${citySlug(p)}/${propSlug(p)}/`)]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map(l => `  <url><loc>${l}</loc><lastmod>${TODAY}</lastmod><changefreq>daily</changefreq></url>`).join('\n')}
</urlset>
`
if (!DRY) writeFileSync(join(ROOT, 'public', 'sitemap-rentals.xml'), sitemap, 'utf8')

console.log(`  hub raíz + ${byCity.length} hubs de ciudad + ${props.length} fichas`)
console.log(`  retiradas reescritas como no-disponible: ${retirados.length}`)
console.log(`  sitemap-rentals.xml: ${locs.length} URLs`)
console.log(DRY ? '  (DRY RUN — no se escribió nada)' : `  escritas ${written.length} páginas`)
