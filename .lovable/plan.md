## Objetivo

Mostrar todas las cifras monetarias del Balance General y de los popovers de bilateralidad redondeadas al múltiplo de 5 más cercano, manteniendo la suma = $0 (cero pérdida/ganancia agregada).

## Alcance (solo presentación)

- **No** se modifican calculadoras de apuestas, ni `betCalculations.ts`, ni la persistencia. Los cálculos internos siguen con precisión decimal.
- El redondeo se aplica **solo al renderizar** los totales agregados por jugador (Balance General) y los montos bilaterales por par.

## Algoritmo de redondeo balanceado (largest-remainder a múltiplos de 5)

Dado un arreglo `values: number[]` cuya suma es ~0:

1. Para cada valor calcular `base = Math.round(v/5)*5` y `residual = v - base`.
2. La suma de `base` puede no ser 0; sea `drift = -Σ base` (en múltiplos de 5, porque Σv ≈ 0).
3. Si `drift > 0` (faltan +5s): elegir los `drift/5` jugadores con mayor `residual` positivo y sumarles +5 a cada uno.
   Si `drift < 0`: elegir los `|drift|/5` con `residual` más negativo y restarles 5.
4. Empates en residual: desempatar por mayor `|valor original|` (los importes grandes absorben el ajuste de forma menos visible), luego por id estable.

Esto garantiza `Σ rounded = 0` y desvíos máximos de ±$2.50 por jugador respecto al valor real.

## Cambios concretos

### 1. `src/lib/formatMoney.ts` — nuevas utilidades

```ts
// Redondea un único valor al múltiplo de 5 más cercano.
roundToNearest5(v: number): number

// Redondea una colección preservando Σ = 0 (largest-remainder).
// keys es opcional para mapeo estable id->valor.
roundGroupToNearest5(values: number[]): number[]
roundGroupToNearest5Map<K>(map: Map<K, number>): Map<K, number>
```

Reusa `fmtMoneySign` / `fmtMoneyAbs` existentes para el render (ya quitan decimales innecesarios; tras redondear a 5 nunca habrá decimales).

### 2. `src/components/bets/BetDashboard.tsx` — Balance General

- Antes de renderizar la lista ordenada de jugadores, pasar el `Map<playerId, totalNet>` por `roundGroupToNearest5Map` y usar el resultado para:
  - el monto mostrado a la derecha (`+$2683.33` → `+$2685`),
  - la línea `Σ = $0 (debe ser $0)` (que seguirá cuadrando exactamente).
- El orden del ranking se calcula con los valores **redondeados** para evitar inconsistencias visuales (dos jugadores con totales muy cercanos podrían intercambiar posición; el desempate por `|valor original|` minimiza esto).

### 3. `src/components/bets/BilateralDetail.tsx` + tarjeta de bilateralidad en `GroupBetsCard.tsx`

- En la vista "Balance Sergio Cruz vs ...":
  - Tomar el `Map<rivalId, bilateralNet>` del jugador base y pasarlo por `roundGroupToNearest5Map`. Esto preserva la propiedad `Σ rivales = -totalBase` (que también será múltiplo de 5).
  - Renderizar los chips (`$258.33`, `$225`, `-$1500`) con esos valores redondeados.
- Dentro del popover de detalle por par (filas Medal/Putts/GIR/etc.):
  - Cada fila individual también se redondea a múltiplo de 5 con `roundToNearest5` simple, y el "Total" del par se recalcula como la **suma de las filas redondeadas** (no como redondeo del total real) para que el usuario vea coherencia fila-por-fila. El pequeño desvío residual se absorbe en la última fila ("ajuste de redondeo") para que el header del avatar siga coincidiendo con la suma visible.

### 4. Otros lugares de render (auditoría rápida)

- `HistoricalBalances.tsx`, `MoneyRankings.tsx`, `MoneyRankingDetail.tsx`: aplicar `roundGroupToNearest5Map` al render del total por jugador (mismo principio: la suma debe seguir siendo 0).
- Tarjetas de Nines/Sixes/Vegas/Wolf/Carritos: dado que sus calculadoras ya emiten enteros con `Math.round`, **no** se tocan salvo que el agregado general las incluya (vía Balance General sí, automáticamente).

## Detalle técnico

- El redondeo se aplica solo en la capa de presentación. Hooks (`useRoundManagement`, `useMoneyRankings`) devuelven los valores precisos; los componentes los transforman al render.
- Tests: añadir `src/test/formatMoney.test.ts` con casos:
  - `[316.67, -316.67]` → `[315, -315]`
  - `[2683.33, -316.67, -1050, -1316.67]` → `[2685, -315, -1050, -1320]` (Σ=0)
  - Arreglos con muchos empates de residual.
- No se cambian queries de base de datos, ni RLS, ni edge functions.

## Validación visual

- Balance General del screenshot debe pasar a: JA +$2685, MSA2 -$315, MSA1 -$1050, SC -$1320 (Σ = $0).
- Bilateral SC vs JA: -$1500 (ya múltiplo de 5, sin cambio). MSA1 $258.33 → $260, MSA2 $225 → $225, JA -$1500 → -$1500. Σ rivales de SC = $260 + $225 - $1500 = -$1015, debe coincidir con el total redondeado de SC en Balance General para esa subdivisión (se cuadra con el algoritmo de redondeo balanceado aplicado a los rivales).
