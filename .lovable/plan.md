# Diagnóstico: Teams Cup ↔ Captura de Scores

## Cómo está hoy

**Dos mundos paralelos que no se tocan automáticamente:**

1. **Mundo Leaderboard / Teams Cup**
   - Tablas: `leaderboard_events`, `cup_teams`, `leaderboard_participants`, `cup_matches`.
   - Cuando agregas jugadores con el nuevo `AddCupParticipantsDialog`, se crean filas en `leaderboard_participants` (perfil real o invitado). Esto sirve **solo** para armar matches por equipos. Ningún jugador queda "en una ronda".

2. **Mundo Ronda / Scoring**
   - Tablas: `rounds`, `round_groups`, `round_players`, `hole_scores`.
   - Los scores SIEMPRE se capturan contra `round_players` dentro de `round_groups`. La ronda viaja por todo el flujo normal de Setup → BetSetup → Scoring.

**El puente actual** es manual y va en sentido contrario al que pide el usuario:
   - El organizador (u otro jugador) crea/abre una ronda en el flujo normal de Setup, agrega manualmente los jugadores en grupos, y desde la pantalla de la ronda usa **"Vincular a Leaderboard"** (`LinkRoundToLeaderboardDialog`) para conectar esa ronda con el Teams Cup.
   - En `useTeamsCup.fetchAll` hay un *backfill* que asigna ese `round_id` a los `cup_matches` huérfanos para que los resultados se calculen vía `get_cup_match_result`.

## El problema que reporta el usuario

Si creo la Teams Cup y agrego 8 jugadores ahí, **esos 8 jugadores no existen en ninguna ronda**. Para que puedan capturar scores hoy alguien tiene que:
1. Salir del Teams Cup.
2. Crear una ronda nueva desde cero en Setup.
3. Volver a agregar manualmente a los 8 jugadores (duplicando trabajo y arriesgándose a desalinear nombres/HCP).
4. Vincular la ronda al Teams Cup.

No hay forma de armar **grupos de juego (foursomes)** desde dentro del Teams Cup, ni de generar la ronda directamente a partir de los participantes ya capturados.

## Propuesta (lo más simple y robusto)

Añadir una nueva sección dentro de `TeamsCupDetailInline` llamada **"Grupos de Juego"** (visible solo para el creador) y un botón **"Crear Ronda desde esta Cup"**. La idea: usar los `leaderboard_participants` como fuente de verdad y generar todo el andamiaje de ronda en una sola acción.

### Flujo UX (1 sola pantalla, 3 pasos cortos)

1. **Curso + Fecha + Tee + Hoyos** — formulario compacto reutilizando `CourseSelect`. Se prellena con la fecha de hoy.
2. **Armar grupos de juego** — lista de participantes (con su equipo de color) y un selector "Grupo 1 / 2 / 3 / + Nuevo" por jugador. Validaciones: máx 6 por grupo, mín 1 grupo con ≥2 jugadores. Botón "Auto-armar" (opcional) que distribuye balanceado por equipo.
3. **Crear Ronda** — un solo botón que:
   - Inserta `rounds` (organizer = creador del Cup, course_id, date, holes, tee).
   - Inserta `round_groups` por cada grupo definido.
   - Para cada `leaderboard_participant`:
     - Si tiene `profile_id` → inserta `round_players` con ese profile.
     - Si es invitado → crea (o reutiliza) un *ghost profile* y luego `round_players` con guest_name/initials/color.
   - Inserta `leaderboard_rounds` (vincula la ronda recién creada).
   - Actualiza `cup_matches` huérfanos con `round_id` (mismo backfill que ya existe).
   - Navega al `ScoringView` de la ronda o vuelve al detalle del Cup con la ronda ya enlazada.

### Cómo cada jugador captura sus scores después

- Los jugadores con perfil real entran a la app y la ronda les aparece automáticamente (vía `useActiveRoundForLink` / el flujo normal de "tienes una ronda activa"), o reciben el link/QR/código del Cup que ya el organizador puede compartir (el `share_code` del Cup ya existe, pero podemos compartir adicionalmente el `share_code` de la ronda).
- Los invitados (ghost) se manejan con el flujo guest existente (`/join/<code>`) si el organizador comparte el link de ronda.
- El header del Teams Cup ya muestra fecha + campo cuando hay una ronda enlazada; eso seguirá funcionando.

### Edge cases que cubre

- **Participante sin equipo asignado**: se permite (entra a la ronda igual, los matches simplemente no lo usan hasta que se le asigne equipo).
- **Re-crear ronda**: si ya hay una ronda enlazada, el botón cambia a "Ir a la Ronda" + opción "Reemplazar ronda" (con confirmación).
- **Agregar más jugadores después**: cuando se agreguen nuevos participantes al Cup con una ronda ya enlazada, ofrecer en el mismo dialog "Agregar también a la ronda" con selector de grupo.

## Detalle técnico

- **Componente nuevo**: `src/components/leaderboards/CreateRoundFromCupDialog.tsx`. Reutiliza `CourseSelect` y patrones del Setup actual.
- **Helper nuevo**: `src/lib/teamsCupRoundBuilder.ts` con `createRoundFromCup({ leaderboardId, organizerProfileId, courseId, teeColor, holes, date, groups: { groupNumber, participantIds[] }[] })` que hace toda la transacción Supabase (best-effort en cliente; si una parte falla, hace rollback de lo creado).
- **Ghost profile para invitados**: insertar en `profiles` con `is_ghost = true, user_id = null` (política RLS ya lo permite) y luego usar ese `id` en `round_players` con `guest_name / guest_initials / guest_color`.
- **Asignar matches huérfanos a la nueva ronda**: ya existe el backfill en `useTeamsCup.fetchAll`; con que se inserte el `leaderboard_rounds` row, la próxima carga lo resuelve. Aun así, hacer un `UPDATE cup_matches SET round_id = X, status = 'active' WHERE leaderboard_id = Y AND round_id IS NULL` explícito al final del builder para feedback inmediato.
- **Botón**: en `TeamsCupDetailInline`, sección nueva entre "Matches" y "Participantes". Estados: sin ronda → "Crear Ronda y Grupos"; con ronda → "Ir a Capturar Scores" + menú ⋯ con "Reemplazar ronda".

## Lo que NO se toca

- El flujo actual "ronda existente → vincular a leaderboard" se queda intacto para los casos donde alguien ya empezó a jugar y después decide armar el Cup.
- `AddCupParticipantsDialog` ya está estable; solo agregaremos una mejora opcional: si hay ronda enlazada, mostrar checkbox "Agregar también a la ronda" + selector de grupo.
- Schema de DB: no requiere migraciones nuevas; todo se hace con las tablas existentes.