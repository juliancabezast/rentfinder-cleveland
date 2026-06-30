---
description: Iniciar sesión Rent Finder Cleveland — pull, dev server, recap + revisión de sistema, sugerir siguiente paso
model: opus
effort: max
disable-model-invocation: true
---

Estás iniciando una sesión de trabajo en **Rent Finder Cleveland**. Usá el **máximo effort de razonamiento**. Hacé TODO lo siguiente, en orden, y al final parás y esperás indicaciones.

## 1. Alinear con el remoto
Corré `git pull --no-edit`. Si falla o hay conflictos de merge, **PARÁ y reportá** — no sigas.

## 2. Confirmar el dev server (la función `rfc` de la terminal ya lo levanta persistente)
- Chequeá si responde `http://localhost:8080/` (ej. `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080` o `lsof -ti:8080`).
- Si está arriba → reportá la URL y ofrecé abrirla en Chrome.
- Si NO está (ej. corriste `/rfc` standalone, sin la función de shell): `npm install` si falta `node_modules`, lanzá `npm run dev` en BACKGROUND y reportá la URL.

## 3. Recap de la última sesión
Usá la **memoria del proyecto** (se auto-carga al inicio: `MEMORY.md` + notas `deferred-followups-saneamiento`, `reorientation-single-tenant`), el doc de trabajo `md/PENDIENTES_SANEAMIENTO.md`, y `git log --oneline -8`. Resumí en 4-6 bullets qué se hizo la última vez.

## 4. Revisión del sistema (health check)
- `git status` (¿working tree limpio? ¿paridad repo=prod?).
- Advisors de Supabase vía MCP (`mcp__supabase__get_advisors` security + performance) — reportá los conteos por categoría y marcá cualquier regresión vs lo documentado (perf ~316, security ~35 al cierre 2026-06-30).
- Marcá cualquier cosa rara (build, drift, bloqueos).

## 5. Sugerir el siguiente paso
De `md/PENDIENTES_SANEAMIENTO.md`, elegí el **ítem pendiente ABIERTO de mayor prioridad** y recomendá arrancar por ahí, con una línea de por qué. Listá aparte lo que está **bloqueado por el usuario** (rebuild de Lovable, credenciales de prueba, revisión legal, confirmar n8n) para que no se pierda.

Presentalo **conciso y escaneable** (usá tablas). Terminá preguntando qué encaramos.
