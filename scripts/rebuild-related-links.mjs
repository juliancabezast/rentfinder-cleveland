#!/usr/bin/env node
/**
 * Reconstruye el bloque de "relacionados" de cada página.
 *
 * POR QUÉ EXISTE
 * El bloque era una lista fija por cluster: 94 páginas compartían exactamente
 * los mismos 6 enlaces, y el cluster de apartments (68 páginas) usaba 7
 * conjuntos distintos, uno de los cuales cubría 62. Consecuencia: dentro de un
 * cluster de 68, solo unas 7 páginas recibían enlaces de sus hermanas y las
 * otras 61 quedaban con un único entrante — el de su hub. Eso es lo que dejaba
 * 301 de 542 páginas con uno o dos enlaces entrantes.
 *
 * QUÉ HACE
 * Reparte los enlaces con dos criterios a la vez:
 *   1. RELEVANCIA — similitud de coseno sobre TF-IDF de los títulos, dentro del
 *      mismo cluster. Un enlace entre dos páginas que no se parecen no ayuda a
 *      nadie.
 *   2. COBERTURA — antes de llenar por similitud, cada página reclama MIN_IN
 *      entrantes desde sus hermanas más parecidas que todavía tengan hueco. Sin
 *      este paso la similitud sola vuelve a concentrar todo en las mismas pocas.
 * El anchor es el título propio de cada destino, no una frase fija: así deja de
 * haber 63 destinos recibiendo el mismo anchor exacto.
 *
 * USO:  node scripts/rebuild-related-links.mjs [--dry]
 */

import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'public')
const DRY = process.argv.includes('--dry')

const OUT_LINKS = 6   // enlaces que emite cada página
const MIN_IN = 4      // entrantes que cada página debe recibir de sus hermanas

// ── inventario ──────────────────────────────────────────────────────────────
const paginas = []
;(function walk(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const full = join(dir, d.name)
    const rel = relative(PUB, full).split('\\').join('/')
    if (rel === 'rentals' || rel.startsWith('rentals/')) continue  // tiene su propio bloque
    if (existsSync(join(full, 'index.html'))) paginas.push(rel)
    walk(full)
  }
})(PUB)

const RE_INQ = /<aside class="related">[\s\S]*?<\/aside>/
const RE_PROP = /<section class="link-list">[\s\S]*?<\/section>/

const info = new Map()
for (const slug of paginas) {
  const html = readFileSync(join(PUB, slug, 'index.html'), 'utf8')
  const tipo = RE_INQ.test(html) ? 'inq' : (RE_PROP.test(html) ? 'prop' : null)
  if (!tipo) continue
  const t = html.match(/<title>([\s\S]*?)<\/title>/)
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const titulo = (h1 ? h1[1] : (t ? t[1] : slug)).replace(/<[^>]+>/g, '').trim()
  // El cluster define quienes son hermanas. Solo cleveland-rentals se subdivide
  // (apartments, houses, guides...): con dos niveles a ciegas, cada pagina de
  // corporate-leasing/ y housing-partners/ formaba un cluster de si misma y se
  // quedaba con cero entrantes. La raiz se parte por audiencia.
  const seg = slug.split('/')
  let cluster
  if (seg[0] === 'cleveland-rentals' && seg.length > 1) cluster = seg.slice(0, 2).join('/')
  else if (seg.length > 1) cluster = seg[0]
  else cluster = tipo === 'prop' ? 'raiz-propietario' : 'raiz-inquilino'
  info.set(slug, { slug, tipo, titulo, cluster, html })
}

// ── TF-IDF sobre los titulos ────────────────────────────────────────────────
const STOP = new Set(['for','in','the','a','an','of','to','and','or','on','at','is','it','you','your','what','how','with','from','by','are','can','do','does','oh','ohio','wi','cleveland','rent','rental','rentals'])
const toks = (s) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
  .filter(w => w.length > 2 && !STOP.has(w))

const df = new Map()
for (const p of info.values()) {
  p.tf = new Map()
  for (const w of toks(p.titulo)) p.tf.set(w, (p.tf.get(w) || 0) + 1)
  for (const w of p.tf.keys()) df.set(w, (df.get(w) || 0) + 1)
}
const N = info.size
for (const p of info.values()) {
  p.vec = new Map(); let n2 = 0
  for (const [w, c] of p.tf) {
    const v = (1 + Math.log(c)) * Math.log(N / (df.get(w) || 1))
    p.vec.set(w, v); n2 += v * v
  }
  p.norm = Math.sqrt(n2) || 1
}
const sim = (a, b) => {
  let s = 0
  const [x, y] = a.vec.size < b.vec.size ? [a, b] : [b, a]
  for (const [w, v] of x.vec) { const u = y.vec.get(w); if (u) s += v * u }
  return s / (a.norm * b.norm)
}

// ── reparto por cluster ─────────────────────────────────────────────────────
const porCluster = new Map()
for (const p of info.values()) {
  if (!porCluster.has(p.cluster)) porCluster.set(p.cluster, [])
  porCluster.get(p.cluster).push(p)
}

const salientes = new Map([...info.keys()].map(k => [k, []]))
const entrantes = new Map([...info.keys()].map(k => [k, 0]))

for (const [cluster, lista] of porCluster) {
  if (lista.length < 2) continue
  const cap = Math.min(OUT_LINKS, lista.length - 1)

  // similitud dentro del cluster, precalculada
  const vecinos = new Map()
  for (const p of lista) {
    vecinos.set(p.slug, lista.filter(q => q.slug !== p.slug)
      .map(q => ({ q, s: sim(p, q) }))
      .sort((a, b) => b.s - a.s))
  }

  // PASO 1 — cobertura: cada pagina reclama MIN_IN entrantes de sus hermanas
  // mas parecidas que aun tengan hueco. Va primero, porque si se llena por
  // similitud las mismas pocas paginas se quedan con todos los enlaces.
  const objetivo = Math.min(MIN_IN, lista.length - 1)
  for (const destino of lista) {
    const candidatos = vecinos.get(destino.slug)
    for (const { q: fuente } of candidatos) {
      if (entrantes.get(destino.slug) >= objetivo) break
      const out = salientes.get(fuente.slug)
      if (out.length >= cap || out.includes(destino.slug)) continue
      out.push(destino.slug)
      entrantes.set(destino.slug, entrantes.get(destino.slug) + 1)
    }
  }

  // PASO 2 — rellenar los huecos que queden, por similitud pura
  for (const p of lista) {
    const out = salientes.get(p.slug)
    for (const { q } of vecinos.get(p.slug)) {
      if (out.length >= cap) break
      if (out.includes(q.slug)) continue
      out.push(q.slug)
      entrantes.set(q.slug, entrantes.get(q.slug) + 1)
    }
  }
}

// ── escribir ────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
let escritas = 0
for (const p of info.values()) {
  const out = salientes.get(p.slug)
  if (!out.length) continue
  // el hub del cluster siempre presente: mantiene viva la estructura hub-radios
  const hub = p.cluster.includes('/') ? p.cluster : null
  const items = out.map(s => `      <li><a href="/${s}/">${esc(info.get(s).titulo)}</a></li>`)
  if (hub && info.has(hub) && !out.includes(hub) && hub !== p.slug) {
    items.push(`      <li><a href="/${hub}/">${esc(info.get(hub).titulo)}</a></li>`)
  }
  const bloque = p.tipo === 'inq'
    ? `<aside class="related">\n  <h2>Keep exploring</h2>\n  <ul class="link-list">\n${items.join('\n')}\n  </ul>\n</aside>`
    : `<section class="link-list"><h2>Related reading</h2><ul>\n${items.join('\n')}\n</ul></section>`
  const re = p.tipo === 'inq' ? RE_INQ : RE_PROP
  const nuevo = p.html.replace(re, bloque)
  if (nuevo !== p.html) {
    escritas++
    if (!DRY) writeFileSync(join(PUB, p.slug, 'index.html'), nuevo, 'utf8')
  }
}

// ── informe ─────────────────────────────────────────────────────────────────
const vals = [...entrantes.values()]
const hist = vals.reduce((m, v) => (m[Math.min(v, 8)] = (m[Math.min(v, 8)] || 0) + 1, m), {})
console.log(`páginas con bloque: ${info.size} · reescritas: ${escritas}`)
console.log(`enlaces emitidos: ${[...salientes.values()].reduce((n, l) => n + l.length, 0)}`)
console.log('entrantes desde hermanas (0..8+):')
for (let i = 0; i <= 8; i++) console.log(`  ${i === 8 ? '8+' : i}: ${hist[i] || 0}`)
console.log(`  con menos de ${MIN_IN}: ${vals.filter(v => v < MIN_IN).length}`)
const sets = new Set([...salientes.values()].filter(l => l.length).map(l => l.slice().sort().join('|')))
console.log(`conjuntos de enlaces distintos: ${sets.size} (antes eran 123)`)
if (DRY) console.log('  (DRY RUN — no se escribió nada)')
