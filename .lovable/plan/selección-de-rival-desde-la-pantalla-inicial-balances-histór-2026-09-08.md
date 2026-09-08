# Selección de rival desde la pantalla inicial (Balances Históricos)

## Objetivo

Hoy en la pestaña **Por Apuesta** sólo puedes elegir un rival después de entrar a una apuesta. El selector debe subir un nivel: quedar en el mismo renglón donde están los filtros de periodicidad (3M / 6M / 1A / Todo) de la pantalla inicial, de modo que todo el resultado que ves se recalcule contra ese rival. La misma selección se agrega a la pestaña **Evolución**, junto a su renglón de periodicidad, para ver las gráficas contra un contrincante en particular.

## Comportamiento

### Pestaña Por Apuesta
- En el renglón de periodicidad, en el espacio libre a la derecha, aparece un selector "Todos los rivales" con la lista de rivales con los que has jugado.
- Al elegir un rival:
  - El resumen superior (Total / mejor / peor apuesta) muestra sólo lo ganado y perdido contra él.
  - La lista de apuestas muestra sólo las categorías con movimiento contra él, con sus montos y conteo de incidencias recalculados.
  - Las apuestas de parejas (que no tienen rival individual) se ocultan mientras haya un rival seleccionado, ya que su resultado no es atribuible a una persona.
- Al entrar al detalle de una apuesta, el rival elegido se conserva y el detalle ya viene filtrado; el selector interno actual se mantiene sincronizado con el de la pantalla inicial.
- "Todos los rivales" regresa a la vista global actual.

### Pestaña Evolución
- Mismo selector de rival en el renglón de la periodicidad.
- Con un rival elegido, ambas gráficas (Balance Acumulado y balance por mes) usan únicamente el dinero movido entre tú y ese rival en cada ronda; las rondas donde no coincidieron quedan fuera.
- El balance final mostrado corresponde al acumulado contra ese rival.
- Con "Todos los rivales" el comportamiento es exactamente el de hoy.

## Detalles técnicos

Archivo único: `src/components/HistoricalBalances.tsx`. No se requieren consultas nuevas: todo sale de `allSnapshots`, ya en memoria.

- Reutilizar `betsRivalFilter` / `setBetsRivalFilter` como estado compartido de la pestaña Por Apuesta (pantalla inicial + detalle) y agregar `evolutionRivalFilter` para Evolución.
- Reutilizar `betsRivalOptions` (ya existe) para poblar ambos selectores; usar el `Select` de shadcn con clase compacta (`h-7 text-[11px]`) para que quepa en el renglón de filtros.
- `betCategoryData`: agregar `betsRivalFilter` a las dependencias y, dentro del recorrido de `snap.ledger`, descartar las entradas cuyo rival (`fromPlayerId`/`toPlayerId` mapeado a `profileId`) no coincida con el filtro; cuando hay rival seleccionado, omitir categorías `isTeamBet`.
- `evolutionData`: derivar el monto por ronda desde `snap.ledger` filtrado por rival cuando `evolutionRivalFilter !== 'all'`, en lugar de `getSnapshotTotalBalance`; excluir rondas con monto sin coincidencias. Con `'all'` se conserva la lógica actual sobre `myRounds`.
- Mantener los `ScrollArea` y el formato de montos negativos ya corregidos.
- Verificación: typecheck y revisión visual en viewport móvil de ambas pestañas con y sin rival seleccionado.
