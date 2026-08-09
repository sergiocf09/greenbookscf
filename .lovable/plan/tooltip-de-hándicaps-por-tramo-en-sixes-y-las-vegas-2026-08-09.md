# Tooltip de hándicaps por tramo en Sixes y Las Vegas

## Problema

Hoy el ícono ℹ️ de Sixes y Las Vegas muestra una sola lista plana de jugadores con su HCP de campo y sus golpes totales, sin equipos y sin tramos. Eso no refleja lo que realmente pasa en el cálculo:

- Los golpes de cada jugador se asignan hoyo por hoyo según el índice de dificultad del campo (`calculateStrokesPerHole`), no de forma pareja.
- Las parejas rotan por tramo (Sixes: 1–6, 7–12, 13–18; Vegas dinámico: A-B/C-D, A-C/B-D, A-D/B-C).
- Por lo tanto, un mismo jugador puede aportar 2 golpes en el tramo 1 y 0 en el tramo 3, y una pareja puede llegar con más ventaja que otra por puro sorteo de hoyos.

La nota actual en Sixes ("los golpes de cada jugador se mantienen iguales en los tres sets") es engañosa: el total es el mismo, pero los golpes que *caen* en cada tramo no.

## Qué se va a mostrar

El popover pasa a tener, después de la línea de Modalidad/HCP, un bloque por tramo. Cada bloque usa el mismo layout de dos columnas ya usado en Foursomes/Carritos: equipo 1 a la izquierda, equipo 2 a la derecha, alineación tabular.

```text
Sixes — Hándicaps                            [ℹ️]
Modalidad: Bola Baja + Bola Alta · Por set
HCP: Sliding Equipo

TRAMO 1 · Hoyos 1–6
 Equipo 1                    |            Equipo 2
 Sergio C.D.  4.5   0        |        0   9.2  Alejandro S.
 Rodrigo E.  12.0   2        |        4  20.0  Raúl V.
 Golpes en el tramo: 2       |       4  Golpes en el tramo
 Ventaja del tramo: Equipo 2 +2 (hoyos 3, 5, 6, 1)

TRAMO 2 · Hoyos 7–12
 ...
```

Por jugador y por tramo se muestran: nombre, HCP de campo, golpes totales de la apuesta, y **golpes que caen en esos 6 hoyos** (con la lista de hoyos concretos). Al pie de cada tramo, la suma por equipo y el diferencial neto de ventaja de ese tramo.

Para Vegas:
- Variante dinámica (3 tramos de 6 hoyos con rotación de parejas): igual que Sixes, un bloque por tramo con las parejas que le corresponden.
- Variante fija (parejas fijas 18 hoyos): un solo bloque, equipo A vs equipo B, con desglose Front 9 / Back 9 de dónde caen los golpes.
- Respeta el hoyo de salida (si la ronda arranca en el 10, los tramos se listan en orden de juego, igual que hace el motor).

Además, la nota engañosa de Sixes se reemplaza por: "El total de golpes de cada jugador es el mismo en los tres tramos, pero los golpes caen en los hoyos según el índice del campo, por lo que cada tramo puede tener ventajas distintas."

## Detalles técnicos

- `src/components/bets/TeamBetHandicapInfo.tsx`: se agrega una prop opcional `segments?: Array<{ label: string; holes: number[]; teamA: Player[]; teamB: Player[]; teamALabel?: string; teamBLabel?: string }>`. Cuando llega, se renderiza el modo por tramos (reusando el componente interno `TeamColumn`, extendido con una columna extra de "golpes en el tramo"). Sin `segments`, el comportamiento actual (plano o `teamA`/`teamB`) no cambia.
- El cálculo de golpes por hoyo se hace con el mismo helper que usa el motor: `calculateStrokesPerHole(Math.floor(hcp), course)` de `src/lib/handicapUtils.ts`, con `hcp = effectiveHandicaps[playerId] ?? player.handicap` — exactamente la fórmula de `getScore` en `src/lib/bets/sixes.ts` y `src/lib/bets/vegas.ts`, para que los números coincidan siempre con los resultados. Requiere pasar `course` como prop nueva al componente.
- Si `handicapConfig.slidingHalfPointMode === 'halfPoint'`, se marca el medio golpe y el hoyo donde aplica, usando `calculateStrokesPerHoleWithHalf` como en el motor.
- `src/components/bets/SixesResultsCard.tsx`: construye `segments` desde `sixesConfig.sets` (rangos 1–6, 7–12, 13–18) y pasa `course`.
- `src/components/bets/VegasResultsCard.tsx`: construye `segments` desde la variante y `playerA..D` con la misma rotación que `buildVegasSetResults`, respetando `startingHole`; pasa `course`.
- Sin cambios en la lógica de cálculo ni en persistencia: es solo presentación de auditoría.
