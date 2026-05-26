# Arreglar acceso a Teams Cup + limpieza de copas de prueba

## Diagnóstico

El error "Error inesperado" al entrar a cualquier Teams Cup existente lo causa el nuevo `AddCupParticipantsDialog`. En la línea 97 hay un `useEffect` que corre al montar el componente:

```ts
setGuestInitials(initialsFromPlayerName(guestName).slice(0, 3) || '');
```

`guestName` arranca vacío. `initialsFromPlayerName('')` **lanza** `Error: "Escribe un nombre"` (validación con Zod `.min(1)` en `src/lib/playerInput.ts`). Como el throw ocurre dentro de un effect de un componente que está montado dentro de `TeamsCupDetailInline`, lo atrapa el `ErrorBoundary` de ruta y muestra la pantalla de "Error inesperado / Reintentar". Por eso ya no se puede abrir ninguna copa existente.

Nota: el diálogo se monta (no solo cuando se abre) porque `TeamsCupDetailInline` lo incluye sin guardia de `open`, así que el effect corre incluso sin que el usuario haga nada.

## Cambios

### 1. Arreglar el crash (raíz del problema)

En `src/components/leaderboards/AddCupParticipantsDialog.tsx`, hacer el cálculo de iniciales seguro:

```ts
useEffect(() => {
  if (!guestInitialsTouched) {
    const trimmed = guestName.trim();
    if (!trimmed) { setGuestInitials(''); return; }
    try {
      setGuestInitials(initialsFromPlayerName(trimmed).slice(0, 3));
    } catch {
      setGuestInitials('');
    }
  }
}, [guestName, guestInitialsTouched]);
```

Esto resuelve el acceso a las copas existentes y también previene que el mismo error reaparezca al borrar el nombre del invitado.

### 2. Montaje condicional del diálogo (defensa en profundidad)

En `TeamsCupDetailInline.tsx`, renderizar `<AddCupParticipantsDialog ... />` solo cuando `showAddParticipants === true`, para que su effect no corra en segundo plano cada vez que se abre la copa.

### 3. Borrar las 2 Teams Cup de prueba

Según la base hay exactamente dos competencias `competition_type = 'teams_cup'`:

- `Ryder Juriquilla: El Duelo` (id `141325ec-…`, 2026-04-16)
- `PRUEBA` (id `ae5e4b56-…`, 2026-04-17)

Migración que borra en cascada lo asociado y luego el evento:

```sql
DELETE FROM cup_matches WHERE leaderboard_id IN ('141325ec-b74b-482f-ac6f-98318708929c','ae5e4b56-fb96-43ce-9166-2d7eb6a15b20');
DELETE FROM cup_teams   WHERE leaderboard_id IN (...);
DELETE FROM leaderboard_participants WHERE leaderboard_id IN (...);
DELETE FROM leaderboard_rounds       WHERE leaderboard_id IN (...);
DELETE FROM leaderboard_events       WHERE id IN (...);
```

(Si alguna FK ya tiene `ON DELETE CASCADE`, el borrado se simplifica; igual hacemos las sentencias explícitas para ir seguro.)

## Lo que NO cambia

- Lógica del motor de matches, RLS, esquema.
- Flujo de creación nuevo (3 pasos) ni `AddCupParticipantsDialog` en sí — solo su effect de iniciales.
- Otras competencias (multi-día, individuales) no se tocan.

## Archivos afectados

- `src/components/leaderboards/AddCupParticipantsDialog.tsx` — guard del effect.
- `src/components/leaderboards/TeamsCupDetailInline.tsx` — montaje condicional.
- Migración SQL — borrar las 2 copas de prueba.

## Confirma antes de ejecutar

¿Borro las dos copas listadas (`Ryder Juriquilla: El Duelo` y `PRUEBA`) junto con sus equipos/matches/participantes? Si quieres conservar alguna, dímelo y solo aplico los cambios de código. ... Elimina para no crear códigos adicional para soli estos  casos de prueba 