## Problema

En `src/components/bets/BetDashboard.tsx` (tarjeta de Foursome, ~líneas 2844-3015), la línea de "Unidades" y "Oyeses" se construye parseando el `description` del `BetSummary` que genera `src/lib/bets/teamPressures.ts`. Hoy:

1. En `teamPressures.ts` (líneas 281-295) el summary se empuja **solo si `totalMoney !== 0`**, y dentro de la descripción (líneas 283-285) **solo se agrega "Unidades: …" si `unitsMoney !== 0`** y "Oyeses: …" si `oyesesMoney !== 0`.
2. Resultado: cuando un Foursome queda empatado en unidades u oyeses (o el total es 0), la línea desaparece del dashboard y no se puede dar clic para ver el desglose. Esto rompe la transparencia.
3. La línea visible del dashboard se sirve del string parseado, por lo que el usuario también percibe que "el contador no está registrando bien": en realidad sí cuenta, pero solo aparece cuando hay dinero distinto de 0.

Además, la cuenta de Unidades en el popover ya se calcula de forma independiente (líneas 2856-2894) con `detectScoreBasedMarkers` + `mergeMarkers`, igual que en el motor (`teamPressures.ts` líneas 221-246). Esa cuenta es la "fuente de verdad" para mostrar.

## Cambio

Hacer que la línea de Unidades y de Oyeses se renderice **siempre que la sub-modalidad esté habilitada en el bet**, independientemente de si el `BetSummary` existe o de si el monto es 0. La línea siempre será clickable y mostrará el popover con la contabilidad.

### `src/components/bets/BetDashboard.tsx` (bloque del Foursome card, ~líneas 2844-3160)

1. Dejar de depender de `mySummary.description` para decidir qué líneas mostrar. Calcular `unitsDetail` y `oyesesDetail` siempre (ya se hace) y construir las líneas visibles a partir de ellos.
2. Reemplazar el render `parts.map(...)` por un render directo:
   - Si `bet.unitsConfig?.enabled`: mostrar siempre un chip "Unidades: ±$N" (verde si `unitsDetail.money > 0` desde la perspectiva del jugador base, rojo si <0, gris/neutral si `=0`). Siempre `cursor-pointer + underline decoration-dotted` y siempre abre el popover de unidades.
   - Si `bet.oyesesConfig?.enabled`: mismo patrón con `oyesesDetail.money`.
3. Aplicar el signo desde la perspectiva del jugador base (`isBaseInTeamA`) de manera consistente, igual que se hace hoy en el popover (línea 3008).
4. El popover de unidades ya incluye el desglose por hoyo, el diferencial, y la ventaja otorgada (líneas 2991-3003); mantenerlo. Cuando `diff = 0` y no hay ventaja, mostrar igualmente la tabla con "—" y "Resultado $0" para confirmar el empate.
5. El popover de oyeses ya muestra las wins; mantenerlo y permitir abrir aunque `diff = 0` (mostrará lista de hoyos par 3 sin ganador o empates).

### `src/lib/bets/teamPressures.ts`

Sin cambios funcionales en cálculo. Para que el card de Foursome siga apareciendo cuando todo está en 0 (hoy ya aparece porque el render del card se basa en `bet.enabled`, no en summaries), no hace falta tocar la generación de summaries. La descripción puede seguir omitiendo líneas en $0; ya no se usa para decidir qué mostrar.

## Archivos

- `src/components/bets/BetDashboard.tsx` — único cambio, bloque de sub-modality breakdown dentro del map de `teamPressures.bets`.

No se tocan motores de cálculo (units, oyeses, presiones) ni otros tipos de apuestas.
