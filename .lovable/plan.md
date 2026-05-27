## Problemas a resolver

1. **Error RLS al guardar Foursomes desde Leaderboards**: `new row violates row-level security policy for table "round_groups"`. Pasa al recrear foursomes después de haber borrado manualmente los grupos desde el Setup.
2. **Eliminar jugadores desde "Foursomes de la Ronda" no los quita del Setup**: solo borra el `round_player` del foursome pero el cup_participant + round queda inconsistente, obligando al organizador a limpiar manualmente desde el Setup.
3. **Card "Crear Ronda y Grupos de Juego" desaparece para siempre**: una vez creada la ronda (aunque queden 0 foursomes / 0 round_players por limpieza manual), no se puede regenerar foursomes desde cero ni usar la opción de "armar foursomes al azar" que existe en el flujo original.

## Causa raíz

- **RLS**: `is_round_organizer(round_id)` valida contra `rounds.organizer_id`. Al borrar grupos desde el Setup, el flujo de Setup probablemente está borrando también la ronda (o reasignando organizador) — `ManageFoursomesDialog` mantiene `roundId` cacheado y al insertar pega contra una ronda inexistente o de otro organizador. Hay que: (a) revalidar que el `roundId` siga vivo y sea del organizador antes de insertar; (b) si no, caer al flujo de "crear ronda" en vez de intentar inserts huérfanos.
- **Sin sincronía Leaderboard ↔ Setup**: `ManageFoursomesDialog` solo toca `round_groups` / `round_players`. No avisa al state de Setup ni borra el participante de la ronda en `leaderboard_participants` (cuando esa es la intención del organizador).
- **Gating del card de creación**: la condición `!linkedRoundInfo.date` esconde el card en cuanto existe `leaderboard_rounds`. Debe esconderse solo cuando exista al menos 1 `round_group` con jugadores.

## Cambios propuestos

### 1) `TeamsCupDetailInline.tsx` – gating del card de creación
- Extender el estado `linkedRoundInfo` con `hasFoursomes: boolean` (count de `round_groups` con al menos 1 `round_player`).
- Card "Crear Ronda y Grupos de Juego" se muestra cuando `!linkedRoundInfo.date || !linkedRoundInfo.hasFoursomes`.
- Card "Foursomes de la Ronda" (gestión) se muestra solo cuando `linkedRoundInfo.hasFoursomes === true`.
- Si existe `leaderboard_rounds` pero sin foursomes/players, `CreateRoundFromCupDialog` debe **reutilizar la ronda existente** en lugar de crear una nueva (parámetro `existingRoundId`).

### 2) `CreateRoundFromCupDialog.tsx` – opción "Armar foursomes al azar"
Confirmar/añadir botón "Armar al azar" (mismo patrón que el setup normal):
- Botón secundario arriba del listado de grupos manual: barajar los participantes seleccionados y distribuirlos en grupos de 4 (último grupo puede quedar con 1-3).
- Mantiene la opción manual existente intacta.

### 3) `teamsCupRoundBuilder.ts` – soporte de `existingRoundId`
Si recibe `existingRoundId`:
- Saltar `rpc('create_round')` y `leaderboard_rounds.insert`.
- Limpiar `round_groups`/`round_players` existentes para esa ronda (DELETE) antes de reinsertar la nueva estructura.
- Reusar el resto del flujo (ghosts, group_id mapping, etc.).

### 4) `ManageFoursomesDialog.tsx` – robustez + sincronía
- Antes de cualquier insert/update, **revalidar** que la ronda exista (`select id from rounds where id = roundId`); si no, cerrar el dialog con toast: "La ronda fue eliminada. Crea una nueva." y refrescar el padre para que reaparezca el card de creación.
- Cuando el organizador "Quitar de la ronda" un jugador, ofrecer (popover) dos acciones:
  - **"Quitar solo de esta ronda"** (comportamiento actual: borra `round_players`, deja `leaderboard_participants`).
  - **"Quitar del Cup completo"** (borra también `leaderboard_participants` + cascades `cup_team_members` / `cup_matches`).
- Tras guardar, emitir `onChanged()` que refresca tanto el Cup como el Setup (`activeRound` se refresca al re-entrar a Play; lo importante es que el state local del Cup vuelva a consultar `round_groups`).

### 5) Mensaje de error más útil
Capturar el código RLS específico (`42501`) en el catch y mostrar: "No tienes permisos sobre esta ronda o la ronda fue eliminada. Vuelve a crearla desde el card superior."

## Fuera de alcance
- Cambiar la lógica de Setup que está dejando inconsistencias al borrar grupos (eso ya es un bug aparte; aquí solo hacemos que Leaderboards se recupere).
- Migraciones de RLS (las políticas están bien; el problema es state stale del cliente).
- Reordenar holes por grupo o cambios en el motor de apuestas.

## Archivos a tocar
- `src/components/leaderboards/TeamsCupDetailInline.tsx` (gating + `hasFoursomes` + paso de `existingRoundId`)
- `src/components/leaderboards/CreateRoundFromCupDialog.tsx` (botón "Armar al azar" + soporte `existingRoundId`)
- `src/lib/teamsCupRoundBuilder.ts` (rama `existingRoundId`)
- `src/components/leaderboards/ManageFoursomesDialog.tsx` (revalidación + opción "Quitar del Cup completo" + manejo de error 42501)
