# Medal General: modalidad de hándicap USGA vs Sliding (bilateral)

## Qué entendí

Hoy Medal General (grupal, en sus dos modalidades: solo Total 18, y Front/Back/Total) calcula un neto único por jugador usando su hándicap individual (el seteado en Setup, editable en la config de la apuesta). Gana quien tenga el neto más bajo del pool y los demás le pagan.

Lo que quieres agregar es el mismo selector que ya existe en Coneja:

- **USGA (individual)** — comportamiento actual: cada jugador recibe golpes según su propio índice; se compara un neto por jugador contra el pool.
- **Sliding (bilateral)** — los golpes se toman de la matriz de hándicaps bilateral (ventajas par por par, incluidas las que se ajustan por sliding). Aquí no hay un "neto único": cada comparación se hace contra cada rival con la ventaja que corresponde a ese par.

Y la regla de ganador en modo Sliding: **un jugador gana el Medal solo si le gana a TODOS los rivales del pool en su comparación bilateral respectiva** (con las ventajas de cada par). Si a alguien no le gana (empata o pierde contra al menos uno), no hay ganador absoluto y nadie cobra ese segmento. Esto aplica en vivo: al hoyo 5, la evaluación se hace con los hoyos confirmados hasta ese momento (ej. ventaja en hoyo 1 y hoyo 2 según el índice de golpe de cada par), y se muestra si alguien ya le va ganando a todos.

Si eso es correcto, lo implemento así:

## Comportamiento

1. Nueva opción en el setup de Medal General: **Hándicap: USGA / Sliding** (misma UI y textos que Coneja). Default `USGA`, por lo que todas las rondas existentes y snapshots cerrados mantienen su cálculo actual.
2. En modo **Sliding**, para cada segmento activo (F9, B9, Total 18 según la modalidad elegida):
   - Para cada par (jugador, rival) se obtienen los golpes desde la matriz bilateral; si el par no tiene entrada (típico en invitados), se calcula al vuelo con la diferencia de índices distribuida por índice de golpe, igual que hace hoy Coneja.
   - Un jugador es **ganador absoluto** del segmento si su neto bilateral es estrictamente menor que el del rival en **cada** comparación.
   - Si hay ganador absoluto: cada rival le paga el importe del segmento (F9/B9/Total tienen su propio importe, como hoy). Si no hay ganador absoluto: el segmento no paga (no se reparte por empate).
3. En modo **USGA** todo queda exactamente como hoy (neto único, empates divididos).
4. La bilateralidad en el Balance General y el detalle par-a-par reflejan el mismo criterio: en Sliding, el importe entre dos jugadores existe solo cuando uno de ellos es ganador absoluto del pool.
5. El tooltip/hoja de auditoría de Medal General mostrará la modalidad usada y, en Sliding, los golpes efectivos por par y el neto de cada comparación, para que se vea la matemática hoyo por hoyo.

## Detalles técnicos

- `src/types/golf.ts`: agregar `handicapMode?: 'individual' | 'bilateral'` a `MedalGeneralBetConfig`.
- `src/components/setup/bets/defaultBetConfig.ts`: default `'individual'`.
- `src/components/setup/bets/GrupalBets.tsx`: toggle USGA/Sliding dentro de la sección de Medal General, replicando el patrón de Coneja (incluye nota explicativa cuando se elige Sliding).
- `src/lib/bets/medalGeneral.ts`: en `computeForSegment`, ramificar por `handicapMode`. Para `bilateral`, reutilizar `getBilateralHandicapForPair` + `calculateStrokesPerHole` (misma resolución que `conejaCalculations.ts`) y emitir summaries solo cuando exista ganador absoluto.
- `src/components/bets/GroupBetsCard.tsx`: aplicar la misma ramificación en `calculateMedalForPool` (tarjeta de resultados) y en `computeMedalBilateralForPool` / `getMedalGeneralBilateralResult` (bilateralidad), más la extensión del sheet de auditoría de `medalGeneral`.
- Sin cambios de base de datos: la config viaja en `rounds.bet_config` (jsonb).
