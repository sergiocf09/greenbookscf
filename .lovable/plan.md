## Objetivo

Que el cron sea quien efectivamente cierre las rondas abandonadas a las ~72h, sin depender de que un participante entre al app. Comportamiento según tu respuesta:

- **Ronda con los 18 hoyos confirmados por todos** → cierre completo equivalente al que hoy ejecuta el organizador (snapshot, sliding, histórico, handicap, ledger, apuestas liquidadas).
- **Ronda con hoyos sin confirmar** → cierre como `is_incomplete = true`, sin snapshot ni ajustes financieros. Queda visible en el histórico con badge "Incompleta" para que organizador o co-admin la reabran y completen si desean.

No se cambia frontend salvo eliminar el listener del cliente que ya no es necesario.

## Diseño

### 1. Nueva función edge `auto-close-abandoned-rounds`
Invocada por `pg_cron` una vez al día. No requiere JWT. Usa `service_role`.

Flujo por cada ronda con `auto_close_pending = true` y `status = 'in_progress'`:

```text
1. Recalcular all_players_complete leyendo hole_scores confirmados
   vs total de hoyos configurados por jugador.
2. Si all_players_complete = true:
     a. Reconstruir handicaps de ronda si falta algo (usar helpers existentes).
     b. UPDATE rounds SET status='completed', closed_at=now(),
        auto_closed=true, auto_close_pending=false.
        → El trigger trg_fn_auto_ledger_on_close genera el ledger.
     c. Ejecutar en orden:
        - rebuild_snapshot_balances_from_ledger(round_id)
        - rebuild_snapshot_bilateral_handicaps(round_id)
        - rebuild_round_financials_from_snapshot(round_id)
        - rebuild_sliding_history_from_snapshot(round_id)
     d. Marcar is_incomplete=false.
   Si all_players_complete = false:
     a. Llamar close_round_as_incomplete(round_id) (ya existente).
3. Log del resultado por ronda (éxito / error) para poder auditar.
```

### 2. Migración SQL

- Añadir columna `rounds.auto_closed boolean NOT NULL DEFAULT false` para diferenciar cierres del cron vs cierres manuales (útil para soporte y para no repetir email en `mark_auto_close_pending`).
- Nueva función `public.server_close_round_complete(p_round_id uuid)` (SECURITY DEFINER) que encapsula los pasos 2b–2d arriba, de modo que la edge function llame a un único RPC atómico por ronda completa.
- Programar `pg_cron` para invocar la edge function `auto-close-abandoned-rounds` diariamente a las 09:15 UTC (15 min después del cron actual `mark_auto_close_pending` a las 09:00 UTC, para que las marcaciones ya estén hechas).
- Endurecer `mark_auto_close_pending`: solo marcar rondas cuya última actividad (`updated_at` o último `hole_scores.updated_at`) sea ≥ 72h atrás; mantiene el email actual al organizador.

### 3. Frontend (mínimo)

- Eliminar `useAutoClose` de `src/pages/Index.tsx` y el listener `greenbook:auto-close-round` (ya no dependemos del cliente).
- Borrar `src/hooks/useAutoClose.ts`.
- El badge "Incompleta" y el permiso de reopen para co-admins ya están implementados y se mantienen.

### 4. Consideraciones

- **Reversibilidad:** organizador y co-admin siguen pudiendo reabrir con `reset_round_for_reclose`, tanto para rondas cerradas completas como incompletas por el cron.
- **Idempotencia:** la edge function ignora rondas que ya no están `in_progress` o no tienen `auto_close_pending=true`.
- **Errores:** si el rebuild de snapshot falla en una ronda, se registra el error y se continúa con las demás; la ronda queda en `in_progress` con `auto_close_pending=true` para reintentarse al día siguiente.
- **Email:** se mantiene únicamente el email actual al marcar `auto_close_pending` (según tu respuesta). No se envía email adicional al ejecutar el cierre.

## Detalles técnicos

Archivos a crear/modificar:

- `supabase/migrations/<timestamp>_auto_close_execution.sql`
  - `ALTER TABLE rounds ADD COLUMN auto_closed boolean NOT NULL DEFAULT false`
  - `CREATE OR REPLACE FUNCTION public.server_close_round_complete(uuid)` (SECURITY DEFINER, search_path=public), que hace UPDATE status+ejecuta los 4 rebuilds en transacción.
  - `GRANT EXECUTE ... TO service_role`.
  - Reprogramar `mark_auto_close_pending` con filtro de última actividad ≥ 72h.
  - `cron.schedule('auto-close-execute', '15 9 * * *', ...)` con `net.http_post` a la edge function usando el anon key.
- `supabase/functions/auto-close-abandoned-rounds/index.ts` — nueva edge function con la lógica del flujo (consulta pendientes, recalcula completitud, llama a `server_close_round_complete` o `close_round_as_incomplete`).
- `src/pages/Index.tsx` — quitar import y uso de `useAutoClose` y el listener del evento.
- `src/hooks/useAutoClose.ts` — eliminar archivo.

Riesgos conocidos:

- Los rebuilds SQL existentes cubren snapshot/sliding/handicap/ledger, pero **no** ejecutan la generación de imagen de compartir ni notificaciones push que hoy hace el cliente al cerrar. El cierre del cron será silencioso; los participantes lo verán la próxima vez que abran el histórico. Esto es aceptable dado el objetivo (evitar rondas abiertas por semanas).
- La lógica de "todos con 18 hoyos confirmados" debe respetar el número de hoyos configurado por jugador en `round_players` (algunos pueden jugar 9). Se usa `round_players.holes_playing` (o equivalente) para el conteo esperado.