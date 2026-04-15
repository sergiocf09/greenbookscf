
# Plan: Correcciones y Nuevas Funcionalidades

## Resumen de cambios solicitados

Se identifican 6 temas: 2 bugs, 2 mejoras de UX, 1 mejora de funcionalidad, y 1 apuesta nueva.

---

## 1. BUG — Medal General no aparece en resultados sin scores

**Problema**: `calculateMedalForPool` retorna `null` cuando `confirmedScores.length === 0` para todos los jugadores (línea 935 de GroupBetsCard.tsx). Skins Grupal sí aparece porque su resultado incluye estructura de hoyos vacíos.

**Solución**: Cuando `medalGeneral.enabled` y hay al menos 2 jugadores, retornar un resultado con `hasValidScores: false` y `winners: []` en lugar de `null`. Esto hará que `hasGrupales` sea `true` y la tarjeta se renderice mostrando "Sin scores confirmados suficientes" (que ya lo maneja `MedalResultBlock` línea 547).

**Archivos**: `src/components/bets/GroupBetsCard.tsx`

---

## 2. BUG — HandicapMatrix hereda diferencial al revés

**Problema**: En `getStrokesForCell` (línea 169), el cálculo es `rowPlayer.handicap - colPlayer.handicap`. Si Sergio tiene hcp 20 y Carlos hcp 17, la celda de Sergio→Carlos muestra +3 (Sergio da 3 golpes), pero en el golf Sergio RECIBE golpes porque tiene handicap más alto. La convención de la matriz es: positivo = row da golpes (desventaja para row).

**Solución**: Invertir el cálculo a `colPlayer.handicap - rowPlayer.handicap`. Si row tiene hcp mayor, el resultado será negativo (row recibe golpes = ventaja). Esto alinea con la convención de la matriz.

**Archivos**: `src/components/setup/HandicapMatrix.tsx` (una sola línea)

---

## 3. UX — Reubicar botón "Aplicar Sliding" y "Guardar"

**Cambio**: Mover ambos botones de la esquina superior derecha del CardHeader a justo debajo del texto de descripción ("Cada renglón muestra cómo se ve..."). Cuando no hay cambios pendientes, solo aparece "Aplicar Sliding". Cuando hay cambios, aparece "Guardar" al mismo nivel.

**Archivos**: `src/components/setup/HandicapMatrix.tsx`

---

## 4. FEATURE — Botón "Base Cero" en apuestas de parejas

**Contexto**: En cada apuesta de parejas (Foursomes, Carritos, Sixes, Vegas, Loba), los handicaps heredan del setup. El usuario quiere un botón por cada instancia de apuesta que calcule handicaps relativos al mínimo (el jugador con menor hcp queda en 0, los demás muestran la diferencia).

**Implementación**:
- Agregar un botón "Base Cero" en cada tarjeta de apuesta (TeamPressureCard, CarritosCard, etc.) junto al header de la apuesta.
- Al presionar: encontrar el mínimo handicap entre los 4 jugadores seleccionados, restar ese mínimo a todos, y actualizar `teamHandicaps`.
- Es un one-shot: el usuario puede seguir ajustando manualmente después.

**Archivos**: `src/components/setup/bets/ParejasBets.tsx`

---

## 5. FEATURE — Medal General con Front 9 / Back 9 / Total 18

**Cambio al setup**: Agregar un toggle/selector de segmentos (similar a Skins Grupal) con importes independientes para Front 9, Back 9, y Total 18. Default: solo Total 18 con $100.

**Cambio al tipo**: Expandir `MedalGeneralBetConfig` con campos opcionales `frontAmount`, `backAmount`, `segmentMode` ('total' | 'segments'). Cuando `segmentMode === 'segments'`, calcular ganador por cada segmento independientemente.

**Cambio al motor de cálculos**: Actualizar `calculateMedalGeneralBets` y `calculateMedalForPool` para calcular por segmento cuando la configuración lo requiera.

**Cambio a resultados**: `MedalResultBlock` deberá mostrar hasta 3 resultados (Front, Back, Total) cuando está en modo segmentos.

**Archivos**: `src/types/golf.ts`, `src/components/setup/bets/GrupalBets.tsx`, `src/components/bets/GroupBetsCard.tsx`, `src/lib/bets/medalGeneral.ts`, `src/components/setup/bets/defaultBetConfig.ts`

---

## 6. FEATURE — Nueva apuesta "Putts General"

**Descripción**: Idéntica a Medal General pero contando putts en lugar de golpes netos. Pool grupal, menor total de putts gana. Soporta los mismos segmentos (Front 9 / Back 9 / Total 18).

**Implementación**:
- Nuevo tipo `PuttsGeneralBetConfig` en `golf.ts` (sin handicaps, solo amounts y segmentMode).
- Nuevo calculador `calculatePuttsGeneralBets` en `src/lib/bets/puttsGeneral.ts`.
- Agregar sección en `GrupalBets.tsx` justo debajo de Medal General.
- Agregar al `GrupalParticipationMatrix`.
- Agregar resultados en `GroupBetsCard.tsx`.
- Agregar a `defaultBetConfig.ts` y al tipo `BetConfig`.
- Agregar a `betCategories` en `golf.ts`.

**Archivos**: Mismos que Medal General + nuevo archivo `src/lib/bets/puttsGeneral.ts`

---

## Orden de implementación

1. Bug: HandicapMatrix diferencial invertido (1 línea)
2. Bug: Medal General visible sin scores
3. UX: Reubicar botones Sliding/Guardar
4. Feature: Base Cero en parejas
5. Feature: Medal General con segmentos F9/B9/T18
6. Feature: Putts General (nueva apuesta)

## Archivos afectados

| Archivo | Cambios |
|---------|---------|
| `src/components/setup/HandicapMatrix.tsx` | Bug #2, UX #3 |
| `src/components/bets/GroupBetsCard.tsx` | Bug #1, Features #5 y #6 |
| `src/types/golf.ts` | Features #5 y #6 |
| `src/components/setup/bets/GrupalBets.tsx` | Features #5 y #6 |
| `src/components/setup/bets/ParejasBets.tsx` | Feature #4 |
| `src/components/setup/bets/defaultBetConfig.ts` | Features #5 y #6 |
| `src/components/setup/bets/GrupalParticipationMatrix.tsx` | Feature #6 |
| `src/lib/bets/medalGeneral.ts` | Feature #5 |
| `src/lib/bets/puttsGeneral.ts` | Feature #6 (nuevo) |
| `src/lib/bets/index.ts` | Feature #6 |
