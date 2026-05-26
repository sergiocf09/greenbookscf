# Dictamen UX: Agregar participantes a Teams Cup

## Lo que encontré (diagnóstico)

Tracé el flujo completo de cómo un participante llega a una competencia por equipos:

**1. Creación (`CreateTeamsCupDialog`)** — 2 pasos:

- Paso 1: Nombre, descripción, formato.
- Paso 2: Nombres y colores de Equipo A / Equipo B.
- **NO hay ningún paso para agregar jugadores.** Al cerrar, la competencia queda con 0 participantes.

**2. Detalle (`TeamsCupDetailInline`)** — al entrar el usuario ve:

- Marcador global 0–0.
- Sección "Matches" (vacía, con botón "+ Agregar Match").
- Sección "Participantes" colapsada, con badge "0 jugadores" y solo un botón **"Asignar Equipos"**.
- El botón "Asignar Equipos" abre un panel que **solo permite reasignar el equipo y HCP de participantes que ya existen.** Si la lista está vacía, el panel está vacío. No ofrece manera de añadir jugadores.

**3. Único camino real para añadir participantes** (oculto):

- Salir del leaderboard, ir al Dashboard, abrir una ronda existente, abrir "Vincular a Leaderboard" (`LinkRoundToLeaderboardDialog`) y elegir la Teams Cup. Esto trae a los jugadores de esa ronda como participantes.
- O esperar a que otro organizador vincule su ronda y los jugadores se importen automáticamente.

## Por qué esto rompe la experiencia

- El nombre del único botón ("Asignar Equipos") **presupone que ya hay jugadores**. Cuando no los hay, no hay affordance que diga "agregar".
- El flujo de creación termina prometiendo una competencia lista, pero el usuario aterriza en una pantalla donde lo único accionable ("Agregar Match") falla porque no hay roster.
- La dependencia de "vincular una ronda" para sembrar jugadores es un modelo mental invertido: en una copa por equipos primero se arma el roster, luego se juegan rondas.
- No hay manera de invitar amigos directamente, ni de agregar guests sueltos, ni de añadir un jugador faltante después.

## Propuesta (alcance UX, sin tocar motor de cálculo)

### A. Botón primario "Agregar Jugadores" en el detalle de Teams Cup

En `TeamsCupDetailInline`, sección Participantes:

- Reemplazar el header por: título + **dos** botones: `+ Agregar Jugadores` (primario) y `Asignar Equipos` (secundario, deshabilitado si hay 0 participantes).
- Cuando el roster esté vacío, mostrar un **empty state explícito** debajo del marcador 0–0:
  > "Aún no hay jugadores. Agrega participantes para empezar a armar matches."  
  > [+ Agregar Jugadores]

### B. Nuevo diálogo `AddCupParticipantsDialog`

Reutiliza patrones existentes (avatar, search, selección múltiple). Tres tabs/secciones:

1. **Mis amigos** — lista de `friendships` con checkbox, HCP editable inline, asignación rápida A/B/—.
2. **Buscar por usuario** — input de nombre/email (mismo patrón que en el setup de ronda).
3. **Invitado (guest)** — campos: nombre, iniciales (auto), color, HCP. Inserta `leaderboard_participants` con `profile_id=null` y `guest_name`.

Acción "Agregar seleccionados" inserta filas en `leaderboard_participants` (con `cup_team_id` opcional si ya eligió equipo en la misma pantalla). Esto unifica los dos pasos "agregar" + "asignar equipo".

### C. Paso opcional al final de la creación

En `CreateTeamsCupDialog`, después del Paso 2 (equipos), agregar un **Paso 3 opcional**:

- "¿Quieres agregar jugadores ahora?" → [Más tarde] · [Agregar ahora]
- "Agregar ahora" abre directo el mismo `AddCupParticipantsDialog` con la nueva competencia ya creada.

Esto cierra el loop de la creación sin obligar al usuario a saber del flujo de "vincular ronda".

### D. Mantener el flujo de "vincular ronda" como atajo

El path actual (importar participantes desde una ronda vinculada) sigue funcionando sin cambios — solo deja de ser el **único** camino.

## Archivos afectados

- `src/components/leaderboards/TeamsCupDetailInline.tsx` — empty state + nuevo botón + handler para abrir el diálogo.
- `src/components/leaderboards/AddCupParticipantsDialog.tsx` — **nuevo** componente.
- `src/components/leaderboards/CreateTeamsCupDialog.tsx` — paso 3 opcional + apertura del nuevo diálogo tras crear.
- `src/hooks/useTeamsCup.ts` — exponer (si no existe) un método `addParticipants(rows[])` que haga el insert batch con `cup_team_id` opcional.

## Lo que NO cambia

- Motor de matches, cálculo de puntos, RLS, esquema de DB.
- Comportamiento de "Asignar Equipos" para rosters existentes (sigue tal cual).
- Importación automática al vincular una ronda.

## Pregunta antes de implementar

¿Quieres que en el **Paso 3 de creación** ofrezca también traer participantes desde una ronda existente del usuario (atajo visual), o lo dejo solo con amigos / buscar / guest para mantenerlo simple?   Solo con amigos buscar guest para simpleza 