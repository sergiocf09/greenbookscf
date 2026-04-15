

# Plan: Correcciones Putts General, HandicapModeSelector unificado, y Sliding Equipo

## Resumen — 4 problemas a resolver

1. **Putts General no aparece en resultados** — La sección de rendering solo calcula `total`, no `segments`. Falta renderizar Front/Back/Total por separado cuando `segmentMode === 'segments'`.
2. **Foursomes y Carritos** usan botón viejo "Base Cero / Full Hándicap" en lugar del `HandicapModeSelector` con las 4 modalidades.
3. **Sliding Equipo** no tiene implementación — al seleccionarlo no ocurre nada. Debe leer los hándicaps de la matriz (HandicapMatrix) y aplicar la fórmula de dividir entre 2.
4. **UX del selector**: "Individual" debe decir "Full Hándicap" y el `Select` debe mostrar claramente la opción seleccionada.

---

## Cambio 1 — Putts General en resultados (GroupBetsCard.tsx)

**Problema**: La sección de Putts General (líneas 2293-2367) solo calcula el total de putts. Cuando `segmentMode === 'segments'`, debe calcular ganadores por Front 9, Back 9 y Total 18 por separado, con montos independientes.

**Fix**: Replicar la lógica de Medal General por segmentos: filtrar scores por rango de hoyos (1-9, 10-18, 1-18), calcular ganador de cada segmento, mostrar hasta 3 bloques de resultado.

---

## Cambio 2 — HandicapModeSelector en Foursomes y Carritos (ParejasBets.tsx)

**Problema**: `TeamPressureCard` (línea 808-833) y `CarritosCard` (línea 1068-1092) usan inline `isBaseCero` toggle. Sixes y Vegas ya usan `HandicapModeSelector`.

**Fix**: Reemplazar el botón inline por `<HandicapModeSelector>` en ambas cards:
- `TeamPressureCard`: pasar `bet.handicapConfig`, `bet.teamHandicaps`, `bet.teamA`, `bet.teamB`. `onUpdate` actualiza `teamHandicaps` y `handicapConfig`.
- `CarritosCard`: mismo patrón. Requiere agregar `handicapConfig` como prop y pasarlo desde el padre.
- También en **Loba** (Wolf, línea 526-543), reemplazar el toggle por `HandicapModeSelector` adaptado a su estructura de `playerHandicaps[]`.

---

## Cambio 3 — Sliding Equipo: implementación real (ParejasBets.tsx + handicapUtils.ts)

**Problema**: `HandicapModeSelector.applyMode` no tiene caso para `slidingEquipo` (línea 1205 termina sin handler).

**Solución simplificada** (según instrucción del usuario): usar los hándicaps que ya están en la matriz de handicaps (HandicapMatrix). Para acceder a estos datos desde ParejasBets:

- La matriz de hándicaps almacena strokes por par de jugadores vía `sliding_current` y `getStrokesForCell`.
- `HandicapModeSelector` necesita recibir un prop `matrixStrokes?: Record<string, number>` que mapee `playerId → playerId → strokes` (o los 4 sliding cruzados entre equipos).
- Alternativamente (más simple): el `HandicapModeSelector` lee directamente de la **HandicapMatrix** existente en el state del padre. Dado que ParejasBets no tiene acceso, lo más pragmático es:
  1. Tomar los hándicaps individuales que cada jugador tiene en la matriz (que ya están reflejados en `player.handicap` o en `teamHandicaps` cuando se aplicó sliding global).
  2. Calcular los 4 cruces: A↔C, A↔D, B↔C, B↔D usando diferencias de hándicap.
  3. Sumar los 4, dividir entre 2, y asignar al jugador con mayor hándicap recibido.
  
- Se usa `calcSlidingTeamDifferential` de `handicapUtils.ts` pasándole los slidings calculados a partir de los hándicaps individuales de cada jugador.

**Lógica**: Cuando `slidingEquipo` se selecciona:
```
// Para cada par cruzado, el sliding es la diferencia de HCP
const hcpA1 = player A1 handicap, hcpA2 = A2, hcpB1 = B1, hcpB2 = B2
slidings = { ac: hcpA1 - hcpB1, ad: hcpA1 - hcpB2, bc: hcpA2 - hcpB1, bd: hcpA2 - hcpB2 }
// Positivo = A le da golpes a B
result = calcSlidingTeamDifferential(slidings, teamA, teamB, hcpMap)
// result.teamHandicaps asigna los strokes al jugador receptor
```

Cuando hay medio punto (`result.hasHalf`): se marca en `handicapConfig.slidingHalfPointMode` y se muestra un toggle.

---

## Cambio 4 — UX del selector (ParejasBets.tsx)

- Renombrar `"Individual"` → `"Full Hándicap"` en el `SelectItem`.
- Verificar que `SelectValue` muestra correctamente el texto seleccionado. El componente ShadcnUI `Select` ya maneja esto, pero confirmar que `value={mode}` corresponde al `SelectItem value`.
- Asegurar que el texto visible cuando el menú está colapsado refleja la selección actual.

---

## Archivos afectados

| Archivo | Cambios |
|---------|---------|
| `src/components/bets/GroupBetsCard.tsx` | Putts General: rendering por segmentos F9/B9/T18 |
| `src/components/setup/bets/ParejasBets.tsx` | HandicapModeSelector en Foursomes, Carritos y Loba; implementar `slidingEquipo`; rename "Individual" → "Full Hándicap" |

