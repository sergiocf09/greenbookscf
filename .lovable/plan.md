

## Ajustes en pantalla de captura de scores (ScoringView)

### Cambios

**1. Mover Wolf Decision Panel antes de los jugadores**
En `ScoringView.tsx`, mover el bloque `WolfDecisionPanel` (líneas 308-322) para que aparezca justo después del `SixesActiveBadge` y antes del contenedor de `PlayerScoreInput`. Esto lo mantiene visible y prominente al inicio de la captura.

**2. Eliminar NinesLiveTable de ScoringView**
Eliminar el bloque `NinesLiveTable` (líneas 324-333) de `ScoringView.tsx`. Los resultados de Nines ya se muestran en el BetDashboard — no deben duplicarse en la pantalla de captura de scores.

También eliminar el import de `NinesLiveTable` y la prop `ninesConfig` si ya no se usa en el componente (verificar si se usa en otro lugar del JSX).

### Archivo a modificar
- `src/components/scoring/ScoringView.tsx`

