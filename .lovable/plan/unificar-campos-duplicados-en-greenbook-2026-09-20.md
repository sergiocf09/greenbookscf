# Unificar campos duplicados en GreenBook

Hoy hay 4 campos cargados dos veces. Al buscar, el usuario ve dos opciones idénticas y no sabe cuál usar; y si el catálogo externo publica el mismo campo con otro nombre (ej. "Zibata Golf Course"), se crearía una tercera copia.

## Qué se hace

### 1. Dejar un solo campo por club (fusión)

Para cada par se elige un campo "bueno" y el otro desaparece. Las rondas, favoritos y campos visibles del duplicado se pasan al bueno, así que nadie pierde historial ni resultados.

| Club | Se queda | Se elimina | Motivo |
|---|---|---|---|
| Zibatá (El Marqués) | copia con 3 rondas | copia con 1 ronda | ambas ya tienen la tarjeta corregida; se conserva la más usada |
| San Gil (San Juan del Río) | copia con 2 rondas | copia con 1 ronda | ambas con 5 tees |
| Malanquín (San Miguel) | copia con 5 tees y 1 ronda | copia manual con 1 tee | la manual solo tiene un tee |
| Álamo Country Club (Celaya) | copia con 4 tees | copia manual con 1 tee (1 ronda) | se conserva la de tarjeta completa y se le pasa la ronda |

Las rondas ya cerradas no cambian de resultado: sus tarjetas y balances quedan guardados como están.

### 2. Evitar que vuelva a pasar

Al traer un campo del catálogo mundial, antes de crearlo se compara el nombre "limpio" (sin acentos y sin palabras como *golf*, *course*, *club*, *campo*) más la ciudad contra lo que ya existe en GreenBook. Si coincide, no se descarga de nuevo: se abre el campo que ya está y se agrega a los campos del usuario, con el aviso "Ya en GreenBook". Así "Zibata Golf Course", "Zibatá" o "Club de Golf Zibatá" apuntan todos al mismo campo.

Además Zibatá y San Gil se añaden a la lista de nombres que siempre redirigen al campo canónico, igual que ya ocurre con Juriquilla.

### 3. Verificación

Después de la fusión: quedan 41 campos sin nombres repetidos, cada ronda sigue apuntando a un campo existente, y una búsqueda de "zibata" devuelve un único resultado.

## Detalle técnico

- Migración de fusión, por cada par (canónico C, duplicado D):
  `UPDATE rounds SET course_id = C WHERE course_id = D;`
  reapuntar `course_favorites` y `course_visibility` con `ON CONFLICT DO NOTHING`, borrar las filas restantes de D en esas tablas, `DELETE FROM course_tees/course_holes WHERE course_id = D`, `DELETE FROM golf_courses WHERE id = D`.
- No se toca `round_snapshots` (el nombre del campo queda copiado dentro del snapshot histórico).
- `supabase/functions/golf-course-proxy/index.ts`:
  - nueva función `normalizeCourseName()` (minúsculas, sin diacríticos, quita `golf|course|club|campo|de|the|cc|country`), usada en el bloque de dedupe (hoy usa `ilike("name", courseName)` exacto) comparando nombre normalizado + ciudad.
  - añadir patrones `/zibat[áa]/i` y `/san gil/i` a `BLOCKED_NAME_PATTERNS` con sus ids canónicos, para que también queden ocultos en la búsqueda externa.
- Queries de verificación posteriores a la migración (conteo por nombre normalizado y `rounds` huérfanas).
