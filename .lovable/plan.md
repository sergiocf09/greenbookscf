

## Plan: Hándicaps editables en el setup de Loba + correcciones del diagnóstico previo

### Contexto

Actualmente los cálculos de Loba usan `player.handicap` (el hándicap general del jugador en la ronda). El usuario quiere que, igual que en Skins Grupal y Medal General, los hándicaps de Loba se puedan confirmar/editar dentro de su sección de setup, y que esos sean los que usen los cálculos.

La tabla `wolf_config` no tiene columna para `player_handicaps`. Se necesita una migración.

### Cambios

#### 1. Migración: agregar `player_handicaps` a `wolf_config`

```sql
ALTER TABLE wolf_config
ADD COLUMN player_handicaps jsonb DEFAULT '[]'::jsonb;
```

Formato: `[{ "playerId": "xxx", "handicap": 12 }, ...]`

#### 2. Tipos (`src/types/golf.ts`)

- Agregar `playerHandicaps?: { playerId: string; handicap: number }[]` a `WolfSetupConfig` y `WolfConfig`.

#### 3. Setup UI (`src/components/setup/bets/ParejasBets.tsx`)

- Debajo de la fila "Jugar con hándicap" (cuando está activo), mostrar la lista de participantes activos de Loba con stepper +/- para editar hándicap, usando el mismo patrón de Skins Grupal.
- Default: toma `player.handicap` de cada participante activo.
- Persistir en `wolfSetup.playerHandicaps`.

#### 4. Hook (`src/hooks/useWolf.ts`)

- Leer y escribir `player_handicaps` en `saveConfig`/`fetchData`.
- Exponer `playerHandicaps` en el estado de `wolfConfig`.

#### 5. Motor de cálculo (`src/lib/bets/wolf.ts`)

- `getPlayerScore`: recibir un parámetro opcional `handicapOverrides?: Map<string, number>`. Si existe override para el jugador, usar ese hándicap en lugar de `player.handicap`.
- `resolveWolfHole` y `buildWolfHoleDetails`: propagar el override.

#### 6. Auto-resolve en `useWolf.ts` (`saveDecision`)

- Al construir el objeto `course`, cambiar `strokeIndex` → `handicapIndex` (bug existente del diagnóstico).
- Pasar los `playerHandicaps` del config como overrides al resolver.

#### 7. `calculateWolfBets` y `buildWolfHoleDetails` (`wolf.ts`)

- Filtrar `rivalTeam` usando `config.participantIds` en lugar de `players` completo (bug existente del diagnóstico).

#### 8. Resumen de modalidad en dashboard + badges verdes + nombres desambiguados

- **WolfResultsCard**: subtítulo con "Bola Baja · Con Hándicap · Carryover" debajo del título.
- **SixesResultsCard**: subtítulo con modalidad/cobro.
- **VegasResultsCard**: subtítulo con variante.
- Tooltip de cada hoyo: badge verde para el jugador Loba, nombres con iniciales de apellido desambiguadas.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| **Migración SQL** | `ADD COLUMN player_handicaps jsonb` |
| `src/types/golf.ts` | `playerHandicaps` en `WolfSetupConfig` y `WolfConfig` |
| `src/components/setup/bets/ParejasBets.tsx` | UI de hándicaps editables para Loba |
| `src/hooks/useWolf.ts` | Leer/escribir `player_handicaps`, fix `handicapIndex` |
| `src/lib/bets/wolf.ts` | Override de hándicaps, fix `rivalTeam` filter |
| `src/components/bets/WolfResultsCard.tsx` | Subtítulo modalidad, badge verde, nombres |
| `src/components/bets/SixesResultsCard.tsx` | Subtítulo modalidad |
| `src/components/bets/VegasResultsCard.tsx` | Subtítulo variante |
| `src/pages/Index.tsx` | Pasar `playerHandicaps` al sync de wolf config |

