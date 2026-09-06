# Resumen de competencias en la ronda histórica

## Qué pasa hoy

En la pestaña **Competencias** de una ronda cerrada, la app hace un único cálculo para cualquier competencia enlazada: suma los golpes del jugador y los compara contra el par del campo. Con eso arma una lista de posiciones y la muestra igual para todas.

Consecuencias verificadas en el código y en los datos de la ronda del 5 de septiembre (PGA Riviera Maya):

- **Ryder Tulum** es una competencia por equipos (Teams Cup), pero se muestra como una lista individual de posiciones "vs par". No aparecen los equipos, ni el marcador de la jornada, ni el partido que jugó el usuario ni su resultado. Es la tarjeta más inconsistente.
- **Medal Neto** tiene tres modalidades configuradas (Gross, Neto y Stableford), pero solo se muestra una columna, y además está mal etiquetada: dice "vs par" neto cuando en realidad es el bruto vs par (no aplica los golpes de ventaja). Tampoco se indica que es una competencia multidía ni que lo mostrado corresponde solo a ese día.

## Qué se va a construir

Dos tarjetas distintas según el tipo de competencia, ambas centradas en el jugador que abre su ronda.

**1. Competencia por equipos (Ryder Tulum)**

- Encabezado con el nombre y la etiqueta de la jornada correspondiente a esa ronda (Día / Sesión).
- Marcador de la jornada: Equipo A – Equipo B con sus colores y los puntos ganados en ese día, más los puntos disputados.
- Bloque destacado "Tu partido": rival(es) o pareja, el resultado con la nomenclatura ya vigente (por ejemplo 3&2, 2UP, AS / All Square) y si el punto fue ganado, perdido o repartido.
- Línea con el acumulado de la copa hasta esa jornada, cuando la copa tiene varios días.

**2. Competencia individual / multidía (Medal Neto)**

- Encabezado indicando que se muestra el resultado de ese día, y que forma parte de una competencia multidía si aplica.
- Una fila resumen por cada modalidad activa (Gross, Neto, Stableford) con la posición del jugador ese día y su marca: vs par bruto, vs par neto y puntos Stableford, calculados correctamente con los golpes de ventaja por hoyo.
- Debajo, el Top 5 de ese día en la modalidad principal, resaltando al jugador logueado.

Ambas tarjetas mantienen el estilo actual de la vista histórica (mismos colores, avatares y tipografías) y siguen siendo de solo lectura.

## Detalles técnicos

- Archivo principal: `src/components/HistoricalRoundView.tsx`. Se reemplaza el bloque de carga de leaderboards (efecto en ~líneas 202-328) y el render de la pestaña (~706-785) por dos componentes nuevos en `src/components/leaderboards/`: `HistoricalCupSummaryCard.tsx` y `HistoricalStrokeSummaryCard.tsx`.
- El cálculo por modalidad se extrae a un helper reutilizable (a partir de la lógica ya existente en `MultiDayLeaderboardDetail.tsx`, líneas ~200-270) que devuelve `grossVsPar`, `netVsPar` y `stablefordTotal` por participante usando `stroke_index` y `handicap_for_leaderboard`, filtrando `hole_scores.confirmed = true`. Se coloca en `src/lib/leaderboardAggregation.ts`.
- Para la copa se reutiliza `useTeamsCup` (`standingsBySlot`, `matchResults`, `teams`, `matches`, `days`) resolviendo el slot por `cup_matches.round_id = roundId`; no se añade lógica de resultados nueva ni se modifica `get_cup_match_result`.
- Sin cambios de base de datos ni de reglas de negocio; solo lectura y presentación.
