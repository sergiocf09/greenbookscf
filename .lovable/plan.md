
## Contexto

Hay un bug raíz y varios ajustes UX en la experiencia de leaderboards multi-día. La causa principal de "no aparece día ni Acumulado, no abre el editor multi-día, muestra Neto cuando elegí Gross" es que cuando se abre el detalle inline desde la app de la ronda, `src/pages/Index.tsx` **fuerza** `competition_type` a `'standard'` (línea 481 y 2435), por lo que renderiza `LeaderboardDetailInline` (estándar) en vez de `MultiDayLeaderboardDetail`. Por eso ves el editor "estándar" sin días, el tab de Acumulado no aparece y el sortMode default es `'net'` aunque la competencia esté en Gross.

## Cambios

### 1. Render correcto del multi-día inline (causa raíz)
**`src/pages/Index.tsx`**
- Línea ~481: resolver los tres tipos:
  ```ts
  const ct = (data as any).competition_type;
  const resolved = ct === 'teams_cup' ? 'teams_cup' : ct === 'multi_day' ? 'multi_day' : 'standard';
  ```
- Línea ~2435 (banner amber de leaderboards vinculados): mapear igualmente `multi_day` → `'multi_day'`.

Con esto el editor de configuración multi-día (con todos los días) ya aparece automáticamente al pulsar "Editar configuración", y se muestran los tabs por día + Acumulado.

### 2. Default de modo (Gross/Neto/Stableford) según `scoring_modes`
**`src/components/leaderboards/MultiDayLeaderboardDetail.tsx`** y **`src/components/leaderboards/LeaderboardDetailInline.tsx`**
- Inicializar `sortMode` no a `'net'` hardcoded, sino:
  ```ts
  const initial = (event?.scoring_modes?.[0] as SortMode) ?? 'net';
  ```
- En multi-día, usar un `useEffect` que setea `sortMode` cuando carga `event` si el actual no está dentro de `availableModes`. Mismo patrón en estándar (cuando se carga event).
- Resultado: si la competencia es solo Gross, la tabla y el header (`Score`) aparecen con Gross por default.

### 3. Vinculación de ronda sin candado de fecha
**`src/components/leaderboards/LinkRoundToLeaderboardDialog.tsx`**
- Quitar el bloqueo `blockMd` que desactiva "Vincular" cuando la fecha no coincide.
- Para multi-día: mostrar **lista de días** como `RadioGroup` (Día 1 — fecha · etiqueta, Día 2 …). Pre-seleccionar el que coincide con `roundDate`; si no coincide ninguno, no preseleccionar y resaltar aviso.
- Si la fecha de la ronda no coincide con el día elegido, mostrar banner ámbar:
  > "La fecha de tu ronda (DD/MM/YYYY) no coincide con la del Día N (DD/MM/YYYY). Confirma que es correcto."
  con `Checkbox` "Entiendo y confirmo vincular esta ronda al Día N" — el botón "Vincular" queda deshabilitado hasta que se marca.
- Si coincide, se vincula directo (sin checkbox).
- Persistencia: la lógica actual ya usa `rounds.date` para mapear al día en `MultiDayLeaderboardDetail` (`dayByDate[date]`). Como queremos permitir asignar la ronda a un día con fecha distinta, hay que **fijar la fecha de la ronda a la del día seleccionado** al confirmar la vinculación (UPDATE `rounds.date` = día elegido), o alternativamente persistir el `day_number` en `leaderboard_rounds`. Tomaremos la opción más simple y consistente con el motor actual: **actualizar `rounds.date`** al día seleccionado solo si el usuario confirmó la vinculación con fecha distinta. Esto evita tocar el schema y mantiene el cálculo intacto.

### 4. Tab "Acumulado" siempre visible y ordenado
**`MultiDayLeaderboardDetail.tsx`**
- Reorganizar el `TabsList` para que el tab **"Acumulado" sea sticky a la izquierda** y los tabs de días scrolleen horizontalmente a la derecha:
  - Cambiar `flex-wrap` por `overflow-x-auto whitespace-nowrap`.
  - Envolver el botón "Acumulado" en un contenedor `sticky left-0 bg-background z-10 border-r` para que se mantenga visible al hacer scroll horizontal.
- La tabla de "Acumulado" debe **mostrar columnas por día**: `# | Jugador | Hcp | D1 | D2 | … | Total/Mejores N`. La columna del total queda como **primera columna fija (sticky)** después del nombre y los días scrollean si no caben.
  - Implementación: dos tablas en un wrapper flex (izquierda fija: #, Jugador, Total) + derecha (overflow-x-auto: D1..Dn) sincronizadas por filas con la misma altura `h-10`.
- Orden: por la columna **Total** (acumulado) descendente para Stableford, ascendente para Gross/Net vs par (ya está implementado en `computeAccumulatedStandings`, solo agregar columnas de días).

### 5. Quitar checkbox redundante mencionado por el usuario
El usuario dijo "esto lo vamos a eliminar" sobre la variante extra de gross/net en multi-día. **No agregamos nada nuevo** ahí — `EditMultiDayConfigDialog` ya permite seleccionar las 3 modalidades; se queda como está.

## Archivos a tocar

- `src/pages/Index.tsx` (2 líneas en resolución de tipo)
- `src/components/leaderboards/MultiDayLeaderboardDetail.tsx` (default sortMode, layout de tabs sticky, tabla acumulado por días)
- `src/components/leaderboards/LeaderboardDetailInline.tsx` (default sortMode)
- `src/components/leaderboards/LinkRoundToLeaderboardDialog.tsx` (selector de día + confirm checkbox + UPDATE rounds.date)

## Fuera de alcance

- No se cambia schema (`leaderboard_rounds` queda igual).
- No se toca Teams Cup.
- No se toca el motor de cálculo: el mapeo día↔fecha sigue por `rounds.date`.
