---
description: Health check de la base — advisors de Supabase (security + performance) con deltas vs lo documentado
model: opus
effort: high
disable-model-invocation: true
---

Foto de salud de la base de Rent Finder Cleveland. Corré esto cuando toques la DB (migraciones, RLS, funciones) o cuando quieras la revisión completa — **no** en cada arranque de sesión.

## 1. Traer los advisors
Llamá `mcp__supabase__get_advisors` para **security** y **performance** (las dos en paralelo, en un solo bloque).

⚠️ **Las respuestas son enormes** (60-180 KB) y el harness las vuelca a un archivo en vez de devolverlas. No intentes leer el archivo entero ni con Read ni por chunks: es **una sola línea de JSON**. Parsealo directo con python, así:

```bash
python3 -c "
import json, collections
def load(f):
    d=json.load(open(f)); return d.get('lints') or d.get('result',{}).get('lints') or []
for label,f in [('SECURITY','<ruta-security>'),('PERFORMANCE','<ruta-perf>')]:
    lints=load(f)
    print(f'=== {label}: {len(lints)} total ===')
    for (n,lvl),c in collections.Counter((l['name'],l['level']) for l in lints).most_common():
        print(f'  {c:>4}  [{lvl}] {n}')
"
```

Para los ítems que valga la pena nombrar, filtrá por `name` e imprimí `detail` recortado — no vuelques la lista completa.

## 2. Comparar contra la línea de base
Referencia documentada (cierre 2026-07-31):

| | Total | Desglose principal |
|---|---|---|
| **security** | 65 | 40 `authenticated_security_definer` · 17 `anon_security_definer` · 4 `rls_policy_always_true` · 2 `rls_enabled_no_policy` · 1 `function_search_path_mutable` · 1 `public_bucket_allows_listing` |
| **performance** | 217 | 137 `multiple_permissive_policies` · 66 `unused_index` · 11 `auth_rls_initplan` · 2 `unindexed_foreign_keys` |

Histórico previo: security 34-35 y performance ~252 al cierre del saneamiento (2026-06-30/07-02). La subida de security vino de **tablas de features nuevas** (tickets, academy, jobs, owner_leads, section8_requests, lead_reminders, telegram_bot_sessions) creadas sin los patrones del hardening de junio.

Reportá **solo los deltas** contra esa tabla. Si un número no se movió, una línea alcanza.

## 3. Contexto para no dar falsos positivos
- **WONTFIX deliberado**: los `multiple_permissive_policies` de las políticas FOR-ALL (admin/service solapando por comando) y los ~84 `unused_index` de FKs nuevas. No los propongas como trabajo salvo que se pidan.
- `rls_enabled_no_policy` en `lead_reminders` y `telegram_bot_sessions` **no rompe nada**: solo las toca `service_role`, que saltea RLS. Backend-only por diseño.
- Los 4 `rls_policy_always_true` son INSERT anónimos de formularios públicos (demo_requests, job_applicants, owner_leads, section8_requests) — intencionales, pero vale revisar que tengan rate-limit.
- Los 12 helpers RLS ejecutables por `anon` están auditados y se quedan.
- El advisor de performance **nativo de Supabase estuvo roto** del lado de ellos en el pasado (error `42601 at 'storage.buckets'`). Si vuelve a fallar, decilo en vez de inventar números.

## 4. Salida
Un bloque corto: conteos por categoría, **deltas marcados**, y si hay regresión real una recomendación concreta de por dónde empezar. Nada de tablas largas si no se movió nada.
