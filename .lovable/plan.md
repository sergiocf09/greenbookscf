## Cambios

### 1. Oyeses individual — modalidad "Un solo ganador" + Zapato per-bilateralidad (confirmar)

**Setup / Matriz (Apuesta individual de Oyeses)**

- Agregar un nuevo control a nivel de apuesta en `IndividualBets.tsx` dentro de la sección Oyeses:
  - Toggle global **"Un solo ganador"** (`singleWinner: boolean`). Cuando está ON: en cada par 3 sólo se reconoce al #1 (el más cercano), quien cobra a TODOS los demás. Si además está la modalidad **Acumulados**, el #1 del próximo par 3 jugado cobra el pote acumulado a todos.
  - Toggle global **"Zapato"** (ya existe `oyeses.zapatoEnabled`) — se mantiene; aclarar en helpText que sigue siendo accionable per-bilateralidad en BilateralDetail (ya implementado via `oyesPairZapatoOverrides`). No requiere cambios funcionales en el toggle bilateral.  El bilateral esta bien ... pero lo que hay que agregar es que este toggle tambien se pueda setear en la configuración global en la matriz y con ello no tener que hacer el cambio de selección de uno a uno las bilateralidades que por default traen el zapato, con este cambio, en la biltaralidad aparecera lo que este setado en esa configuración global, y siepre permitiendo el cambio en cada bilteralidad.

**Tipos (`src/types/golf.ts`)**

- Añadir `singleWinner?: boolean` a `OyesesBetConfig` (default `false`).

**Persistencia**

- Propagar `singleWinner` en `useBetConfigPersistence.ts` (read + write) junto a los otros campos de `oyeses`.
- Incluirlo en `useBetTemplates.ts` al guardar/cargar plantillas.

**OyesesDialog (selector de orden por hoyo)**

- Si `betConfig.oyeses.singleWinner === true` y `oyeses.enabled`:
  - Mostrar únicamente el botón `1` por jugador (ocultar 2..N).
  - Sólo permitir que UN jugador tenga el #1 a la vez (deseleccionar el #1 previo si alguien más lo toma). Mantener la opción de dejar el hoyo sin ganador (carry en acumulados / vacío en sangrón).
  - Mantener tabs Acumulado/Sangrón existentes; la regla "sólo #1" aplica a ambas en este modo.
  - Validación: deshabilitar "duplicados" porque por construcción sólo existe un #1.

**Cálculo bilateral (`src/lib/oyesesCalculations.ts`)**

- En `calculateOyesesBets` (y replicar en `getOyesesPairResult` / `getOyesesDisplayData` lo necesario para que el display sea coherente):
  - Si `config.oyeses.singleWinner === true`:
    - Para cada par 3 ordenado, identificar al único jugador con proximidad `1` entre los participantes.
    - Si nadie tiene `1` → acumular (modalidad acumulados) o pasar (sangrón), exactamente como hoy.
    - Si existe ganador único W:
      - Por cada pareja (W, otro): W gana `amount + accumulated` (acumulados) o `amount` (sangrón) sobre ese rival; emitir summaries simétricos con `holesWonByW += 1 + pendingAccumulatedHoles`.
      - Reset de `accumulated` y `pendingAccumulatedHoles` después del settlement.
    - Las parejas que NO incluyen a W no generan summary en ese hoyo (en singleWinner sólo el ganador cobra; los demás "pierden contra W" pero no entre sí).
  - Mantener regla 100% (zapato/multiplicador) y los overrides `oyesPairZapatoOverrides` tal cual; sólo cambia quién acumula holesWon.
- Documentar en el comentario del header del archivo.

**No cambia**: BilateralDetail (zapato toggle per-bilateralidad ya funciona), Rayas, ni `teamPressures.oyesesConfig`.

---

### 2. Foursomes (Presiones por Parejas) — Unidades — agregar "Unidad genérica"

**Tipos (`src/types/golf.ts`)**

- Añadir a `TeamPressureUnitsConfig`:
  - `includeGenericUnit?: boolean` (default false)
  - `valuePerGenericUnit?: number` (default = `valuePerUnit`)

**UI (`src/components/setup/bets/ParejasBets.tsx`)**

- Dentro del bloque `unitsConfig`, agregar:
  - Checkbox **"Incluir Unidad genérica ⭐"** que activa `includeGenericUnit`.
  - Cuando esté activo, mostrar `AmountInput` "Valor por Unidad genérica" enlazado a `valuePerGenericUnit` (default al valor por unidad).
- Mantener los checkboxes existentes para los marcadores booleanos (birdie/eagle/etc.).

**Cálculo (`src/lib/bets/teamPressures.ts`)**

- En la sección Units (continúa y normal, líneas ~120 y ~200) ajustar `countUnitsForTeam` para que, si `bet.unitsConfig?.includeGenericUnit`, también sume `s.markers.unidadGenerica ?? 0` (es contador numérico, no boolean) por cada score confirmado del equipo.
- Si `valuePerGenericUnit !== valuePerUnit`, separar el cálculo: `unitsMoney = (stdA - stdB) * valuePerUnit + (genA - genB) * valuePerGenericUnit` (más el ajuste `netAdvantage` ya existente, que se aplica sólo a `valuePerUnit`).
- Actualizar `descParts` para reflejar la unidad genérica cuando aporte.

---

## Detalles técnicos

- `singleWinner` se persiste como columna JSON dentro del bloque `oyeses` ya serializado; no requiere migración SQL.
- `TeamPressureUnitsConfig.includeGenericUnit` / `valuePerGenericUnit` viven dentro de `teamPressures.bets[i].unitsConfig` (JSON), no requiere migración SQL.
- En `OyesesDialog`, derivar `proximityOptions = singleWinner ? [1] : Array(players.length)`.
- `getOyesesPairResult` y `getOyesesDisplayData`: en modo singleWinner, el "ganador del hoyo" para el display de la pareja (A,B) será A si A==W, B si B==W, ninguno si W∉{A,B} (no se cuenta como hoyo ganado para ninguno en esa pareja, pero el `totalPlayedHoles` sí incrementa para mantener la regla 100%).