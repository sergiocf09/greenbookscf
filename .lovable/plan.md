# Plan: Captura inline de Zoológico por jugador y por hoyo

## Validación previa (lo confirmé en el código)

- **Modelo de datos**: `ZooEvent` ya incluye `count`, soporta múltiples eventos por jugador en el mismo hoyo. No requiere migración.
- **Diálogo 🐾 (`ZoologicoDialog`)**: ya permite seleccionar varios jugadores y subir/bajar contador por animal — pero hay que abrirlo aparte.
- **Cálculo (`lib/bets/zoologico.ts`)**: independiente de manchas. Los animales **no** se cuentan en `manchasSummary` ni en el chip de Manchas del Bet Dashboard (verificado).
- **Detalle Zoológico en Bet Dashboard**: ya existe en `GroupBetsCard` (filas Camellos/Peces/Gorilas, igual que Pingüinos/Culebra).

**Conclusión**: lo único que falta es la **UI inline** dentro del input de captura del jugador, con un contador por animal habilitado. Los contadores ya son posibles a nivel datos; sólo no están expuestos en la fila de marcadores.

## Alcance

Agregar, dentro de `PlayerScoreInput` (popover de captura por jugador), una sub-fila "Zoológico" con un botón por animal habilitado (`enabledAnimals` de la ronda), con contador inline tipo +/− que opere sobre los `ZooEvent` del jugador en el hoyo actual.

No se toca:
- Bet Dashboard chip de Manchas (queda intacto, no incluye zoológico).
- Sección de detalle Zoológico en `GroupBetsCard` (sigue mostrando resultados).
- Diálogo 🐾 global del `ScoringView` (se mantiene como acceso alternativo / vista de eventos).
- Cálculos en `lib/bets/zoologico.ts`, balances, ledger, cierre de ronda.

## Cambios

### 1. `src/components/scoring/InlineMarkers.tsx`
- Exportar un nuevo componente `ZooInlineCounters` que recibe:
  - `enabledAnimals: ZooAnimalType[]`
  - `holePlayerCounts: Record<ZooAnimalType, number>` (count actual de ese jugador en ese hoyo)
  - `onChange(animal, newCount)`.
- Renderiza un botón redondo por animal con emoji + badge de cantidad (idéntico al patrón de `CounterMarker` para `manchaGenerica`/`unidadGenerica`, pero con emojis 🐪🐟🦍 en lugar de íconos lucide).
- Color/styling tipo `mancha` (rojo) para mantener coherencia, pero diferenciado por emoji.

### 2. `src/components/scoring/PlayerScoreInput.tsx`
- Nuevas props opcionales:
  - `zooEnabledAnimals?: ZooAnimalType[]`
  - `zooEventsForPlayerHole?: ZooEvent[]`
  - `onZooCountChange?: (animal: ZooAnimalType, newCount: number) => void`
- Si `zooEnabledAnimals?.length > 0`, renderiza `ZooInlineCounters` dentro del popover, debajo de la fila de manchas (`manualStainMarkers`), con su propio label corto "🐾 Zoológico".
- No modifica `markers` (los `ZooEvent` son independientes).

### 3. `src/components/scoring/ScoringView.tsx`
- Para cada `PlayerScoreInput` del hoyo actual:
  - Pasar `zooEnabledAnimals = betConfig.zoologico?.enabled ? (betConfig.zoologico.enabledAnimals || ['camello','pez','gorila']) : undefined`.
  - Filtrar `betConfig.zoologico?.events` por `playerId` + `currentHole` y agruparlos por `animalType` para construir `zooEventsForPlayerHole`.
  - Implementar `onZooCountChange(animal, newCount)`:
    - Si existe ya un `ZooEvent` para `(player, hole, animal)`, llamar `onUpdateZooEvent` con el nuevo `count` (o `onDeleteZooEvent` si `newCount === 0`).
    - Si no existe y `newCount > 0`, llamar `onAddZooEvent` con un nuevo evento `{ count: newCount, ... }`.
  - Sólo habilitado si `betConfig.zoologico?.enabled && onAddZooEvent`. Respetar permisos existentes (no-op en modo invitado/histórico — ya manejado por los callbacks).

### 4. (Opcional, sin cambios funcionales) `ZoologicoDialog`
- Se mantiene como vista de lista/edición global; no se toca en este sprint.

## Comportamiento esperado

- En el popover de captura de cada jugador, debajo de las manchas, aparece una fila con los animales habilitados (1, 2 o 3 según setup).
- Tap suma 1; botón "−" resta 1; al llegar a 0 se borra el `ZooEvent` del hoyo.
- El contador refleja en tiempo real lo registrado en `betConfig.zoologico.events`.
- El chip de Manchas del Bet Dashboard sigue **sin** incluir animales. La sección Zoológico del Bet Dashboard refleja los nuevos counts automáticamente (usa el mismo `events`).

## Archivos a modificar

- `src/components/scoring/InlineMarkers.tsx` — agregar `ZooInlineCounters`.
- `src/components/scoring/PlayerScoreInput.tsx` — nuevas props + render condicional.
- `src/components/scoring/ScoringView.tsx` — wiring de props y handler add/update/delete.

Sin migraciones, sin cambios en cálculos ni balances.
