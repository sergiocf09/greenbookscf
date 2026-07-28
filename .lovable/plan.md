## Dictamen (estado actual, verificado en código)

- `leaderboard_events` (competition_type `teams_cup`) guarda un solo `cup_format` y `start_date`; no hay noción de días.
- `cup_matches` **no tiene columna de día**: sus columnas son `format`, `players`, `strokes_advantage`, `status`, `result_type`, `points_per_match`, `round_id`, `match_order`.
- En `useTeamsCup.fetchAll` hay un backfill que toma **la última ronda vinculada** (`leaderboard_rounds` ordenado por `added_at desc limit 1`) y la asigna a todos los matches sin `round_id`. Con dos o tres días esto **reasignaría matches del día 1 a la ronda del día 2** y rompería resultados.
- El Course HCP de participantes también se sincroniza contra esa única ronda (`match_handicap` se sobreescribe), así que un segundo día con otro campo/tee pisaría los HCP del día anterior.
- Standings: `points_a/points_b` se calculan sumando **todos** los matches del evento (cerrados + provisionales en vivo). O sea, la suma ya es acumulativa por naturaleza — lo que falta es **segmentar por día** y evitar la contaminación del backfill.

Conclusión: la base ya soporta sumar puntos de muchos matches; el trabajo real es (1) introducir el concepto de "día/jornada", (2) atar cada match a su día y a la ronda de ese día, (3) UI de acumulado + consulta por día.

## Propuesta

### 1. Modelo de datos (migración)

- `leaderboard_events.rules_json` guarda la config de días para Teams Cup:
  ```json
  { "cup_days": [ { "day_number": 1, "date": "2026-08-01", "label": "Día 1 - Fourball", "default_format": "fourball" } ] }
  ```
- `cup_matches`: nueva columna `day_number int not null default 1` (+ índice `(leaderboard_id, day_number, match_order)`).
- Los matches existentes quedan en día 1 → sin ruptura.
- Sin cambios en `get_cup_match_result` (opera por match).

### 2. Vinculación de rondas por día

- `leaderboard_rounds` ya permite N rondas por evento. Se resuelve la ronda de cada día por la **fecha de la ronda** contra `cup_days[].date` (mismo patrón que ya usa `getDayForRoundDate` en multi-día).
- Se elimina el backfill "última ronda a todos los matches": pasa a ser "ronda del día X → matches con `day_number = X` y sin `round_id`".
- El sync de Course HCP se hace **por día** (usando la ronda de ese día) y ya no pisa `match_handicap` global: el HCP efectivo se calcula por match según su día.

### 3. Cálculo de puntos

Nuevo módulo `src/lib/teamsCupAggregation.ts`:

- `computeDayStandings(matches, results, dayNumber)` → puntos A/B del día (cerrados + provisionales en vivo, misma regla actual: líder = punto completo, AS = ½).
- `computeCupStandings(days)` → acumulado del torneo, con desglose `perDay[]`, matches en juego, y puntos "asegurados" vs "provisionales".
- `useTeamsCup` expone `standingsByDay`, `standings` (acumulado) y `days`.

### 4. UI

- **Creación** (`CreateTeamsCupDialog`): en el paso 1, selector "Días del evento (1 / 2 / 3)" con fecha, etiqueta y formato por defecto de cada día. Por defecto 1 día → flujo actual intacto.
- **Detalle** (`TeamsCupDetailInline`):
  - Marcador superior permanente con el **acumulado en vivo** (Equipo A x.5 — y.5) + mini barra de progreso, y leyenda "incluye N matches en juego".
  - Debajo, tira de chips por día: `Día 1 · 3–1 (final)`, `Día 2 · 1.5–0.5 (en vivo)`, `Día 3 · pendiente`. Tap en un chip filtra la lista de matches a ese día.
  - Chip "Total" para ver todos los matches agrupados por día.
  - Crear/editar match incluye su día; `CreateRoundFromCupDialog` crea la ronda del día seleccionado y la vincula con esa fecha.
- **Ajustes** (`CupSettingsDialog`): editar días (agregar/quitar/renombrar/fecha), con la misma protección que multi-día: no permitir borrar un día con rondas o matches vinculados.

### 5. Compatibilidad

- Cups existentes: 1 día, chips ocultos si `cup_days.length <= 1` → la pantalla se ve igual que hoy.

## Decisiones que necesito confirmes

1. **Puntos provisionales en el acumulado:** hoy un match en juego ya aporta punto completo al líder. ¿Lo mantengo así en el total (con etiqueta "provisional"), o el total muestra solo puntos cerrados y los provisionales aparte?    Siempre mostrar el total con cerrados y en progreso 
2. **Formato por día:** ¿cada día puede mezclar formatos (p.ej. fourball en la mañana e individuales en la tarde, es decir 2 sesiones el mismo día), o basta un conjunto de matches por día con formato libre por match? ... De acuerdo que pueda haber sesión matutina y vespertina, con diferencia de formatos entre cada día o sesión, se define para cada una de ellas por el organizador 
3. **Máximo de días:** ¿fijo 1–3 como mencionaste, o dejo libre hasta 4–5 por si crece? ... Dejalo libre el # de días y sesiones

## Detalles técnicos

Archivos afectados: migración SQL (columna `day_number`), `src/hooks/useTeamsCup.ts` (fetch por día, fin del backfill global, HCP por día), nuevo `src/lib/teamsCupAggregation.ts`, `src/types/leaderboard.ts` (tipo `CupDay`), `CreateTeamsCupDialog.tsx`, `TeamsCupDetailInline.tsx`, `CupSettingsDialog.tsx`, `CupMatchEditorDialog.tsx`, `CreateRoundFromCupDialog.tsx`, `teamsCupRoundBuilder.ts`.