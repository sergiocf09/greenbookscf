

## Plan: Mejoras Loba — Nombres completos, reversión, recalculación y layout

### Problemas identificados

1. **Setup Loba — nombres truncados**: En la sección de hándicaps editables, solo muestra `p.name.split(' ')[0]` (primer nombre). Falta nombre completo y avatar verde/dorado del logueado.

2. **Hoyos 4,6,7,8,9,11,12 no permiten selección**: Tienen `result: 'tied'` en la BD, lo que activa `showResolved` en el panel. No hay botón para revertir/re-editar una decisión ya resuelta (solo existe "Cambiar" para `showInPlay` con `result === null`).

3. **No se puede revertir selección de Loba**: Falta un botón "Cambiar" en el estado resuelto (`showResolved`) que permita borrar el resultado y volver al modo selección.

4. **Scores cambiados no recalculan resultado**: Cuando se modifica un score después de resolver, no hay trigger para recalcular. Solo se resuelve en `handleConfirmHole` y en `saveDecision`.

5. **Tooltip Loba — icono lobo en vez de punto verde**: Actualmente usa `<span className="h-2 w-2 rounded-full bg-green-500">` para marcar al Wolf. Debe usar 🐺.

6. **Tooltip — nombres con desambiguación de apellido**: Usa `formatPlayerName` que solo da primer nombre. Necesita "Sergio CD", "Sergio CF" etc.

7. **Tooltip — falta monto ganado/perdido por jugador**: No muestra el resultado monetario por jugador en el detalle del hoyo.

8. **Tooltip — decisión y monto en esquina superior derecha**: Actualmente está abajo. Mover al extremo superior derecho.

9. **Front 9 / Back 9 — layout lado a lado**: Actualmente son collapsibles verticales con texto. Deben ser 2 botones en el mismo renglón, 50% ancho cada uno.

10. **Sixes/Vegas — layout parejas alineado**: Las iniciales de equipo 1 alineadas a la izquierda (una arriba de otra), "vs" en medio, equipo 2 a la derecha (una arriba de otra).

### Cambios por archivo

#### `src/components/setup/bets/ParejasBets.tsx`
- Línea 526: Cambiar `p.name.split(' ')[0]` → nombre completo `p.name` en la lista de hándicaps
- Agregar avatar con `isLoggedInUser` y iniciales desambiguadas junto al nombre
- En rotación (línea 596): agregar `isLoggedInUser` al `PlayerAvatar`

#### `src/components/bets/WolfDecisionPanel.tsx`
- **Estado resuelto** (líneas 260-286): Agregar botón "Cambiar" que limpie el resultado (llame a `onDecision` con reset o nuevo callback `onRevert`)
- Necesario un nuevo prop `onRevert?: (holeNumber: number) => Promise<void>` que borre el resultado en BD
- Agregar en `useWolf.ts` una función `revertDecision` que haga `UPDATE wolf_hole_state SET result = null, partner_ids = '[]', went_solo = false WHERE round_id = ? AND hole_number = ?` o directamente `DELETE`

#### `src/hooks/useWolf.ts`
- Agregar función `revertDecision(holeNumber)`: borra el `wolf_hole_state` para ese hoyo (DELETE) y hace `fetchData()`
- Agregar función `recalculateHole(holeNumber)`: re-ejecuta `resolveWolfHole` para un hoyo ya con decisión pero cuyo score cambió. Se expondrá para que `ScoringView` la llame al confirmar scores.

#### `src/components/scoring/ScoringView.tsx`
- Pasar `onRevert` al `WolfDecisionPanel`
- En `handleConfirmHole`: ya recalcula, pero también llamar recalculación si el hoyo ya tenía resultado previo (para cubrir cambio de score)
- Conectar `wolf.revertDecision` desde `Index.tsx`

#### `src/pages/Index.tsx`
- Exponer `wolf.revertDecision` como prop `onWolfRevert` hacia `ScoringView`

#### `src/components/bets/WolfResultsCard.tsx`
- **Front 9 / Back 9**: Reemplazar los 2 `Collapsible` verticales por 2 botones en `grid grid-cols-2 gap-2`, cada uno con icono y al hacer click expanden los 9 hoyos debajo
- **Tooltip**: 
  - Mover decisión y monto al extremo superior derecho del popover
  - Reemplazar punto verde `bg-green-500` por emoji 🐺
  - Nombres: usar función de desambiguación con apellido ("Sergio CD") en vez de `formatPlayerName`
  - Agregar renglón con monto ganado/perdido por jugador debajo de los scores de cada equipo

#### `src/components/bets/SixesResultsCard.tsx`
- Cambiar layout de parejas en los bloques de sets: alinear iniciales de equipo 1 verticalmente a la izquierda, "vs" centrado, equipo 2 a la derecha vertical

#### `src/components/bets/VegasResultsCard.tsx`
- Mismo cambio de layout de parejas que Sixes

### Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `src/hooks/useWolf.ts` | `revertDecision()`, exponer recalculación |
| `src/components/bets/WolfDecisionPanel.tsx` | Botón "Cambiar" en estado resuelto, prop `onRevert` |
| `src/components/scoring/ScoringView.tsx` | Pasar `onRevert`, recalcular al re-confirmar |
| `src/pages/Index.tsx` | Conectar `wolf.revertDecision` |
| `src/components/bets/WolfResultsCard.tsx` | Layout F9/B9, tooltip redesign, 🐺 badge, montos |
| `src/components/setup/bets/ParejasBets.tsx` | Nombres completos + avatar logueado en hándicaps |
| `src/components/bets/SixesResultsCard.tsx` | Layout parejas alineado |
| `src/components/bets/VegasResultsCard.tsx` | Layout parejas alineado |

