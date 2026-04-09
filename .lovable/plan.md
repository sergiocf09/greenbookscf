

## Plan: Corrección cálculo Loba (carryover/resultado) + desambiguación de nombres en tooltips

### Problemas identificados

**1. Loba — Hole 6 muestra "tied" cuando wolf ganó**

Datos reales de hole 6:
- Wolf (5cae8054, hcp=2): gross=4, SI=3 → no stroke → net=4
- Rival 87b490de (hcp=4): gross=6, SI=3, hcp=4 → first nine gets ceil(4/2)=2 strokes (SI 1,2 only) → no stroke on SI=3 → net=6
- Rival fae3939d (hcp=0): gross=6, no strokes → net=6
- Rival bc587f65 (hcp=9): gross=6, first nine gets 5 strokes → SI=3 gets stroke → net=5

**lowBall: wolf=4, rival=min(6,6,5)=5 → Wolf gana.** Pero la BD tiene `result='tied'`.

**Causa raíz**: El resultado se calculó y almacenó en un momento anterior (posiblemente con curso incorrecto por el bug de persistencia de campo). Una vez guardado, nunca se recalcula automáticamente. El dashboard usa `state.result` de la BD para los pills, no el resultado re-resuelto.

**Solución**: El `WolfResultsCard` ya llama `buildWolfHoleDetails` que re-resuelve cada hoyo. Pero los pills usan `state.result` (BD). Se debe:
- Usar el resultado re-resuelto de `buildWolfHoleDetails` para los pills en lugar del almacenado
- Agregar auto-corrección: si el resultado re-resuelto difiere del almacenado, actualizar la BD silenciosamente

**2. Carryover cuenta TODOS los holes previos tied, no los consecutivos**

En `saveDecision` línea 87-89:
```typescript
const carryoverHoles = holeStates.filter(s =>
  s.holeNumber < holeNumber && s.result === 'tied' && wolfConfig.carryover
).length;
```

Esto cuenta todos los tied previos, no solo la cadena consecutiva hacia atrás. Si hole 3 fue tied y hole 5 fue tied, hole 6 tendría carryover=2 cuando debería ser 1 (solo hole 5). Corregir para contar solo la cadena consecutiva descendente de tied holes.

**3. Desambiguación de nombres — `disambiguateShortNames` falla con "Sergio Cruz Fernández" vs "Sergio Cruz Delfín"**

Flujo actual:
1. Ambos tienen firstName = "Sergio" → colisión
2. `formatPlayerNameShort` → "Sergio C." para ambos → colisión
3. Fallback a `formatPlayerNameTwoWords` → "Sergio Cruz" para ambos → **sigue colisionando**

No hay lógica para el caso donde `formatPlayerNameTwoWords` también colisiona. Se necesita un fallback adicional: "Nombre + iniciales de apellidos" → "Sergio CF" y "Sergio CD".

**4. Tooltips de Sixes/Vegas usan `playerName.split(' ')[0]` en vez de nombres desambiguados**

En `SixesResultsCard.tsx` línea 240: `my.playerName.split(' ')[0]`
En `VegasResultsCard.tsx` línea 381: `getName(myPids[i])` donde `getName` usa `.name?.split(' ')[0]`

Ambos ignoran la desambiguación. Deben usar `shortNames` (como hace Wolf).

### Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| `src/lib/playerInput.ts` | En `disambiguateShortNames`: agregar fallback cuando `formatPlayerNameTwoWords` también colisiona → usar "Nombre + iniciales de apellidos restantes" (ej: "Sergio CF", "Sergio CD") |
| `src/components/bets/WolfResultsCard.tsx` | Pills: usar resultado re-resuelto de `details` en vez de `state.result`. Agregar efecto para auto-corregir BD cuando hay mismatch |
| `src/components/bets/SixesResultsCard.tsx` | Tooltip popover: reemplazar `playerName.split(' ')[0]` por nombres desambiguados usando `disambiguateShortNames` |
| `src/components/bets/VegasResultsCard.tsx` | Tooltip popover: reemplazar `getName()` por nombres desambiguados. Pasar `shortNames` map a `renderHolePill` |
| `src/hooks/useWolf.ts` | Fix carryover: contar solo cadena consecutiva de tied holes hacia atrás, no todos los previos |

