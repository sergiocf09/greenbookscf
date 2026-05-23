## Cambios solicitados al header del leaderboard multi-día

Archivo: `src/components/leaderboards/MultiDayLeaderboardDetail.tsx` (+ wiring en `src/pages/Index.tsx`).

### 1. Barra superior compacta (renglón de iconos)

- Eliminar el `GreenBookLogo` de la izquierda (no tiene función ahí).
- Eliminar el botón de actualizar (`RefreshCw`) — ya existe en el header principal.
- Centrar los iconos restantes en la pantalla con un poco más de separación entre ellos (`justify-center gap-2`).
- Orden final de izquierda a derecha:
  1. **Vincular / Desvincular** ronda (nuevo, sólo si hay ronda activa)
  2. **Compartir** (`Share2`)
  3. **Chip del código** (`Hash` + código)
  4. **Settings** (dropdown, sólo creador)

### 2. Botón Vincular / Desvincular (nuevo)

Añadir a `Props` de `MultiDayLeaderboardDetail` los mismos cuatro props que ya usa `LeaderboardDetailInline`:

```ts
hasActiveRound?: boolean;
isRoundLinked?: boolean;
onLinkRound?: () => void;
onUnlinkRound?: () => void;
```

- Si `hasActiveRound && !isRoundLinked` → mostrar icono `Link` (link2) que dispara `onLinkRound`.
- Si `hasActiveRound && isRoundLinked` → mostrar icono `Link2Off` (en `text-destructive`) que dispara `onUnlinkRound`.
- En ambos casos se reutiliza el flujo existente: `LinkRoundToLeaderboardDialog` ya soporta multi-día con selector de día (`selectedDayNumber`), y el `onUnlinkRound` de `Index.tsx` ya muestra el mensaje y limpia scores/participantes.

### 3. Wiring en `src/pages/Index.tsx`

En el bloque `leaderboardDetailType === 'multi_day'` (líneas 2572-2576), pasar los mismos cuatro props que ya se pasan a `LeaderboardDetailInline` (líneas 2582-2588 y el `onUnlinkRound` siguiente). Reutilizar la misma lambda — no se duplica lógica.

### 4. Lo que NO cambia

- Bloque "tournament title" (Trophy + nombre + badges Multi-día/Gross-Neto/Jugadores) se mantiene como está.
- Tabs de Acumulado / Día N, persistencia en localStorage, tablas de standings: sin cambios., es decir ,    que esa vista se mantengas si se sale del leadervoard a otra pestaña y cuando se regrese que esté en esa vista.
- Dropdown del `Settings` mantiene "Gestionar rondas vinculadas" (acceso completo a desvincular cualquier día histórico).

### Resultado visual del renglón superior

```text
[ Link/Unlink ]   [ Share ]   [ #ABCD ]   [ Settings ]
                   centrados
```

Altura mínima (`py-0.5`, botones `h-7`), separación ligeramente mayor (`gap-2`).