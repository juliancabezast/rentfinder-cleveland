---
description: Iniciar sesión Rent Finder Cleveland — pull, dev server, recap + revisión de sistema, sugerir siguiente paso
model: opus
effort: max
disable-model-invocation: true
---

Estás iniciando una sesión de trabajo en **Rent Finder Cleveland**. Usá el **máximo effort de razonamiento**. Hacé TODO lo siguiente, en orden, y al final parás y esperás indicaciones.

## 1. Alinear con el remoto
Corré `git pull --no-edit`. Si falla o hay conflictos de merge, **PARÁ y reportá** — no sigas.

## 2. Confirmar el dev server + ABRIRLO EN CHROME (sin preguntar)
- Chequeá con **curl** que `http://localhost:8080/` responda 200 — no alcanza `lsof`: un Vite colgado escucha el puerto pero no responde (TCP conecta, 0 bytes). Si está colgado, matalo (`kill -9`) y relanzá.
- Si no está arriba: `npm install` si falta `node_modules`, lanzá `npm run dev` en BACKGROUND.
- Apenas responda 200, **abrilo automáticamente en una pestaña nueva de Chrome** — cualquier navegador conectado, **sin preguntar cuál** (ver memoria `chrome-auto-open-localhost`).

## 3. Recap de la última sesión
Usá la **memoria del proyecto** (se auto-carga al inicio: `MEMORY.md` + notas `deferred-followups-saneamiento`, `reorientation-single-tenant`), el doc de trabajo `md/PENDIENTES_SANEAMIENTO.md`, y `git log --oneline -8`. Resumí en 4-6 bullets qué se hizo la última vez.

## 4. Revisión del sistema (health check)
- `git status` (¿working tree limpio? ¿paridad repo=prod?).
- Advisors de Supabase vía MCP (`mcp__supabase__get_advisors` security + performance) — reportá los conteos por categoría y marcá cualquier regresión vs lo documentado (perf ~316, security ~35 al cierre 2026-06-30).
- Marcá cualquier cosa rara (build, drift, bloqueos).

## 5. Sugerir el siguiente paso
De `md/PENDIENTES_SANEAMIENTO.md`, elegí el **ítem pendiente ABIERTO de mayor prioridad** y recomendá arrancar por ahí, con una línea de por qué. Listá aparte lo que está **bloqueado por el usuario** (rebuild de Lovable, credenciales de prueba, revisión legal, confirmar n8n) para que no se pierda.

Presentalo **muy corto** (ver memoria `feedback-concise-startup`): un solo bloque escaneable. Recap en ≤4 bullets, health check en 1 línea por chequeo marcando **solo DELTAS** vs lo documentado (no repitas tablas largas si nada cambió), y la sugerencia en 1-2 líneas. Terminá preguntando qué encaramos.
