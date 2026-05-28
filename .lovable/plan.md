## Problema detectado

En el popover bilateral SC vs JA, **Medal General** muestra **−$100**, pero sumando el detalle por tramos del dashboard:

- F9: JA gana → SC paga $50 a JA
- B9: SC y JA empatan en 1° (no hay intercambio entre ellos)
- T18: JA gana → SC paga $100 a JA

Total correcto = **−$150** (no −$100).

### Causa raíz

`computeMedalBilateralForPool` en `src/components/bets/GroupBetsCard.tsx` (línea ~3312) **ignora `segmentMode`**: siempre calcula sobre los 18 hoyos con `config.medalGeneral.amount`, sin sumar F9 ni B9. Por eso el bilateral solo refleja el T18.

Esta función es la fuente autoritativa del bilateral de Medal General tanto en:
- `BilateralDetail.tsx` (fila Medal General dentro del popover)
- `BetDashboard.tsx` (`medalGeneralTotal` que va al header del avatar)

Para **Putts General** y **GIR General** el bilateral se lee de `groupedSummaries[...]?.total`, que sí agrega los `BetSummary` por segmento emitidos por `calculatePuttsGeneralBets` / `calculateGIRGeneralBets`. Por lo tanto los montos ya son correctos en esos dos casos. La revisión es solo para confirmar (no se modifica lógica).

## Cambios

### 1. `src/components/bets/GroupBetsCard.tsx` — `computeMedalBilateralForPool`

Refactorizar para que respete `segmentMode`:

- Extraer la lógica actual en una función interna `computeForSegment(amount, holeFilter)` que calcula netTotals filtrando hoyos y devuelve `{ amount, playerNet, rivalNet }` para el par.
- Si `segmentMode === 'segments'`:
  - Calcular F9 con `frontAmount ?? 50` filtrando hoyos del front (usar `getSegmentHoleRanges(startingHole)`).
  - Calcular B9 con `backAmount ?? 100` filtrando hoyos del back.
  - Calcular T18 con `amount ?? 100`.
  - Sumar los tres `amount` → `bilateralAmount` total.
  - `playerNet` / `rivalNet` retornados = los del T18 (para la descripción "Neto X vs Y" sigue mostrándose el total 18, consistente con cómo se muestra el ganador en el dashboard).
- Si `segmentMode === 'total'`: comportamiento actual.

`getMedalGeneralBilateralResult` no cambia (sigue sumando `groupResult + globalResult` para scope `both`); solo cambia el cálculo subyacente.

### 2. Validación post-cambio

- En SC vs JA: F9 −$50 + B9 $0 + T18 −$100 = **−$150** en el bilateral row y en el header del avatar.
- Para casos sin `segments` (solo total), el resultado no cambia.

## Detalle técnico

Importar `getSegmentHoleRanges` de `@/lib/handicapUtils` en `GroupBetsCard.tsx` (probablemente ya importado para el render de tramos). Reusar el mismo patrón que `medalGeneral.ts` para mantener consistencia.

No se tocan: `BilateralDetail.tsx`, `BetDashboard.tsx`, calculators de Putts/GIR, ni `betCalculations.ts`.
