

## Plan: Agregar configuración de hándicap por jugador en Nines (5-3-1)

### Objetivo
Permitir que cada instancia de Nines tenga hándicaps personalizados por jugador, heredando automáticamente del setup pero permitiendo overrides que persistan entre refrescos.

### Cambios

#### 1. Tipo `NinesBetInstance` — agregar campo de hándicaps
En `src/types/golf.ts`, agregar un campo opcional `playerHandicaps` al tipo:
```typescript
export interface NinesBetInstance {
  id: string;
  valuePerPoint: number;
  playerIds: string[];
  playerHandicaps?: Record<string, number>; // playerId -> handicap override
}
```
Esto se persiste dentro del `betConfig` JSON de la ronda (no requiere migración de DB).

#### 2. UI de configuración — `NinesBetCard` en `GrupalBets.tsx`
Debajo de la selección de jugadores (cuando hay 3 seleccionados), mostrar inputs de hándicap para cada jugador:
- Cada jugador muestra su nombre + input numérico con el hándicap
- Al seleccionar un jugador, su hándicap se inicializa con `player.handicap` del setup
- El usuario puede modificar el valor manualmente
- Los cambios se guardan en `playerHandicaps` del `NinesBetInstance`

#### 3. Motor de cálculo — `src/lib/bets/nines.ts`
En `buildNinesHoleDetails`, usar `config.playerHandicaps?.[p.id] ?? p.handicap` en lugar de `p.handicap` directo al llamar `calculateStrokesPerHole`. Esto aplica tanto en la línea 34 como en la 46.

#### 4. Persistencia
Los hándicaps se guardan como parte del `ninesBets` array dentro del `betConfig` JSON de la tabla `rounds`. No se necesita migración de base de datos ya que `betConfig` es un campo `jsonb` flexible. La restauración ya maneja `ninesBets` correctamente en `useRoundManagement.ts` (línea 567).

#### 5. Hook `useNines.ts` — pasar hándicaps al `NinesConfig`
Actualizar `NinesConfig` en `src/types/golf.ts` para incluir `playerHandicaps`:
```typescript
export interface NinesConfig {
  roundId: string;
  valuePerPoint: number;
  playerIds: string[];
  playerHandicaps?: Record<string, number>;
}
```
Y en `useNines.ts`, leer/guardar el campo `playerHandicaps` si la tabla lo soporta, o bien obtenerlo del `betConfig` pasado como parámetro.

Dado que `nines_config` es una tabla separada sin columna `playerHandicaps`, se necesita agregar una columna JSONB a la tabla `nines_config` para persistir los hándicaps:

**Migración SQL:**
```sql
ALTER TABLE public.nines_config 
ADD COLUMN player_handicaps jsonb DEFAULT '{}'::jsonb;
```

Luego actualizar `useNines.ts` para leer/escribir `player_handicaps`.

### Archivos a modificar
1. `src/types/golf.ts` — agregar `playerHandicaps` a `NinesBetInstance` y `NinesConfig`
2. `src/components/setup/bets/GrupalBets.tsx` — UI de hándicaps en `NinesBetCard`
3. `src/lib/bets/nines.ts` — usar hándicaps custom en cálculos
4. `src/hooks/useNines.ts` — persistir/restaurar `playerHandicaps`
5. `src/hooks/useRoundManagement.ts` — pasar `playerHandicaps` al close flow
6. **Migración DB** — agregar columna `player_handicaps` a `nines_config`

