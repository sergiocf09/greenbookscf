## Problema

En la lista del **Historial de Rondas** la ronda del 6 de mayo de Sergio (9H) muestra **81** en lugar de **36**.

## Causa raíz

Esa ronda fue capturada originalmente como 18H y todos los hoyos quedaron `confirmed=true` en `hole_scores` (verificado en DB: 18 hoyos confirmados, suma = 81). Después se cambió a 9H, pero los registros del back 9 quedaron en la base de datos como confirmados.

El fix anterior (`s.confirmed ? sum + strokes : 0`) no funciona porque **todos los hoyos están confirmados**. Hay que filtrar por **segmento activo** según `roundHoles` y `starting_hole`, no por `confirmed`.

El detalle de la ronda (scorecard) ya filtra correctamente y muestra 36; sólo la lista resumen está mal.

## Cambio

**`src/components/RoundHistory.tsx`** (función `fetchRounds`, líneas ~115-163):

1. Incluir `starting_hole` en el `select` de `rounds` del query principal.
2. Cambiar el `select` de `hole_scores` a `'hole_number, strokes, confirmed'`.
3. Calcular `totalStrokes` filtrando por el rango activo cuando `roundHoles === 9`:
   - `startingHole === 10` → solo hoyos 10-18
   - en otro caso → solo hoyos 1-9
   - 18H → todos los hoyos confirmados (comportamiento actual)

Resultado: la fila del 6-may de Sergio mostrará **36** en lugar de **81**, consistente con el scorecard y con balances históricos.
