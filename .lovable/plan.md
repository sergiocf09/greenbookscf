## Objetivo

Compactar la cabecera del leaderboard Multi-día para que los resultados ocupen la mayor parte de la pantalla, arreglar el botón de configuración, agregar desambiguación de avatares y habilitar la edición desde la lista de leaderboards.

## Cambios

### 1) Compactar `MultiDayLeaderboardDetail.tsx`

Reducir la información superior a 2 renglones máximo antes de la tabla.

**Header (barra superior)** — sin cambios estructurales, pero juntar acciones:

- Mantener `Back`, logo, `Refresh`, `Share`, `Settings` (dropdown) en una sola línea con `size="icon"` actuales. Ya está OK; el ahorro viene en lo siguiente.

**Tarjeta de info del torneo** (líneas 616–650) — colapsar a una sola tarjeta compacta:

- Una sola fila: `Trophy` + nombre del torneo (text-base, font-bold) + badge "Multi-día" + (a la derecha) chip código `#XXX` clickeable.
- Segunda fila micro (text-[11px] text-muted-foreground): `N jugadores · N días · Agregación: Suma/Mejores X` y un mini-chip del día actual: `Hoy · Día N` (si aplica). Eliminar la descripción salvo que exista (y mostrarla en text-[11px] truncada a 1 línea).
- Quitar el banner separado "Jugando hoy: Día N" (líneas 669–683) — esa info ya queda integrada arriba.
- Reducir `CardHeader` paddings: `py-2 px-3`, eliminar `CardContent` separado (todo dentro de una sola `div` flex).

**Segunda tarjeta (tabs)** (líneas 652–727):

- Quitar el wrapper `Card` exterior; renderizar directo (`<div>` con borde superior sutil) para eliminar `px-0 pb-2 pt-3`.
- Pegar los tabs de modalidad (Gross/Neto/Stb) en línea con los tabs de días cuando solo hay un modo activo; cuando hay varios, mantenerlos arriba pero con `h-7` y `mb-1`.
- Reducir gaps verticales: `space-y-4` del wrapper → `space-y-2`, padding del wrapper `p-4` → `px-3 py-2`.

Resultado: header + info + tabs deben caber en ~150px en lugar de ~280px, dejando la tabla visible desde el primer scroll.

### 2) Botón Settings que no responde ( quizá había quedado en un loop, ya pude usarlo y que se desplieguen las opciones). ..

### 3) Desambiguación de avatares e iniciales

En `MultiDayLeaderboardDetail.tsx`:

- Importar `disambiguateInitials` de `@/lib/playerInput`.
- Calcular `const initialsMap = useMemo(() => disambiguateInitials(participants.map(p => ({ id: p.id, name: p.display_name }))), [participants])`.
- Al renderizar `PlayerAvatar`, pasar `initials={initialsMap.get(part.id) ?? part.initials}` tanto en `renderStandingsTable` (línea ~422) como en `renderAccumulated` (línea ~503).

### 4) Botón de edición desde la lista de leaderboards

En `LeaderboardsInlineView.tsx`, en las cards de `activeEvents` (líneas 446–491) y `completedEvents` (505–530):

- Reemplazar el `Trophy` de la esquina superior derecha por un grupo: ícono `Trophy` + botón `Pencil` (size icon, h-7 w-7, `variant="ghost"`) visible solo si el usuario actual es el creador del evento.
- Click en el lápiz: `e.stopPropagation()` para no abrir el detalle, y abrir el dialog de edición correspondiente según `competition_type`:
  - `multi_day` → `EditMultiDayConfigDialog`
  - `standard` → `EditLeaderboardConfigDialog`
  - `teams_cup` → reusar `CupSettingsDialog` (si ya existe; si no, fuera de alcance — fallback: navegar al detalle).
- Estado local: `editTarget: { id, type, event } | null` para controlar qué dialog está abierto.
- Necesita `useAuth()` para `profile?.id` y comparar con `ev.created_by` (verificar que el hook `useLeaderboards` ya devuelva `created_by` — si no, agregarlo al select).

&nbsp;

&nbsp;

Falta habilitar la opción de desvincular se de la ronda... Y que al unirse a un leadeboard de multi día, se tenga la vista para elegir a qué día se estará uniendo de dicho leadervoard, que no se asuma en automático algún día, que sea selección manual en todo momento y de ahí los mebsajes que cirrwsponda. Para confirmación o advertencia al que se está uniendo ue se

## Fuera de alcance

- No tocar lógica de cálculo de standings.
- No tocar Teams Cup detail.
- No agregar nuevas migraciones.

## Archivos a modificar

- `src/components/leaderboards/MultiDayLeaderboardDetail.tsx`
- `src/components/leaderboards/LeaderboardsInlineView.tsx`
- (revisar) `src/hooks/useLeaderboards.ts` para asegurar que `created_by` esté en el `select`.