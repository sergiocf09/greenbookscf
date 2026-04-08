
## Ajustes de nomenclatura, iconos y validación Nines

### 1. Eliminar iconos y renombrar

**Regla**: Solo 🐺 se mantiene (en Loba). Quitar ⛳, 🎲, 🎯 de todos lados. "La Loba" → "Loba" (conservando 🐺).

| Archivo | Antes | Después |
|---------|-------|---------|
| `SixesResultsCard.tsx` (×2) | `⛳ Sixes` | `Sixes` |
| `VegasResultsCard.tsx` (×2) | `🎲 Las Vegas` | `Las Vegas` |
| `WolfResultsCard.tsx` (×2 títulos) | `🐺 La Loba` | `🐺 Loba` |
| `NinesResultsCard.tsx` (×2) | `🎯 5-3-1` | `Nines (5-3-1)` |
| `ParejasParticipationMatrix.tsx` | `⛳ Sixes`, `🎲 Vegas` | `Sixes`, `Vegas` |
| `ParejasBets.tsx` | `🐺 La Loba`, `⛳ Sixes`, `🎲 Las Vegas` | `🐺 Loba`, `Sixes`, `Las Vegas` |
| `ParejasBets.tsx` L942,949 | `Seises` | `Sixes` |
| `GrupalBets.tsx` L357 | `🎯 5-3-1 (Nines)` | `Nines (5-3-1)` |
| `GrupalBets.tsx` L376,382,405 | `5-3-1` refs | `Nines (5-3-1)` |
| `GrupalParticipationMatrix.tsx` L23 | `label: '5-3-1'` | `label: 'Nines'` |
| `BetDashboard.tsx` | Cualquier emoji en títulos de Foursomes/Sixes/Vegas/Nines | Quitar |

### 2. Nota de validación "3 jugadores" en Nines (matriz grupal)

En `GrupalParticipationMatrix.tsx`, después del `</tbody>` y dentro del `<table>` wrapper, agregar un bloque condicional:

- Calcular `ninesActiveCount` = número de jugadores seleccionados para Nines
- Si la fila de Nines está activa (`rowState !== 'none'`) y `ninesActiveCount !== 3`, mostrar:
  ```
  <p className="text-[10px] text-amber-500 px-2 mt-1">
    Selecciona exactamente 3 jugadores para Nines
  </p>
  ```
- Se muestra debajo de la tabla, visible pero no bloqueante

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `SixesResultsCard.tsx` | Quitar ⛳ |
| `VegasResultsCard.tsx` | Quitar 🎲 |
| `WolfResultsCard.tsx` | La Loba → Loba |
| `NinesResultsCard.tsx` | 🎯 5-3-1 → Nines (5-3-1) |
| `ParejasParticipationMatrix.tsx` | Quitar ⛳ y 🎲 de labels |
| `ParejasBets.tsx` | Quitar iconos, La Loba → Loba, Seises → Sixes |
| `GrupalBets.tsx` | Renombrar Nines título y textos internos |
| `GrupalParticipationMatrix.tsx` | Label 5-3-1 → Nines + nota validación 3 jugadores |
| `BetDashboard.tsx` | Quitar emojis si existen |
