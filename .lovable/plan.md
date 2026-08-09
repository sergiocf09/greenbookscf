# Consistencia del filtro por campo en Estadísticas

## Dictamen

Al seleccionar un campo, las secciones 1-3 (KPIs, distribución, par performance, detalle por hoyo) sí filtran porque usan `get_player_stats(p_course_id)`.

Las dos secciones inconsistentes:

- **Logros**: usa `get_player_milestones()`, que no acepta parámetro de campo. Calcula todo sobre todas las rondas completadas del jugador. Lo que se percibe como "mezcla" es simplemente que ningún dato de Logros está filtrado, mientras el título "Rondas jugadas" sí viene de `stats` (que sí está filtrado). De ahí la incongruencia visual.
- **Últimas Rondas**: usa `get_player_recent_rounds()`, también sin parámetro; devuelve las últimas rondas de cualquier campo.

## Qué se va a hacer

1. Agregar parámetro opcional `p_course_id uuid default null` a ambas funciones y filtrar por `r.course_id = p_course_id` cuando venga.
2. En Logros, con campo seleccionado:
   - Águilas, birdies, mejor ronda, mejor racha, hoyos jugados, hole in one, rondas sin doble bogey, rangos de score (<80, 80-89, 90-99, >100), rondas jugadas y contrincantes se calculan solo con rondas de ese campo.
   - El indicador "Campos jugados" se oculta cuando hay un campo seleccionado (no aporta nada: siempre 1).
3. En Últimas Rondas: mostrar las últimas 10 rondas del campo seleccionado; el título pasa a "Últimas Rondas · {Campo}" para que quede explícito.
4. Los títulos "Logros" y "Últimas Rondas" reflejarán el alcance activo (Todos los campos vs campo seleccionado).

## Detalles técnicos

- Migración: `CREATE OR REPLACE FUNCTION get_player_milestones(p_course_id uuid default null)` y `get_player_recent_rounds(p_course_id uuid default null)`; añadir el filtro en el loop de racha, en el CTE `base`, en el conteo de contrincantes y en la consulta de rondas recientes (con `LIMIT 10`).
- `src/hooks/usePlayerStats.ts`: pasar `p_course_id: courseId ?? undefined` a ambas RPC (el efecto ya depende de `courseId`).
- `src/pages/Stats.tsx`: pasar `courseName`/`courseId` a `Milestones` y `RecentRoundsSection` para el título y el ocultamiento de "Campos jugados".
- Sin cambios de esquema ni de RLS; ambas funciones siguen siendo `SECURITY DEFINER` acotadas al perfil del usuario.
