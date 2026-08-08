#!/usr/bin/env node
/**
 * Regenera los sitemaps desde lo que hay en public/.
 *
 * POR QUÉ EXISTE
 * El índice llegó a declarar `lastmod 2026-07-04` para los diez hijos cuando
 * sitemap-business ya traía 185 URLs más nuevas: Google no tenía ninguna señal
 * para volver a bajar el archivo, así que los 100 artículos de landlord de julio
 * podían quedar sin descubrir. Un índice escrito a mano se desincroniza siempre;
 * este se calcula.
 *
 * REGLAS
 * - Una URL por directorio con index.html bajo public/, más "/" (el home).
 * - El reparto sigue el prefijo de la ruta, que es el criterio que ya usaba el
 *   sitio. Un prefijo nuevo sin regla cae en business y avisa por consola, para
 *   que nada quede fuera en silencio.
 * - `lastmod` sale de la fecha del último commit que tocó el archivo. Un archivo
 *   sin commit todavía (recién escrito) usa la fecha de hoy.
 * - /rentals/ NO se toca: lo genera scripts/generate-listing-pages.mjs junto con
 *   las páginas, porque su lastmod depende del inventario, no de git.
 *
 * USO:  node scripts/generate-sitemaps.mjs
 *       node scripts/generate-sitemaps.mjs --dry
 */

import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'public')
const BASE = 'https://rentfindercleveland.com'
const DRY = process.argv.includes('--dry')
const TODAY = new Date().toISOString().slice(0, 10)

// prefijo -> sitemap hijo. Se evalúa en orden, gana el primero que coincide.
const REGLAS = [
  // (\/|$) y no \/ a secas: el hub del cluster es "cleveland-rentals/apartments"
  // sin barra final, y con \/ caia en el sitemap por defecto junto a la raiz.
  [/^cleveland-rentals\/guides(\/|$)/, 'guides'],
  [/^cleveland-rentals\/section-8(\/|$)/, 'section-8'],
  [/^cleveland-rentals\/apartments(\/|$)/, 'apartments'],
  [/^cleveland-rentals\/houses(\/|$)/, 'houses'],
  [/^cleveland-rentals\/neighborhoods(\/|$)/, 'neighborhoods'],
  [/^cleveland-rentals\/suburbs(\/|$)/, 'suburbs'],
  [/^cleveland-rentals\/more(\/|$)/, 'more'],
  [/^milwaukee-rentals(\/|$)/, 'milwaukee'],
  [/^(houses-for-rent-cleveland-oh|apartments-for-rent-cleveland-oh|section-8-housing-cleveland-oh)$/, 'pillars'],
  [/^(cleveland-rentals|sms-signup)$/, 'core'],
]
const DEFECTO = 'business'   // raíz + housing-partners/ + corporate-leasing/

// ── fecha del último commit por archivo, en UNA pasada ──────────────────────
const fechas = new Map()
try {
  const raw = execSync('git log --name-only --format=@%cs -- public/', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString()
  let d = null
  for (const line of raw.split('\n')) {
    if (line.startsWith('@')) d = line.slice(1)
    else if (line.trim() && d && !fechas.has(line.trim())) fechas.set(line.trim(), d)
  }
} catch (e) {
  console.warn('  aviso: no se pudo leer git log, se usará la fecha de hoy para todo')
}

// ── recorrer public/ ────────────────────────────────────────────────────────
const rutas = []
function walk(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const full = join(dir, d.name)
    const rel = relative(PUB, full).split('\\').join('/')
    if (rel === 'rentals' || rel.startsWith('rentals/')) continue   // lo genera el otro script
    if (existsSync(join(full, 'index.html'))) rutas.push(rel)
    walk(full)
  }
}
walk(PUB)
rutas.sort()

const grupos = new Map()
const sinRegla = new Set()
function asignar(rel) {
  for (const [re, name] of REGLAS) if (re.test(rel)) return name
  const pre = rel.includes('/') ? rel.split('/')[0] : '(raíz)'
  if (pre !== '(raíz)' && !['housing-partners', 'corporate-leasing'].includes(pre)) sinRegla.add(pre)
  return DEFECTO
}
for (const rel of rutas) {
  const g = asignar(rel)
  if (!grupos.has(g)) grupos.set(g, [])
  grupos.get(g).push(rel)
}
// el home vive en core
if (!grupos.has('core')) grupos.set('core', [])
grupos.get('core').unshift('')

const lastmod = (rel) => fechas.get(`public/${rel}/index.html`) || TODAY

const maxPorHijo = new Map()
for (const [name, list] of grupos) {
  const urls = list.map(rel => {
    const d = rel === '' ? (fechas.get('index.html') || TODAY) : lastmod(rel)
    return { loc: `${BASE}/${rel ? rel + '/' : ''}`, d }
  })
  maxPorHijo.set(name, urls.reduce((m, u) => (u.d > m ? u.d : m), '2000-01-01'))
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.d}</lastmod></url>`).join('\n')}
</urlset>
`
  if (!DRY) writeFileSync(join(PUB, `sitemap-${name}.xml`), xml, 'utf8')
}

// rentals lo genera el otro script, pero el índice tiene que declararlo
const hijos = [...grupos.keys()].sort()
if (existsSync(join(PUB, 'sitemap-rentals.xml'))) {
  const s = execSync(`grep -o '<lastmod>[^<]*' "${join(PUB, 'sitemap-rentals.xml')}" | head -1`, { shell: '/bin/bash' }).toString()
  maxPorHijo.set('rentals', s.replace('<lastmod>', '').trim() || TODAY)
  hijos.push('rentals')
}

const idx = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${hijos.map(h => `  <sitemap><loc>${BASE}/sitemap-${h}.xml</loc><lastmod>${maxPorHijo.get(h)}</lastmod></sitemap>`).join('\n')}
</sitemapindex>
`
if (!DRY) writeFileSync(join(PUB, 'sitemap.xml'), idx, 'utf8')

const total = [...grupos.values()].reduce((n, l) => n + l.length, 0)
console.log(`${total} URLs en ${grupos.size} sitemaps${hijos.includes('rentals') ? ' (+ rentals, generado aparte)' : ''}`)
for (const h of hijos) {
  const n = h === 'rentals' ? '—' : grupos.get(h).length
  console.log(`  sitemap-${h}.xml`.padEnd(32) + `${String(n).padStart(4)} URLs · lastmod ${maxPorHijo.get(h)}`)
}
if (sinRegla.size) console.log(`  AVISO: prefijos sin regla, fueron a ${DEFECTO}: ${[...sinRegla].join(', ')}`)
if (DRY) console.log('  (DRY RUN — no se escribió nada)')
