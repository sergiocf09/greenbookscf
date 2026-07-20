## Objetivo

Actualizar el campo **Club de Golf Juriquilla** (`252ee05a-...`) con los datos oficiales de la tarjeta Grint, y limpiar el duplicado `Golf Juriquilla` (`0eb889c9-...`).

## Cambios

### 1. Actualizar `course_tees` del registro principal

Migración (UPDATE) para dejar:

- Blue: 72.3 / 137
- White: 69.9 / 127
- Yellow → renombrar a **Gold**: 69.1 / 125
- Red: 69.3 / 128

### 2. Actualizar yardajes por hoyo (`course_holes`) con los valores exactos de la tarjeta Grint

Blue / White / Gold (antes Yellow) / Red para los 18 hoyos.
Totales objetivo: Blue 6648, White 6202, Gold 6012, Red 4813.

Pars y stroke_index se dejan igual (ya coinciden).

### 3. Manejar el duplicado `Golf Juriquilla` (`0eb889c9-...`)

Verificar si tiene rondas asociadas:

- **Sin rondas** → eliminar (y sus `course_tees` / `course_holes`).
- **Con rondas** → dejarlo tal cual y solo marcarlo oculto (`course_visibility`) o remapear; se decidirá al momento según el conteo.

### 4. Ajuste de UI (si aplica)

En `src/components/setup/CourseSelect.tsx` / lugares donde se listan colores de tee: verificar que "Gold" se maneje. Si el proyecto solo soporta `blue|white|yellow|red`, mantener la clave interna `yellow` pero mostrar la etiqueta "Gold" para este campo — a confirmar al implementar.

## Detalles técnicos

- Todo vía `supabase--migration` (UPDATE/DELETE) — no cambia esquema.
- No hay impacto en rondas cerradas: los snapshots ya guardan sus propios ratings/pares.
- Sí impacta cálculos futuros de HCP de cancha y diferenciales USGA (que es justamente la corrección deseada).

## Pregunta abierta

¿Confirmas que renombremos el tee **Yellow → Gold** en este campo? (la tarjeta Grint lo llama Gold; internamente puede seguir siendo `yellow` para no romper enums, pero conviene decidir.)

&nbsp;

En toda la aplicación y funcionalidad sería cambiar Amarillas por Doradas, que es la comunicación común en el golf y es el equivalente a Gold en ingles .... 

confirma que no afecta todo lo ya guardado con los slopes y rating anteriores y a tés de implementar muéstrame una ya la de mo que cambia y lo que había antes de esos datos. 