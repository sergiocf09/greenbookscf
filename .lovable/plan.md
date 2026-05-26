## Diagnóstico

Hoy en la Teams Cup el hándicap es **un entero plano** que se guarda en `leaderboard_participants.match_handicap`. Como el input usa `parseInt`, escribir un decimal (p. ej. `12.4`, que es el HCP Index) trunca y, si se valida o se vuelve a editar, "no deja avanzar". Además **no se sabe de qué tee juega cada jugador**, por lo que es imposible derivar el Course Handicap real cuando se elige el campo.

Lo correcto en USGA es:

```text
Course HCP = round( Index × Slope/113 + (Rating − Par) )
```

Necesitamos guardar el **Index** (decimal) y el **tee** por jugador, y dejar que el sistema calcule el Course HCP cuando ya hay campo seleccionado.

## Cambios

### 1. Base de datos

Agregar columna a `leaderboard_participants`:

- `tee_color text` (nullable; valores: `blue|white|yellow|red`).

`handicap_for_leaderboard` ya es `numeric` → soporta el Index decimal sin migración. `match_handicap` (integer) lo seguiremos usando como Course HCP redondeado y se recalcula automáticamente al elegir campo.

### 2. Captura del HCP Index (entrada)

`**AddCupParticipantsDialog.tsx**`

- Inputs de HCP: `type="number"`, `step="0.1"`, `min="-10"`, `max="54"`, usar `parseFloat` en lugar de `parseInt`.
- Etiqueta cambia de **"HCP"** → **"Index"**.
- Default del invitado: `20.0`. Default de amigos/búsqueda: `currentHandicap` tal cual (ya viene decimal).
- Agregar un **selector de tee** (chips B/W/Y/R con sus colores) en cada renglón del jugador y en el formulario de invitado. Default = `white`.
- En el insert: enviar `handicap_for_leaderboard` con el Index decimal, `match_handicap` = `Math.round(index)` como fallback temporal, y `tee_color`.

**Panel "Asignar Equipos y Hándicaps" (`TeamsCupDetailInline.tsx`)**

- Mismo cambio: input decimal, etiqueta "Index", + selector de tee por renglón.
- `flushAssignDrafts` actualiza `handicap_for_leaderboard` + `tee_color`; `match_handicap` se sigue derivando como redondeo del Index hasta que haya campo.

`**useTeamsCup.ts**`

- Extender `CupParticipant` con `tee_color: string | null`.
- `batchUpdateParticipants` acepta `handicap_for_leaderboard` y `tee_color`.

### 3. Mostrar el Index (lectura)

**Roster de participantes (`TeamsCupDetailInline.tsx`):** sustituir `HCP: {match_handicap}` por:

```
Index: 12.4 · Tee Blanco
```

Cuando ya haya `linkedRoundInfo` (campo elegido) se muestra debajo en muted: `CH: 14` (Course Handicap).

### 4. Cálculo automático del Course HCP al crear la ronda

`**CreateRoundFromCupDialog.tsx**`

- Cuando cambia `courseId`, cargar en paralelo: `course_tees` (rating/slope por tee) y `course_holes` (suma de pars para Par del campo).
- Para cada participante: leer su `tee_color` (con fallback al `teeColor` global del diálogo) y calcular Course HCP con `calculateCourseHandicap(index, slope, rating, par)` de `src/lib/usgaHandicap.ts`.
- En el renglón de cada jugador mostrar: `Index 12.4 → CH 14 (Blanco)` con el tee editable inline (mismo selector de chips). Si edita el tee, recalcula al vuelo.
- En el submit, pasar al builder un mapa `participantId → { courseHandicap, teeColor }`.

`**src/lib/teamsCupRoundBuilder.ts**`

- `CreateRoundFromCupInput.groups[].participantIds` queda igual.
- Agregar `playerOverrides?: Map<participantId, { courseHandicap: number; teeColor: 'blue'|'white'|'yellow'|'red' }>`.
- Al insertar `round_players`, usar `handicap_for_round = courseHandicap` (en lugar de `handicap_for_leaderboard`) y `tee_color` del override; misma lógica para el organizador y para el ghost del invitado.

### 5. Persistir el Course HCP en la Cup (opcional pero recomendable)

Después de crear la ronda, hacer **un update final** a `leaderboard_participants` que sincronice `match_handicap = courseHandicap` para que los matches que se generen usen ese número entero como `strokes_advantage` base. Así la UI muestra coherencia entre la ronda y la cup.

## Detalles técnicos

- HCP Index permitido: −10 a 54 (rango USGA con tolerancia para plus handicaps).
- `parseFloat(value)` con guard: si `Number.isNaN`, no actualizar.
- El selector de tee se renderiza con cuatro chips coloreados (azul/blanco/amarillo/rojo) reutilizando el patrón visual ya presente en `CourseSelect`.
- Si una combinación `course_id + tee_color` no existe en `course_tees`, caer a `course_rating=72, slope=113` (default) y mostrar un aviso pequeño `⚠ tee sin datos` para que el creador lo arregle.
- `match_handicap` queda en integer (no migración) ya que solo es el redondeo del Course HCP.

## Archivos afectados

- migration nueva → `leaderboard_participants.tee_color`
- `src/hooks/useTeamsCup.ts` (interface + batchUpdate)
- `src/components/leaderboards/AddCupParticipantsDialog.tsx`
- `src/components/leaderboards/TeamsCupDetailInline.tsx`
- `src/components/leaderboards/CreateRoundFromCupDialog.tsx`
- `src/lib/teamsCupRoundBuilder.ts`

## Fuera de alcance

- No tocamos `CupMatchEditorDialog` (sigue tomando `match_handicap` ya recalculado).
- No tocamos el motor de scoring ni RLS de `cup_matches` (ya resueltos en el cambio anterior).    Y sigue quedando la posibilidad de cambiar los strokes que recibe alguno equipo al setear el Match, está la info correcta del su course handicap, pero la pueden ajustar en esa parte del seteo del match