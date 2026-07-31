---
description: Iniciar sesión Rent Finder Cleveland — pull, dev server, recap, sugerir siguiente paso
model: opus
effort: max
disable-model-invocation: true
---

Estás iniciando una sesión de trabajo en **Rent Finder Cleveland**. Usá el **máximo effort de razonamiento**. Hacé TODO lo siguiente, en orden, y al final parás y esperás indicaciones.

**Arrancá los pasos 1-3 en paralelo** (son independientes): el pull, el chequeo del server y la lectura de docs pueden ir en un solo bloque de tool calls.

## 1. Alinear con el remoto
Corré `git pull --no-edit`. Si falla o hay conflictos de merge, **PARÁ y reportá** — no sigas.

## 2. Confirmar el dev server + ABRIRLO EN CHROME (sin preguntar)
- Chequeá con **curl** que `http://localhost:8080/` responda 200 — no alcanza `lsof`: un Vite colgado escucha el puerto pero no responde (TCP conecta, 0 bytes). Si está colgado, matalo (`kill -9`) y relanzá.
- **Chequeá que `node_modules` no esté rancio** — no alcanza con que exista. Si `package-lock.json` es más nuevo que `node_modules/.package-lock.json`, está desactualizado → `npm install`. (Pasó el 2026-07-31: node_modules tenía React 18 contra un lock en React 19; el síntoma fue Vite colgado + 10 errores falsos de typecheck.)
- Si no está arriba, lanzá `npm run dev` en BACKGROUND y esperá el 200 con un loop de curl.
- Apenas responda 200, **abrilo automáticamente en Chrome, sin preguntar cuál navegador**. Si la extensión de Chrome no está conectada, caé directo a `open -a "Google Chrome" http://localhost:8080/` — no te trabes ahí.

## 3. Recap de la última sesión
Usá `md/PENDIENTES_SANEAMIENTO.md`, `git log --oneline -8` y la memoria del proyecto **si existe** (`MEMORY.md` + notas sueltas; si el directorio está vacío, seguí sin ella y decilo en una línea). Resumí qué se hizo la última vez.

## 4. Health check liviano
- `git status` (¿working tree limpio? ¿el remoto está al día?).
- Paridad edge functions repo↔prod: `ls supabase/functions | wc -l` vs `mcp__supabase__list_edge_functions`.
- `npm run typecheck` (rápido y atrapa drift real).
- Marcá cualquier cosa rara (build, drift, bloqueos).

**Los advisors de Supabase NO van acá** — son las dos llamadas más pesadas del arranque (devuelven 60-180 KB) y la base casi nunca cambia entre sesiones. Corré `/rfc-db` cuando toques la DB o cuando quieras la foto de seguridad/performance.

## 5. Sugerir el siguiente paso
De `md/PENDIENTES_SANEAMIENTO.md`, elegí el **ítem pendiente ABIERTO de mayor prioridad** y recomendá arrancar por ahí, con una línea de por qué. Listá aparte lo que está **bloqueado por el usuario** (rebuild de Lovable, credenciales de prueba, revisión legal, confirmar n8n) para que no se pierda.

Presentalo **muy corto**: un solo bloque escaneable. Recap en ≤4 bullets, health check en 1 línea por chequeo marcando **solo DELTAS** vs lo documentado (no repitas tablas largas si nada cambió), y la sugerencia en 1-2 líneas. Terminá preguntando qué encaramos.
