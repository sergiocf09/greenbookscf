

## Ajustes de nomenclatura, iconos y validación Nines

### 1. Eliminar iconos y renombrar

Solo 🐺 se mantiene (en Loba). Quitar ⛳, 🎲, 🎯 de todos lados. "La Loba" → "Loba".

| Archivo | Antes | Después |
|---------|-------|---------|
| `SixesResultsCard.tsx` | `⛳ Sixes` | `Sixes` |
| `VegasResultsCard.tsx` | `🎲 Las Vegas` | `Las Vegas` |
| `WolfResultsCard.tsx` | `🐺 La Loba` | `🐺 Loba` |
| `NinesResultsCard.tsx` | `🎯 5-3-1` | `Nines (5-3-1)` |
| `ParejasParticipationMatrix.tsx` | `⛳ Sixes`, `🎲 Vegas` | `Sixes`, `Vegas` |
| `ParejasBets.tsx` | `🐺 La Loba`, `⛳ Sixes`, `🎲 Las Vegas`, `Seises` | `🐺 Loba`, `Sixes`, `Las Vegas`, `Sixes` |
| `GrupalBets.tsx` | `🎯 5-3-1 (Nines)` y refs internas `5-3-1` | `Nines (5-3-1)` |
| `GrupalParticipationMatrix.tsx` | `label: '5-3-1'` | `label: 'Nines'` |

### 2. Nota de validación "3 jugadores" en Nines (matriz grupal)

En `GrupalParticipationMatrix.tsx`, después de la tabla, mostrar condicionalmente:

- Si Nines está activa y el count de jugadores seleccionados ≠ 3:
  `"Selecciona exactamente 3 jugadores para Nines"` en `text-amber-500`, tamaño `text-[10px]`
- No bloqueante, solo informativa

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `SixesResultsCard.tsx` | Quitar ⛳ (2 ocurrencias) |
| `VegasResultsCard.tsx` | Quitar 🎲 (2 ocurrencias) |
| `WolfResultsCard.tsx` | La Loba → Loba (2 títulos) |
| `NinesResultsCard.tsx` | 🎯 5-3-1 → Nines (5-3-1) (2 ocurrencias) |
| `ParejasParticipationMatrix.tsx` | Quitar ⛳ y 🎲 de labels |
| `ParejasBets.tsx` | Quitar iconos, renombrar Loba, Seises→Sixes |
| `GrupalBets.tsx` | Renombrar Nines título y textos |
| `GrupalParticipationMatrix.tsx` | Label → Nines + nota validación |

