# Tooltip de auditoría de hándicaps en resultados de apuestas por equipos

## Objetivo

Agregar un ícono pequeño (ℹ️) en el header de cada tarjeta de resultados de apuestas por equipos (Foursomes, Carritos, Sixes, Nines, Vegas) que abra un popover explicando:

- Qué modalidad de juego se configuró (Low Ball / High Ball / Combinado / Match Play, continua, umbral de presión).
- Qué modalidad de hándicap se aplicó (Full Hándicap, Base Cero, Diferencial Equipo, Sliding Equipo, y si se juega medio punto).
- El hándicap index/de ronda de cada jugador y el cálculo (suma/resta) que derivó los golpes efectivos que recibe cada uno en esa apuesta.
- Cuántos golpes juega finalmente cada jugador en esa apuesta (0 para los que no reciben).

Así queda auditable en la pantalla de resultados el mismo detalle que hoy solo se ve en el Setup.

## Comportamiento del popover

Contenido, en bloques compactos:

```text
Foursome 2                                   [ℹ️]
──────────────────────────────────────────────
Modalidad: Low Ball · Presión al 3 · F9/B9/T18
HCP: Sliding Equipo (medio punto: sí)

Jugador            HCP    Golpes en esta apuesta
Sergio C.D.        4.5    0
Alejandro S.       9.2    5
Rodrigo E.        12.0    7
Raúl V. (inv.)    20.0   15

Cálculo: se toma el jugador de menor hándicap
como base (4.5) y cada rival recibe la
diferencia redondeada frente a él.
```

- El texto de "Cálculo" cambia según la modalidad:
  - Full Hándicap: cada jugador juega su hándicap completo.
  - Base Cero: base = menor hándicap del match; golpes = HCP − base.
  - Diferencial Equipo: solo un jugador (o la pareja receptora) recibe la diferencia entre equipos; se indica quién recibe y de cuánto.
  - Sliding Equipo: se promedian/combinan los cruces bilaterales (A-C, A-D, B-C, B-D) y se muestra el resultado, con nota de medio punto si aplica.
- Los golpes mostrados son los realmente usados por el motor de cálculo (`teamHandicaps` de la apuesta), no un recálculo aparte, para que coincidan siempre con los resultados.
- Nombres con el estándar actual: "First Last_Initials" en popovers.
- Invitados marcados como hoy.

## Alcance por apuesta

- Foursomes (Presiones por parejas): ícono en el header, junto al monto/balance.
- Carritos: mismo ícono en su header.
- Sixes, Nines, Vegas: mismo ícono, mostrando los hándicaps por jugador usados y la nota de la modalidad correspondiente (Nines no usa modalidades de equipo; se indica su regla propia).

## Detalles técnicos

- Nuevo componente reutilizable `src/components/bets/TeamBetHandicapInfo.tsx`:
  - Props: `players`, `teamHandicaps` (o `playerHandicaps`), `handicapConfig`, `scoringType`, extras opcionales (`openingThreshold`, `continua`), `disambiguatedNames`.
  - Renderiza `Popover` + `PopoverTrigger` con `Info` de lucide (h-3.5 w-3.5, `text-muted-foreground`), reutilizando el patrón de popovers existente en `NinesResultsCard`/`CarritosResultsCard` (ancho `w-[320px]`, `max-h-[70vh] overflow-y-auto`, `side="top"`).
  - Deriva el texto de cálculo con un helper puro (mismos labels que `HANDICAP_MODE_LABELS` en `ParejasBets.tsx`) para no duplicar terminología.
- Integración:
  - `src/components/bets/BetDashboard.tsx`: header del bloque Foursomes (~línea 2801) recibe el ícono; usa el `bet.teamHandicaps` ya resuelto y `bet.handicapConfig`.
  - `src/components/bets/CarritosResultsCard.tsx`: header (~línea 257), usando `results.teamHandicaps`/`handicapConfig` (se pasan como props si aún no llegan).
  - `src/components/bets/SixesResultsCard.tsx`, `NinesResultsCard.tsx`, `VegasResultsCard.tsx`: header con el mismo componente y sus hándicaps por jugador.
- Solo presentación: no se cambia ninguna lógica de cálculo ni persistencia.
- Ayuda contextual (`ContextualHelp.tsx`): una línea nueva en la sección de resultados mencionando el ícono ℹ️ de auditoría de hándicaps.

No se muestran los handicaps index, se muestran los handicaps course resulta tés del campo, y Tee box de cada jugador y de ahí se hace la matemática que correspnda