

# Plan: Fix Sliding Equipo en Carritos + Toggle de Medio Punto

## Problemas identificados

### 1. Carritos additional teams no reciben `getStrokesForLocalPair`
En línea 327, las `carritosTeams` adicionales no pasan `getStrokesForLocalPair` al `CarritosCard`. Solo el primary (línea 305) lo tiene. Sin esta prop, el `HandicapModeSelector` cae al fallback de diferencias de handicap base en vez de usar los valores reales de la matriz.

### 2. No existe toggle de medio punto cuando `hasHalf === true`
Cuando el cálculo de Sliding Equipo produce un resultado con `.5` (ej: 1.5), no hay UI para que el usuario elija si jugar el medio punto o redondearlo hacia abajo. El `HandicapModeSelector` debe mostrar un toggle condicional que aparezca solo cuando `hasHalf` es `true`.

### 3. El cálculo `calcSlidingTeamDifferential` no diferencia correctamente `halfPoint` vs `roundDown`
En línea 229 de `handicapUtils.ts`: `const rounded = halfPointMode === 'roundDown' ? Math.floor(raw) : Math.floor(raw)` — ambas ramas hacen lo mismo (`Math.floor`). La rama `halfPoint` debería preservar el valor `raw` (con decimal) para que el motor de cálculo lo use.

---

## Cambios

### A. `src/components/setup/bets/ParejasBets.tsx`

1. **Línea 327**: Agregar `getStrokesForLocalPair={getStrokesForLocalPair}` al `CarritosCard` de teams adicionales.

2. **HandicapModeSelector (líneas 1300-1315)**: Después del `Select`, agregar un bloque condicional que muestre un toggle de medio punto:
   - Solo aparece cuando `mode === 'slidingEquipo'` Y el cálculo tiene `hasHalf === true`
   - Label: "Jugar medio punto"
   - Switch: togglea `handicapConfig.slidingHalfPointMode` entre `'halfPoint'` y `'roundDown'`
   - Al cambiar, recalcula los teamHandicaps con el nuevo modo
   - Default: `'roundDown'` (redondeado hacia abajo)

3. Para detectar `hasHalf` sin recalcular todo, almacenar el resultado de `calcSlidingTeamDifferentialFn` en el render del selector (calcular una vez para mostrar el toggle, y usar el valor existente de `handicapConfig.slidingHalfPointMode`).

### B. `src/lib/handicapUtils.ts`

4. **Línea 229**: Fix de la lógica duplicada:
   ```typescript
   // Antes (bug): ambas ramas iguales
   const rounded = halfPointMode === 'roundDown' ? Math.floor(raw) : Math.floor(raw);
   // Después:
   const rounded = Math.floor(raw);
   ```
   La variable `rounded` siempre es `Math.floor(raw)`. La diferencia se aplica correctamente en líneas 235 y 260 con `effectiveStrokes` y `result[recipientId]`. Esto ya está bien — el `rounded` siempre es el floor, y `raw` se usa cuando `halfPoint`. Sin embargo, verificar que `result[recipientId] = halfPointMode === 'halfPoint' ? raw : rounded` funciona: cuando `raw = 1.5` y `halfPoint`, el handicap queda en `1.5`, lo cual se convierte en la lógica del medio punto en el motor de cálculo.

### C. `src/lib/bets/carritos.ts`

5. **Soporte de medio punto en el motor de cálculo**: El motor actual usa `calculateStrokesPerHole(getHandicap(pid), course)` con valores enteros. Cuando `teamHandicaps[pid]` es `1.5`, necesita:
   - Usar `calculateStrokesPerHoleWithHalf` para obtener `strokesPerHole` (entero) + `halfStrokeHole`
   - En `getNet`, en el `halfStrokeHole`, aplicar la regla: si hay empate en ese hoyo, el medio punto convierte el empate en victoria para el equipo que recibe
   - Leer `handicapConfig` del config para saber si `slidingHalfPointMode === 'halfPoint'`

6. Agregar `handicapConfig` a la estructura interna `configs[]` para propagarlo desde `config.carritos.handicapConfig` y `team.handicapConfig`.

---

## Archivos afectados

| Archivo | Cambios |
|---------|---------|
| `src/components/setup/bets/ParejasBets.tsx` | Prop `getStrokesForLocalPair` en carritos adicionales; toggle de medio punto en HandicapModeSelector |
| `src/lib/handicapUtils.ts` | Verificar lógica (ya funcional, solo limpieza cosmética) |
| `src/lib/bets/carritos.ts` | Soporte `halfStrokeHole` + `handicapConfig` para medio punto |

