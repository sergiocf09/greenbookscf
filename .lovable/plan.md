## Diagnóstico

Confirmado: hoy el importador **exige** que el usuario logueado sea participante de la ronda.

En `src/hooks/useScorecardImporter.ts`:
- `mappingsValid` requiere **exactamente un** mapeo `kind: 'self'` entre los jugadores detectados.
- El pipeline `runSave` usa `create_round` (RPC) que crea al organizador como `round_player` y luego reasigna ese `round_player_id` al jugador marcado como "self". Sin "self", el organizador queda como un participante fantasma.

Esto bloquea el caso real (muy común): una persona ayuda a capturar la tarjeta pero no jugó.

## Solución propuesta

Permitir un modo **"Capturista no participante"** en el Paso 3 (Mapeo).

### Cambios de UX (Paso 3)

1. Añadir un **toggle/checkbox** al inicio del paso:
   > ☐ "Yo también jugué esta ronda"
   - **Activado (default)**: comportamiento actual — exige marcar exactamente un jugador como "Yo" (self).
   - **Desactivado**: ninguna fila requiere ser "self"; el usuario logueado queda como **organizador no participante**. Todos los jugadores detectados se mapean como `registered` o `guest`.

2. En el selector por jugador, la opción "Yo" se oculta cuando el toggle está desactivado.

3. `mappingsValid` se ajusta:
   - Si "Yo también jugué" → exige exactamente 1 self (como hoy).
   - Si no → exige 0 self, y que todos sean `registered` o `guest` válidos.

### Cambios en el pipeline `runSave`

- Si hay `self`: flujo actual sin cambios.
- Si **no hay self** (capturista externo):
  - Se crea la ronda igual con `create_round` (el usuario logueado queda como organizador dueño).
  - El `organizerRoundPlayerId` creado por el RPC se **elimina** de `round_players` después de insertar a todos los jugadores reales, para que el organizador **no aparezca en el scorecard** ni en las apuestas.
  - `rounds.organizer_id` / `created_by` permanecen apuntando al capturista (autoridad para editar/borrar).
  - El snapshot se genera solo con los jugadores reales.

### Indicador visual "Organizador no participante"

En consistencia con la convención existente de mostrar rol "organizador / no organizador":

1. **Historial (`RoundHistory`)** y **vista histórica (`HistoricalRoundView`)**: mostrar un badge sutil junto al nombre del organizador cuando este no aparece en `round_players`:
   > 📷 "Capturada por {Nombre}" (badge outline, tamaño `text-xs`)

2. **Selector "Designar organizador real"** (opcional, se implementa como consecuencia natural del toggle):
   - Si el capturista sí jugó → él es organizador y participante (comportamiento actual).
   - Si el capturista designa a un jugador registrado como "responsable" (futuro, no en este cambio) → se maneja igual pero el capturista sigue siendo dueño técnico. **No se implementa transferencia de organizador en esta iteración** para mantener el cambio acotado; el capturista conserva autoridad de borrado, que es lo pedido.

### Permisos y borrado

- El capturista es siempre `rounds.organizer_id`, por lo que las RLS existentes de edición/cierre/borrado siguen funcionando sin cambios.
- Si el capturista jugó (marcó self), además aparece como `round_player` con `is_organizer=true` — comportamiento actual.
- Si no jugó, tiene autoridad vía `organizer_id` pero **no** figura como jugador — que es exactamente el comportamiento pedido.

## Alcance

- `src/hooks/useScorecardImporter.ts`: añadir estado `capturistIsPlayer` (bool, default `true`), ajustar `mappingsValid`, ajustar `runSave` para borrar el `round_player` del organizador cuando `capturistIsPlayer=false`.
- `src/pages/ScorecardImporter.tsx`: añadir toggle en Paso 3, ocultar opción "Yo" cuando corresponde, mostrar hint contextual.
- `src/components/RoundHistory.tsx` y `src/components/HistoricalRoundView.tsx`: badge "📷 Capturada por …" cuando `organizer_id` no está en la lista de `round_players`.

## Detalles técnicos

- No se toca `create_round` (RPC) ni el esquema; el borrado del `round_player` organizador es un simple `DELETE` posterior al insertar los jugadores reales, antes de guardar scores.
- Los `hole_scores` del organizador nunca se llegan a insertar (el pipeline itera solo `editablePlayers`).
- El snapshot ya se construye a partir de `editablePlayers` únicamente, por lo que queda consistente automáticamente.
- El badge de "Capturada por" se calcula en cliente: `!round.players.some(p => p.profileId === round.organizerId)`.

## Fuera de alcance

- Transferencia de rol de organizador a otro jugador registrado.
- Cambios en el flujo de ronda en vivo.
- Cambios en RLS / migraciones.
