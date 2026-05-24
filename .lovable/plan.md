# Fix: picker de apuesta cruzada no muestra todos los grupos

## Problema

En `src/components/bets/BetDashboard.tsx` (línea ~2244), el diálogo "Agregar Jugadores de Otros Grupos" itera solo sobre `playerGroups` (que contiene únicamente los grupos adicionales: Grupo 2, 3, …). El Grupo 1 vive en el array `players` aparte.

Además filtra con `gIdx !== displayGroupIndex`, pero `displayGroupIndex` cuenta el Grupo 1 como índice `0`, mientras que el índice `0` de `playerGroups` es en realidad el Grupo 2. El mapeo no coincide.

Resultado observado:
- Parado en Grupo 1 (`displayGroupIndex = 0`): excluye `playerGroups[0]` = Grupo 2 → no aparece nadie del Grupo 2.
- Parado en Grupo 2 (`displayGroupIndex = 1`): excluye `playerGroups[1]` = Grupo 3 → muestra al propio Grupo 2 y nunca al Grupo 1.

Por eso "la lista que aparece son los del mismo grupo" o "no aparece el otro grupo".

## Cambio

Reemplazar el bloque del `DialogContent` (≈ líneas 2243-2291) para iterar sobre TODOS los grupos usando los helpers ya existentes (`getPlayersForGroup`, etiquetas tipo `Grupo N` / `playerGroups[i-1].name`) y excluir el grupo actual por `displayGroupIndex` real:

```text
totalGroups = 1 + playerGroups.length
for i in 0..totalGroups-1:
  if i === displayGroupIndex: skip
  label = i === 0 ? 'Grupo 1' : (playerGroups[i-1].name || `Grupo ${i+1}`)
  groupPlayers = getPlayersForGroup(i, players, playerGroups)
  render section with those players
```

El resto de la lógica del botón (toggle `setCrossGroupRivalsForBase`, estilos, avatar) se mantiene igual. No se tocan cálculos de apuestas ni `crossGroupRivalsMap` — la fuente de verdad y el motor ya funcionan correctamente; solo se corrige la enumeración de candidatos en el picker.

## Archivos

- `src/components/bets/BetDashboard.tsx` — único cambio, en el bloque del Dialog de cross-group picker.
