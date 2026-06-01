## Diagnóstico

### Problema 1 — Carritos calcula Back 9 y Total 18 en ronda de 9 hoyos

La ronda actual es `roundHoles = 9`, pero la tarjeta "Carritos 1" muestra:
- Front 9: −$100 ✅
- Back 9: −$100 ❌ (no debería existir)
- Total 18: −$100 ❌ (no debería existir)

El motor (`src/lib/bets/carritos.ts`) ya filtra correctamente:
```
if (!isNineHole && back.pA !== back.pB) segments.push(...'Carritos Back'...)
if (!isNineHole && totalPtsA !== totalPtsB) segments.push(...'Carritos Total'...)
```

Pero la UI tiene su propio cálculo en `BetDashboard.tsx` (función `calculateCarritosResult`) y en `CarritosResultsCard.tsx`, y ninguno consulta `betConfig.roundHoles`. Resultado:
- La UI suma front+back+total → moneyA inflado.
- La UI emite `BetSummary` para los 3 segmentos.
- El motor solo emite Front → discrepancia de $100/jugador → **el cierre se bloquea en `preValidation`**.

Esto explica el reporte adjunto (Sergio/Antonio −$100, Carlos/Rodrigo +$100, Raul $0).

### Problema 2 — Auditoría de otras apuestas de parejas en 9 hoyos

- **Team Pressures** (`teamPressures.ts`): también acumula `frontMoney + backMoney + matchMoney` sin filtrar por 9 hoyos.
- **Wolf / Sixes / Vegas / Loba**: son por hoyo, no tienen segmentos front/back/total → no afectados.
- **Bilateral cards** (Medal, Putts, Pressures, Skins): leen `groupedSummaries` que ya vienen del motor (9-hoyos-aware) → muestran $0 automáticamente, OK.

### Problema 3 — Zoo inline counters y snapshot

Validado: los handlers `onAddZooEvent` / `onUpdateZooEvent` / `onDeleteZooEvent` del nuevo control inline en `PlayerScoreInput` están conectados en `PlayViews.tsx` a los mismos setters de `betConfig.zoologico.events` que usa `ZoologicoDialog`. Como el snapshot/motor calcula desde `betConfig.zoologico.events` vía `calculateZooBets`, los eventos capturados inline se contabilizan correctamente en el cierre. **No requiere cambios**, solo se agregará un test de regresión mínimo.

---

## Cambios

### 1. `src/components/bets/BetDashboard.tsx`

**a) `calculateCarritosResult` (~líneas 854-866):** cuando `betConfig.roundHoles === 9`, omitir el cálculo de back y total:
```ts
const isNineHole = (betConfig.roundHoles ?? 18) === 9;
if (pointsAFront > pointsBFront) moneyA += frontAmount;
else if (pointsBFront > pointsAFront) moneyA -= frontAmount;
if (!isNineHole) {
  // back y total solo en 18
  ...
}
```
Y en el objeto devuelto, forzar `pointsABack=0, pointsBBack=0, pointsATotal=pointsAFront, pointsBTotal=pointsBFront, backAmount:0, totalAmount:0` cuando es 9 hoyos, para que el card no muestre las secciones.

**b) Emisión de `carritosSummaries` (~líneas 971-975):** cuando `isNineHole`, filtrar el array `segments` para dejar solo `'Carritos Front'`. Así la UI deja de emitir summaries fantasma para back/total → la pre-validación cuadra con el motor.

### 2. `src/components/bets/CarritosResultsCard.tsx`

Aceptar prop `roundHoles?: 9 | 18` (default 18) y, cuando sea 9:
- No renderizar el bloque "Back 9" (líneas ~415-490)
- No renderizar el bloque "Total 18" (líneas ~493-525)
- En el header, "T −13" se omite también; solo queda F9.

Pasar `roundHoles={betConfig.roundHoles}` desde `BetDashboard` donde se monta el card.

### 3. `src/lib/bets/teamPressures.ts` (audit menor)

Aplicar el mismo guardia `isNineHole = (config.roundHoles ?? 18) === 9` y, cuando sea 9, omitir `backMoney` y `matchMoney`/`totalMoney`. Esto previene el mismo bug en "Presiones Parejas / Foursome" si en el futuro se usa con ronda de 9.

### 4. Test de regresión zoo

Agregar a `src/test/snapshotIntegrity.test.ts` (o nuevo archivo `zoologico.test.ts`) un caso: dado un `betConfig.zoologico.events` con 3 eventos (camello, pez, gorila) en el mismo hoyo, `calculateZooBets` produce el monto esperado por animal y per-loser → confirma que los eventos creados desde los inline counters fluyen al motor sin pérdidas.

---

## Verificación

1. Reproducir la ronda: cargar setup 9H con Carritos → la tarjeta muestra solo "Front 9", sin Back 9 ni Total 18.
2. Intentar cerrar → el reporte ya no muestra discrepancia UI vs Motor ($0).
3. Capturar 1 camello + 1 pez desde el popover de scoring inline → abrir Bet Dashboard → el conteo refleja correctamente en la tarjeta de Zoológico (Grupales).
4. Cerrar la ronda → snapshot contiene los movimientos de zoo.
