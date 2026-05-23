
## Objetivo

Tres mejoras sobre la nueva variante Multi-día (y leaderboards en general):

1. **Edición de configuración** del leaderboard (no solo el nombre).
2. **UX claro de "día actual"** en el detalle Multi-día.
3. **Claridad al vincular una ronda** a qué día del torneo se está uniendo.

Sólo cambia el creador del leaderboard puede editar config. Participantes siguen viendo todo en read-only.

---

## 1. Editar configuración del leaderboard

Hoy el dropdown de ajustes del `LeaderboardDetailInline` y del `MultiDayLeaderboardDetail` solo permite renombrar / cerrar / eliminar. Se agrega una opción **"Editar configuración"** (solo visible si `event.created_by === profile.id`).

### Standard (`LeaderboardDetailInline`)
Diálogo con campos editables:
- Nombre
- Descripción
- Fecha (`start_date`)
- Modalidades (gross / net / stableford) — checkboxes

### Multi-día (`MultiDayLeaderboardDetail`)
Diálogo con campos editables:
- Nombre, Descripción
- Modalidades
- **Días del torneo**: lista de `{ date, label }` editable (agregar / quitar día). Mínimo 2.
- **Agregación**: `sum` o `best_n` (con N)
- Al guardar, recalcular `day_number` por orden cronológico, persistir en `rules_json` y actualizar `start_date`/`end_date`.

Guardas:
- No permitir borrar un día si ya hay una ronda vinculada cuya fecha cae en ese día. Mostrar warning con la lista de rondas afectadas y bloquear el borrado de ese día (el resto se puede editar).
- Cambiar fechas que ya tienen rondas vinculadas muestra un aviso pero se permite (el mapeo se recalcula por `rounds.date` → `day_number`).

### Implementación
- Nuevo componente `EditLeaderboardConfigDialog` (variante standard) y `EditMultiDayConfigDialog`. Actualizan vía `supabase.from('leaderboard_events').update({...})` filtrando por `id`. RLS ya permite a `created_by` updatear.
- Después de guardar: `fetchDetail()` / `fetchAll()` y `queryClient.invalidateQueries(['leaderboard_events'])`.

---

## 2. UX "día actual" en Multi-día

En `MultiDayLeaderboardDetail`:

- **Default tab**: en lugar de `'all'`, abrir en el día cuyo `date` === hoy (`YYYY-MM-DD` local). Si hoy no coincide con ningún día, abrir en el primer día sin completar; si todos completados, abrir en `'all'`.
- **Etiqueta visual "Hoy"**: al `TabsTrigger` del día con `date === today` agregar un punto/badge (`bg-primary`) y texto "Día N · Hoy".
- **Header del card**: bajo el título mostrar una línea pill destacada: `"Jugando: Día N — <fecha> [Hoy]"` cuando aplique. Si el torneo no está en curso hoy, mostrar `"Próximo: Día N — <fecha>"` o `"Finalizado"`.
- **Tab "Acumulado"** mantiene su lugar (último) y mantiene estilo `font-semibold` actual.

---

## 3. Claridad al vincular ronda en Multi-día

En `LinkRoundToLeaderboardDialog`:

- Al listar leaderboards activos, los multi-día muestran badge `Multi-día · N días`.
- Cuando el `selectedEvent.competition_type === 'multi_day'`:
  - Cargar `rules_json.days` y la fecha de la ronda activa (`rounds.date` del `roundId`).
  - Mostrar **arriba del listado de jugadores** un bloque informativo:
    - Si la fecha de la ronda coincide con algún `day.date`: card verde "Se vinculará al **Día N — `<fecha>` (`label`)** del torneo «`<nombre>`»".
    - Si NO coincide con ningún día del torneo: card ámbar "⚠ La fecha de esta ronda (`<fecha>`) no coincide con ningún día del torneo. Edita la configuración del leaderboard o la fecha de la ronda antes de vincular." → botón de "Vincular" deshabilitado.
- Igual señal contextual al `MultiDayLeaderboardDetail` cuando se invoca el flujo desde ahí (mismo dialog, lógica unificada).

No se cambian estructuras de datos: el día se sigue derivando de `rounds.date` ↔ `rules.days[].date` (como ya hace `MultiDayLeaderboardDetail`).

---

## Archivos a tocar

- `src/components/leaderboards/LeaderboardDetailInline.tsx` — añadir opción "Editar configuración" en el menú.
- `src/components/leaderboards/MultiDayLeaderboardDetail.tsx` — menú de ajustes (hoy no existe), default tab = hoy, badge "Hoy", header "Jugando Día N".
- Nuevos: `src/components/leaderboards/EditLeaderboardConfigDialog.tsx`, `src/components/leaderboards/EditMultiDayConfigDialog.tsx`.
- `src/components/leaderboards/LinkRoundToLeaderboardDialog.tsx` — bloque informativo multi-día + guardas de vinculación.

Sin migraciones de DB. Sin cambios a `useLeaderboards` salvo (opcional) un `updateEvent` helper.

---

## Fuera de alcance

- Teams Cup edición (ya tiene su propio `CupSettingsDialog`).
- Cambiar el modelo de datos (sigue mapeo por fecha).
- Editar handicaps de participantes (ya existe en flujo aparte).
