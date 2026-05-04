
# Plan: Rondas Pendientes por rol + Co-Administradores de ronda (v2)

## Parte 1 — Diálogo "Tarjeta pendiente" (Perfil → Rondas Pendientes)

**Estado actual** (`src/pages/Index.tsx` ~L2232–2304): el diálogo lista todas las rondas pendientes con tres acciones idénticas para todos: **Restaurar**, **Cerrar**, **Iniciar nueva**. El botón "Cerrar" llama a `handleClosePendingRoundPermanently` que hace `UPDATE rounds SET status='completed'`. Esto solo funciona si el usuario es organizador (RLS lo bloquea en otros casos) y por eso aparece el toast "requiere ser organizador". Además, no genera snapshot ni cierra correctamente la ronda — es un cierre "sucio".

### A) Detección de rol por tarjeta
Extender `PendingRoundInfo` (en `useRoundManagement.ts`) con `isOrganizer: boolean`, comparando `rounds.organizer_id === profile.id`.

### B) Si **es organizador** de la tarjeta
Botones: **Restaurar** y **Cerrar tarjeta**.
- "Cerrar tarjeta" ya **no** hace UPDATE directo. En su lugar:
  1. Cierra el diálogo y restaura la ronda (`handleRestorePendingRound`).
  2. Setea `sessionStorage.setItem('jump_to_close_after_restore', '1')`.
  3. Tras restaurar, `Index.tsx` detecta el flag → cambia `view = 'bets'` y hace `scrollIntoView` al bloque "Cerrar Tarjeta y Guardar" en `PlayViews.tsx`.
  4. Encima de esa sección se muestra un banner amarillo (`<Alert>`):
     > "Para cerrar tu ronda, ciérrala desde la sección de abajo (escribe CERRAR para confirmar)."
  5. El cierre real sigue pasando por `CloseRoundConfirmDialog` (snapshot/ledger completos).

### C) Si **NO es organizador** de la tarjeta
Botones: **Restaurar** y **Ocultar de mi vista**.
- "Ocultar de mi vista" no toca BD. Guarda el `roundId` en `localStorage` (`gb_hidden_pending_rounds_<profileId>`) y filtra esos IDs en `pendingRounds` y en el badge del header.
- Toast: "Tarjeta ocultada de tu vista. El organizador es el único que puede cerrarla oficialmente."
- Cuando el organizador cierre la ronda, deja de aparecer naturalmente.

### D) Botón global **"Iniciar nueva"** sin cambios.

### Dictamen para el participante no-organizador
Lo que ve en su móvil cuando hay una tarjeta pendiente que él no creó:
- La ronda sigue `in_progress`/`setup` en BD; sus scores y los de los demás están persistidos.
- El ledger y snapshot **no** están sellados — se sellan solo al cierre formal del organizador.
- Si **Restaura**, vuelve a la ronda en vivo (con las restricciones de la Parte 2).
- Si **Oculta**, simplemente quita el "ruido" local; cuando el organizador cierre, aparecerá como completada en su Historial.

---

## Parte 2 — Concurrencia y modelo de Co-Administradores (con multi-grupo)

### Diagnóstico
Hoy las RLS de `hole_scores`, `round_handicaps`, `hole_markers`, `nines_config`, `sixes_config`, configs de apuestas, etc. permiten escritura a **cualquier** participante (`is_round_participant`). Esto causa colisiones visuales por Realtime, scores cambiados por error y desconfianza en la mesa, aunque la matemática quede correcta.

### Modelo de roles (clarificado por el usuario)

| Rol | Capturar scores / HCP / configs de apuestas dentro de un grupo | Editar bilateralidades (lápiz / "X") | Cerrar ronda |
|-----|---|---|---|
| **Organizador (creador)** | **Sí, en TODOS los grupos** (toma control de cualquier grupo en cualquier momento) | Sí | Sí (único) |
| **Co-administrador del Grupo N** | Sí, **solo dentro de su grupo N** | Sí | No |
| **Participante** | **No** (solo lectura en captura/HCP/configs globales) | **Sí** (puede modificar el override bilateral o darle "X" a una apuesta entre él y otro jugador) | No |
| **Invitado/Guest** | No | No | No |

#### Aclaración clave 1 — Organizador "todopoderoso"
El organizador no está limitado a su grupo. En cualquier momento puede entrar al grupo 2, 3, 4, etc. y capturar scores, modificar HCP, modificar configuraciones de apuesta del grupo, etc. Su rol equivale a co-admin universal de todos los grupos.

#### Aclaración clave 2 — Bilateralidades siguen abiertas a TODOS
El lápiz de edición de cualquier bilateralidad (en `BilateralDetail`) y el botón "X" para excluir la apuesta de ese par siguen disponibles para **cualquier usuario** participante de la ronda, sin restricción de admin. Razón: es muy común que un par decida no jugar cierta apuesta entre ellos, ajustar el monto o el carry, y eso debe poder hacerse por cualquiera de los dos involucrados sin depender del organizador.

> El bloqueo solo aplica a:
> - Captura de scores y putts
> - Edición de handicaps (`HandicapMatrix`)
> - Configuración global de apuestas (`BetEditors` para parámetros de la matriz)
> - Markers, side bets de cuadrilla (Oyes, Zoo, Wolf, Nines, Sixes, Vegas)

### Cambios de base de datos

1. `ALTER TABLE round_players ADD COLUMN is_admin boolean NOT NULL DEFAULT false;`
2. Backfill compatibilidad: para rondas con `status IN ('setup','in_progress')`, marcar `is_admin=true` a todos los `round_players` con `profile_id IS NOT NULL` (no romper rondas en vuelo).
3. Función SQL `is_round_admin(p_round_id uuid)` (SECURITY DEFINER): devuelve true si el usuario es organizador **o** tiene `is_admin=true` en `round_players` para esa ronda.
4. Función SQL `is_group_admin(p_group_id uuid)` (SECURITY DEFINER): true si el usuario es organizador de la ronda dueña del grupo, **o** es `is_admin=true` y pertenece a ese `group_id`.
5. **Reemplazar políticas de escritura** (INSERT/UPDATE/DELETE) que hoy usan `is_round_participant` por las nuevas:
   - `hole_scores` y `hole_markers`: usar `is_group_admin` calculado vía join `round_players → group_id`.
   - `round_handicaps`: usar `is_round_admin` (la matriz de HCP es global a la ronda).
   - `nines_config`, `sixes_config`, configs de apuestas grupales: `is_round_admin` (organizador) o `is_group_admin` según el scope del registro. Para configs globales que solo el organizador toca, mantener `is_round_organizer`.
6. `bilateral_bets`: **mantener `is_round_participant`** para INSERT/UPDATE (cualquier participante puede editar cualquier bilateral en la que esté involucrado o no — hoy ya es así y se mantiene por petición explícita).
7. Policy nueva en `round_players`: solo el organizador puede actualizar la columna `is_admin`.
8. Mantener `SELECT` con `is_round_participant` en todas las tablas (todos siguen viendo en vivo).

### Cambios de UI

1. **Setup de la ronda** (`PlayerSetup.tsx` / `SetupView.tsx`):
   - Junto a cada jugador registrado (no guest, no organizador) un toggle **"Co-admin de este grupo"**, visible **solo para el organizador**. Persiste en `round_players.is_admin`.
   - Validación bloqueante al "Iniciar Ronda" si hay >1 grupo: cada grupo distinto al del organizador debe tener **al menos un co-admin designado**. Mensaje:
     > "Tu ronda tiene varios grupos. Designa al menos un co-administrador en cada grupo distinto al tuyo para que puedan capturar scores."
2. **Indicador visual**: avatar con badge dorado (escudo) para admins; doble badge para el organizador.
3. **Hook `useIsRoundAdmin(roundId, groupId?)`** en `src/hooks/`:
   - `{ isOrganizer, isRoundAdmin, isGroupAdmin(groupId) }`.
   - `isRoundAdmin = isOrganizer || (own row).is_admin`.
   - `canEditGroup(groupId) = isOrganizer || (own row in that group && is_admin)`.
4. **Modo solo-lectura para no-admins** (escritura deshabilitada con tooltip "Solo el organizador o un co-administrador de tu grupo puede editar esto"):
   - `ScoringView`, `PlayerScoreInput`, `ScoreStepper` → inputs y botón Confirmar `disabled` si `!canEditGroup(group_of_that_player)`.
   - `HandicapMatrix` → bloqueado si `!isRoundAdmin`.
   - `BetEditors` (configs globales en setup) → bloqueado si `!isRoundAdmin`.
   - Diálogos `OyesesDialog`, `ZoologicoDialog`, `SideBetsDialog`, `WolfDecisionPanel`, `NinesLiveTable`, etc. → bloqueados si `!canEditGroup`.
   - **`BilateralDetail` (lápiz y "X" de pares)** → **NO se bloquea**. Cualquier participante sigue pudiendo ajustar amount, carry y excluir la apuesta entre cualquier par. Mantener tal cual hoy.
5. **Organizador toma control**: como las RLS y el hook le dan acceso total, no requiere UI especial — al navegar a cualquier grupo simplemente verá los controles habilitados. Opcional: badge "Modo organizador" en el header cuando esté operando un grupo distinto al suyo.

### Compatibilidad multi-grupo
- Co-admin del Grupo 2 puede capturar todo dentro del Grupo 2; **no** puede tocar Grupo 1, 3, 4.
- Organizador puede tocar **todos** los grupos sin restricción.
- Se mantiene la regla de visibilidad cross-group existente y la regla de cierre exclusivo del organizador del Grupo 1.

### Compatibilidad rondas existentes
La migración de backfill (paso 2 de SQL) marca a todos los participantes como admin para rondas ya en curso, garantizando que no se rompan flujos en vuelo. Solo rondas nuevas estrenan el modelo restrictivo.

---

## Archivos principales a tocar
- `src/hooks/useRoundManagement.ts` — agregar `isOrganizer` a `PendingRoundInfo`; filtrar pendientes ocultas localmente.
- `src/hooks/useIsRoundAdmin.ts` — nuevo hook con `isOrganizer / isRoundAdmin / canEditGroup`.
- `src/pages/Index.tsx` — diálogo de pendientes con dos variantes (organizador vs participante); flag `jump_to_close_after_restore`; handlers `handleHidePendingRoundLocally` y `handleRestoreAndJumpToClose`.
- `src/components/views/PlayViews.tsx` — banner destacado encima de "Cerrar Tarjeta y Guardar"; ref para scroll.
- `src/components/setup/PlayerSetup.tsx` — toggle "Co-admin" por jugador (visible solo a organizador) + validación multi-grupo.
- `src/components/scoring/*`, `src/components/setup/HandicapMatrix.tsx`, `src/components/bets/BetEditors.tsx` y diálogos de side bets — disable según `useIsRoundAdmin`.
- `src/components/bets/BilateralDetail.tsx` — **sin cambios de permisos** (queda abierto a todos los participantes).
- `src/components/PlayerAvatar.tsx` — badge admin/organizador.

## Migración SQL (única)
1. `ALTER TABLE round_players ADD COLUMN is_admin boolean NOT NULL DEFAULT false;`
2. Backfill rondas en curso → todos `is_admin = true`.
3. `CREATE FUNCTION is_round_admin(uuid) ...` y `CREATE FUNCTION is_group_admin(uuid) ...` (ambas SECURITY DEFINER, search_path = public).
4. DROP + CREATE policies de escritura en las tablas listadas, usando las nuevas funciones.
5. Policy en `round_players`: solo organizador actualiza `is_admin`.

## Fuera de alcance (futuras iteraciones)
- Auditoría (quién modificó qué).
- Notificaciones push al organizador cuando un co-admin captura.
- "Tomar control temporal" explícito por UI (hoy implícito por permisos).

¿Apruebas este plan v2 para implementarlo?
