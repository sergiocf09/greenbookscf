

## Plan: Fix Loba Visibility + Redesign Nines Presentation

### Issue 1 — Loba sigue sin aparecer en BetDashboard

**Diagnóstico**: El sync en `Index.tsx` línea 236 usa `players` (para calcular `wolfParticipantIds`) pero `players` NO está en el array de dependencias del `useEffect` (línea 305). Esto significa que si `betConfig.wolfSetup?.enabled` ya es `true` cuando el efecto corre por primera vez pero `players` aún está vacío, `wolfParticipantIds` será `[]`, y `wolf.saveConfig` guardará arrays vacíos. Cuando `players` se popula después, el efecto NO se re-ejecuta.

**Fix** (`src/pages/Index.tsx`):
- Agregar `players.length` como dependencia del `useEffect` de sync Sprint 3
- Agregar guard `if (players.length < 4) return` antes del bloque wolf para no guardar config con 0 participantes

### Issue 2 — Nines: rediseñar presentación como Stableford

**Estado actual**: NinesResultsCard muestra un listado simple con avatares + puntos, saldos en texto, y un collapsible "Detalle por hoyo" con tabla.

**Objetivo**: Replicar el look & feel de Stableford:
1. **Grid de tarjetas de jugadores** (como `StablefordResultBlock`): Grid 3-col con cada jugador en una pill/card mostrando avatar, puntos totales (grande), y desglose F/B. El líder tiene highlight verde y trofeo.
2. **Tooltip clickable** (como el Popover de Stableford): Al dar clic al grid, aparece un Popover con tabla hole-by-hole mostrando Front 9 y Back 9, con colores por rango de puntos (5=amber, 3=green, 1=blue, 0=red) y dot de handicap.
3. **Ranking de ganancias** al pie (como Sixes/Vegas): Lista de jugadores con avatar + nombre + balance neto en verde/rojo, idéntico al patrón de `playerRanking` en VegasResultsCard.

**Cambios** (`src/components/bets/NinesResultsCard.tsx`):

- Calcular `pointsFront` y `pointsBack` por jugador en el `useMemo` de summaries
- Reemplazar el listado actual de rankings por un grid clickable estilo Stableford:
  - Grid `grid-cols-3` (o `grid-cols-4` para 4 jugadores)
  - Cada celda: avatar + puntos total + F/B split
  - Wrapped en `Popover` trigger
- PopoverContent: tabla Front 9 + Back 9 con colores por valor de punto (5, 3, 1, 0) y dot de handicap
- Reemplazar la sección "Saldos" actual por un ranking estilo Sixes/Vegas:
  - `border-t` + lista de jugadores con `PlayerAvatar`, nombre completo formateado, y balance `+$X / -$X` en verde/rojo
- Eliminar el `Collapsible` de "Detalle por hoyo" (reemplazado por el Popover del grid)

**Archivos a modificar**:

| Archivo | Cambio |
|---------|--------|
| `src/pages/Index.tsx` | Agregar `players.length` a deps del useEffect de sync |
| `src/components/bets/NinesResultsCard.tsx` | Rediseñar completo: grid de tarjetas + popover hole-by-hole + ranking de ganancias |

