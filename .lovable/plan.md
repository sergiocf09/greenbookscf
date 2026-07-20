## Contexto de impacto

**Datos actuales de "Club de Golf Juriquilla" (`252ee05a-…`):** 160 rondas (156 cerradas, 3 en curso, 1 en setup), 61 perfiles distintos. Es un campo core de la app.

**Duplicado "Golf Juriquilla" (`0eb889c9-…`):** 5 rondas cerradas (mayo/junio/julio 2026). Ya no se puede borrar sin remapear.

## ¿Qué se afecta al cambiar ratings/slopes?

**No se afecta (queda intacto):**

- Scores por hoyo, apuestas, balances económicos, resultados de partido — no dependen de rating/slope.
- Snapshots históricos (`round_snapshots.snapshot_json`) — congelados al cierre.
- `round_players.handicap_for_round` — es el HCP de cancha ya usado en cada ronda; no se recalcula.
- Filas ya escritas en `handicap_history` — cada una guarda su propio `course_rating`, `slope_rating`, `differential`, `adjusted_gross_score`. No cambian retroactivamente.

**Sí se afecta (y esto es lo importante):**

- El **próximo cálculo** del Hcp Index USGA cuando se cierre una nueva ronda: la función `calculateHandicapIndexForProfile` (src/lib/usgaHandicap.ts) **re-lee `course_tees` en vivo** y recalcula el diferencial de las últimas 20 rondas usando el rating/slope actual. Es decir, para las rondas históricas en Juriquilla, el diferencial se recomputará con los nuevos 72.3/137 (Blue), 69.9/127 (White), etc.
- Efecto neto: el Hcp Index de los 61 usuarios se moverá la próxima vez que jueguen. La dirección del movimiento depende del tee y del score, pero al ser Blue de 130→137 (más difícil) y White de 125→127, los diferenciales bajarán ligeramente para quienes juegan esos tees (índices más bajos). Red pasa de 115→128 (más difícil), lo cual reduce diferenciales para damas.

## Riesgos

1. **Cambio "silencioso" de índice de todos los usuarios** la próxima ronda. No es un bug — es la corrección de un error de origen — pero sin aviso puede confundir.
2. **Rondas en curso (3) y setup (1)** en Juriquilla: si ya cargaron HCP de cancha con el slope viejo, al recalcularse podrían mostrar strokes/hoyo distintos si algún hook re-lee slope. Bajo riesgo (el HCP de cancha se congela en `handicap_for_round` una vez que se une el jugador), pero conviene cerrarlas o dejarlas terminar antes del cambio.
3. **Duplicado con 5 rondas cerradas**: si lo eliminamos rompemos FKs y los 5 snapshots huérfanos (aunque el snapshot json es autónomo). Mejor **no borrarlo**; en su lugar ocultarlo de la búsqueda para nuevas rondas.

## Plan recomendado (conservador y consistente)

### Paso 1 — Migración de datos (una sola)

Sobre `Club de Golf Juriquilla` (`252ee05a-…`):

- UPDATE `course_tees`: Blue 72.3/137, White 69.9/127, Yellow 69.1/125, Red 69.3/128.
- UPDATE `course_holes` con los yardajes exactos de la tarjeta Grint (18 hoyos × 4 tees).
- **Pars y stroke_index no cambian** (ya coinciden).

Sobre `Golf Juriquilla` duplicado (`0eb889c9-…`):

- **No se elimina** (tiene 5 rondas cerradas).
- Se marca oculto en `course_visibility` para que no aparezca en el buscador de campos al crear nuevas rondas. Las 5 rondas cerradas siguen consultables desde historial.

### Paso 2 — Reetiquetado UI: "Amarillas" → "Doradas"

Cambio puramente de presentación. Clave interna sigue siendo `yellow` en BD y tipos (para no tocar rondas/enums existentes). Archivos a revisar:

- `src/components/setup/TeePicker.tsx` / `PlayerSetup.tsx` / cualquier `Select` de tee.
- `src/components/courses/CourseInfoStep.tsx` (label del toggle amarillo).
- Componentes de scorecard/leaderboard que muestren "Amarillas".
- Un helper único (ej. `teeLabel(color)`) para no dispersar el string.

### Paso 3 — Backfill opcional del Hcp Index (recomendado)

Ejecutar la Edge Function existente `backfill-handicap-index` para los 61 perfiles con rondas en Juriquilla, así el Hcp Index mostrado se alinea con los nuevos ratings **antes** de que cierren una nueva ronda (evita el "salto silencioso"). Esto solo actualiza el índice actual/último; no reescribe filas históricas de `handicap_history`.

### Paso 4 — Nota informativa (opcional)

Mensaje corto en el próximo email/UI: "Corregimos rating/slope de Juriquilla; tu Hcp Index se recalculó con datos oficiales."

## Alternativa más ligera (si prefieres mínimo impacto)

Solo Paso 1 + Paso 2, **sin backfill**. El índice se corrige naturalmente cuando cada usuario cierre su próxima ronda. Más simple, con la desventaja de que durante días el índice mostrado usa datos viejos hasta que la fórmula lo refresque.

## Recomendación final

Ejecutar **Pasos 1, 2 y 3** en la misma sesión. Es una corrección de un dato base incorrecto desde el inicio; la fórmula USGA está pensada precisamente para ajustarse a los ratings correctos. No hay riesgo a scores, apuestas, balances ni snapshots históricos.

## Pregunta

¿Procedo con la ruta recomendada (1+2+3), o prefieres la alternativa ligera (1+2) y dejar que el índice se acomode solo?

&nbsp;

Haz los pasos 1,2 y3 ... no mandemos ningun email, hoy todavía NO usan este handicap index de manera oficial los usuarios, siguen con su Ghin o el sliding que ignora esto, así que evitamos ruido de esta actualización 