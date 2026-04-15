

# Plan: Persistencia Putts General, Medal General por segmentos, Sliding Equipo y UX

## 6 problemas a resolver

### 1. Putts General no persiste (useBetConfigPersistence.ts)

`puttsGeneral` no está incluido ni en el save (`configToSave`) ni en el load (`loadBetConfig`). Se necesita:
- **Save**: Agregar `puttsGeneral` al objeto `configToSave` (junto a `medalGeneral`, `stableford`, etc.)
- **Load**: Agregar bloque `if (dbConfig.puttsGeneral)` para restaurar la config al cargar

### 2. Medal General — segmentMode no persiste ni se muestra por segmentos

**Persistencia**: `medalGeneral` en el save no incluye `segmentMode`, `frontAmount`, ni `backAmount`. Agregar estos 3 campos al objeto de save y al bloque de load.

**Dashboard de resultados** (GroupBetsCard.tsx): `calculateMedalForPool` solo calcula el total. Cuando `segmentMode === 'segments'`, debe calcular 3 resultados: Front 9 (hoyos 1-9), Back 9 (hoyos 10-18), Total 18 — exactamente igual que ya hace Putts General. Modificar la sección de rendering de Medal General para mostrar los 3 bloques de resultado con montos independientes cuando está en modo segments.

### 3. Sliding Equipo — cálculo incorrecto

**Bug**: `HandicapModeSelector` calcula slidings con `hcpMap[teamA[0]] - hcpMap[teamB[0]]` (diferencias de handicap del setup). Esto es INCORRECTO — debe usar los valores de la **matriz bilateral** (`sliding_current`), que ya están reflejados en `teamHandicaps` de la bet config o disponibles vía `bilateralHandicaps`.

**Fix**: El `HandicapModeSelector` necesita recibir un prop adicional `bilateralHandicaps` (o `slidingMatrix`) con los slidings reales. Para sliding equipo:
- Leer los valores del sliding bilateral: qué da A1 a B1, A1 a B2, A2 a B1, A2 a B2
- Estos valores ya están en `config.bilateralHandicaps` como `sliding_current`
- Pasar `bilateralHandicaps` desde ParejasBets al `HandicapModeSelector`
- Usar esos valores reales en vez de recalcular desde handicaps base

Ejemplo del usuario: SC→FO=+3, SC→SP=-3, CE→FO=+1, CE→SP=+1. Total=2, /2=1. Resultado: 1 golpe a Fernando (mayor sliding recibido en equipo B).

### 4. UX del selector — valor seleccionado no visible

El `Select` de ShadcnUI con `SelectValue` debería mostrar el texto del item seleccionado automáticamente. El problema puede ser que `value={mode}` no coincide con el `SelectItem value` después de re-renders o que `handicapConfig` no se persiste correctamente en el state.

**Fix**: Verificar que `handicapConfig` se incluye en `teamPressures.bets[].handicapConfig`, `carritosTeams[].handicapConfig`, `sixesBets[].handicapConfig`, `vegasBets[].handicapConfig` y `wolfSetup.handicapConfig` tanto en save como en load de `useBetConfigPersistence.ts`. Si estos campos ya se serializan con spread (`...dbConfig.wolfSetup`), verificar que no se pierden.

### 5. Reordenar tabs de navegación (Index.tsx)

Orden actual: Setup → Apuestas → Hándicaps → Scorecard → Resultados

Nuevo orden: **Setup → Hándicaps → Apuestas → Scorecard → Resultados**

Cambiar líneas 2537-2541 en Index.tsx para intercambiar las posiciones de los tabs `betsetup` y `handicaps`.

### 6. Medal General — segmentMode persistence en save

Agregar `segmentMode`, `frontAmount`, `backAmount` tanto al save como al load de `medalGeneral` en `useBetConfigPersistence.ts`.

---

## Archivos afectados

| Archivo | Cambios |
|---------|---------|
| `src/hooks/useBetConfigPersistence.ts` | Persistencia de `puttsGeneral`, `medalGeneral.segmentMode/frontAmount/backAmount`, verificar `handicapConfig` en team bets |
| `src/components/bets/GroupBetsCard.tsx` | Medal General: rendering por segmentos F9/B9/T18 cuando `segmentMode === 'segments'` |
| `src/components/setup/bets/ParejasBets.tsx` | Sliding Equipo: usar `bilateralHandicaps` reales; UX del selector |
| `src/pages/Index.tsx` | Reordenar tabs: Setup → Hándicaps → Apuestas → Scorecard → Resultados |

