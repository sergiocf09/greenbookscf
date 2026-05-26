
## Diagnóstico

**1. Error "new row violates row-level security policy for table cup_matches"**

Las políticas actuales de `cup_matches` (INSERT/UPDATE/DELETE) exigen que quien ejecuta la acción sea **participante activo del leaderboard** (`leaderboard_participants.profile_id = get_my_profile_id() AND is_active = true`).

En esta Cup ("Ryder Juriquilla") el organizador creó el evento y agregó 13 jugadores con `AddCupParticipantsDialog`, pero **a sí mismo no se agregó** como participante. Por eso al pulsar "Agregar Match" PostgREST rechaza el INSERT.

La política de SELECT ya contempla al creador (`le.created_by = get_my_profile_id()`), pero las de INSERT/UPDATE/DELETE no. Hay que alinearlas.

**2. UX: eliminar jugadores desde el roster**

Hoy `AddCupParticipantsDialog` solo agrega. Si te equivocas en un nombre o sobra alguien, no hay forma intuitiva de quitarlo desde la vista de la Cup. Hay que poder eliminar con un click desde el propio roster de Participantes.

## Plan

### A. Migración SQL — RLS de `cup_matches`

Reescribir las tres policies de mutación para permitir **al creador del leaderboard** además de a los participantes activos:

```sql
DROP POLICY "Participants can manage cup matches insert" ON public.cup_matches;
DROP POLICY "Participants can manage cup matches update" ON public.cup_matches;
DROP POLICY "Participants can manage cup matches delete" ON public.cup_matches;

CREATE POLICY "Creator or participants can insert cup matches"
  ON public.cup_matches FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM leaderboard_events le
            WHERE le.id = leaderboard_id AND le.created_by = get_my_profile_id())
    OR EXISTS (SELECT 1 FROM leaderboard_participants lp
               WHERE lp.leaderboard_id = cup_matches.leaderboard_id
                 AND lp.profile_id = get_my_profile_id()
                 AND lp.is_active = true)
  );
-- equivalentes para UPDATE (USING+WITH CHECK) y DELETE (USING).
```

### B. UX — Eliminar jugador desde el roster

En `TeamsCupDetailInline.tsx`, sección "Participantes" (filas de Equipo A, Equipo B y "Sin equipo"):

- Agregar un ícono `Trash2` muted al final de cada fila, **solo visible para el creador**.
- Al pulsarlo, abrir `AlertDialog` de confirmación: *"¿Eliminar a {nombre} de esta competencia? Si tiene matches asignados también deberás recrearlos."*
- Bloquear la eliminación si el jugador aparece en algún `cup_matches` (player_a1/a2/b1/b2). En ese caso el dialog muestra un mensaje explicativo y un atajo "Quitar de matches primero" (cierra el confirm y abre el editor de matches afectados). Esto evita huérfanos.
- Acción: soft-delete con `is_active = false` en `leaderboard_participants` (consistente con el patrón existente del hook que filtra por `is_active`), luego `cup.fetchAll()`.

Espejear el mismo ícono de borrar en cada fila del panel "Asignar Equipos y Hándicaps" (también solo para el creador), por simetría.

### Detalles técnicos

- Archivos a tocar: migración SQL nueva + `src/components/leaderboards/TeamsCupDetailInline.tsx` (filas de participantes y panel de asignación). No requiere cambios en `useTeamsCup` salvo, opcionalmente, un helper `removeParticipant(id)`.
- La función `get_my_profile_id()` ya existe y se usa en las políticas vigentes.
- No se modifica el flujo de `AddCupParticipantsDialog` ni `CreateRoundFromCupDialog`.
- Si después de eliminar un jugador el creador quiere "revivirlo", lo vuelve a buscar y agregar con el dialog existente (el `is_active=false` se reactiva con un upsert; ya está cubierto por el flujo actual).
