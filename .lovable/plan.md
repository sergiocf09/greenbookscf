# Gestión de Foursomes post-creación en Team Cup

Hoy, una vez que se crea la ronda desde el detalle de la Team Cup, la tarjeta "Crear Ronda y Grupos de Juego" desaparece (`!linkedRoundInfo.date`) y ya no hay forma de:

- Reacomodar quién juega en qué foursome.
- Agregar nuevos jugadores (sobre todo invitados) a la ronda enlazada.
- Crear/eliminar grupos adicionales.

Esto se resuelve agregando un panel de "Foursomes de la Ronda" que vive en el detalle de la Cup y sólo aparece cuando ya existe ronda enlazada.

## Alcance

1. **Nuevo bloque "Foursomes de la Ronda" (sólo organizador, cuando ya hay ronda enlazada)**
   - Muestra cada grupo (Grupo 1, Grupo 2, …) con los jugadores actuales (nombre + initials, marca de invitado, HCP de la ronda).
   - Acciones por jugador: mover a otro grupo (popover con los grupos existentes) y quitar del grupo (vuelve a "Sin asignar").
   - Acciones por grupo: renombrar visualmente (sólo número), eliminar grupo vacío.
   - Botón "Agregar Grupo" (crea `round_groups` con el siguiente `group_number`).
   - Sección "Sin asignar" arriba: lista participantes de la Cup que aún no están en `round_players` o que quedaron sin grupo, con botón rápido "Asignar a Grupo N".
   - Botón "Guardar cambios" (full-width, alineado al patrón ya usado en el diálogo de equipos/HCPs).

2. **Agregar jugadores después de creada la ronda**
   - Reusar el flujo existente "Agregar Jugadores" (`setShowAddParticipants`) pero, cuando ya hay `linkedRoundInfo`, además de crear `leaderboard_participants` también:
     - Crear/usar el `profile` (ghost si invitado, igual que hoy).
     - Insertar el `round_player` correspondiente en el último grupo (o en "Sin asignar" si el organizador prefiere acomodarlos manualmente).
     - Calcular `handicap_for_round` con `calculateCourseHandicap` a partir del `course_id` de la ronda y el tee elegido (default = tee del organizador o blanco).
   - Tras agregarlos, el bloque de Foursomes resalta los recién llegados para que el organizador los mueva al grupo correcto.

3. **Sincronización con la Cup**
   - Cuando se asigne tee/HCP desde el panel de "Asignar Equipos y Hándicaps", seguir actualizando `round_players` (ya implementado).
   - Si se elimina un jugador del round (no de la Cup), se borra `round_players` pero el `leaderboard_participants` permanece (el usuario sigue siendo parte de la Cup aunque no juegue ese día). Mostrar confirmación.

## Detalle técnico

- Archivo nuevo: `src/components/leaderboards/ManageFoursomesDialog.tsx` (o sección inline) que recibe `roundId`, `leaderboardId`, lista de participants de la Cup y maneja:
  - Fetch de `round_groups` + `round_players` del `roundId`.
  - Mutaciones: `insert/update/delete` sobre `round_groups` y `update group_id` / `insert` / `delete` sobre `round_players`.
- Hook auxiliar en `useTeamsCup` (o nuevo `useRoundFoursomes`) para encapsular el fetch + mutate y refrescar `cup` y `linkedRoundInfo`.
- Render dentro de `TeamsCupDetailInline.tsx`: reemplazar la condición actual de la tarjeta "Crear Ronda…" por:
  - Sin ronda → tarjeta actual de creación.
  - Con ronda → nueva tarjeta "Foursomes de la Ronda" con botón "Editar Foursomes" que abre el diálogo.
- Reutilizar utilidades de `teamsCupRoundBuilder.ts` (cálculo de HCP por tee/curso) para mantener consistencia.
- RLS: las políticas existentes de `round_groups`/`round_players` ya permiten al organizador todas las operaciones; no se requiere migración.

## Fuera de alcance

- Cambiar la lógica de creación inicial (`CreateRoundFromCupDialog`).
- Reordenar holes de salida por grupo (eso vive en otra pantalla).
- Cambios en matches/balance.
