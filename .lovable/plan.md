
# Plan: Habilitar Re-cierre de Ronda Completada

## Problema
La ronda del 14 de enero ya tiene status `completed` en la base de datos. El flujo de cierre actual detecta esto y retorna `already_closed`, impidiendo volver a cerrar con los fixes de overrides aplicados.

## Solucion (3 cambios)

### 1. Nueva funcion SQL: `reset_round_for_reclose`
Crear una migracion con una funcion RPC que:
- Valida que el usuario es el organizador
- Cambia el status de la ronda de `completed` a `in_progress`
- Elimina el snapshot existente (`round_snapshots`)
- Elimina las transacciones del ledger (`ledger_transactions`)
- Elimina el historial de sliding de esa ronda (`sliding_history`)
- Limpia los `round_close_attempts` de esa ronda
- Solo funciona si la ronda esta en status `completed`

### 2. Frontend: Agregar boton "Re-cerrar Ronda" en Index.tsx
Cuando la ronda tiene status `completed` y el usuario es el organizador:
- Mostrar un boton que llame a `reset_round_for_reclose`
- Al completar, actualizar el estado local a `in_progress`
- El usuario puede entonces presionar "Cerrar Ronda" normalmente con los fixes aplicados

### 3. Hook: Agregar `resetRoundForReclose` en useRoundManagement.ts
- Nueva funcion que llama al RPC
- Resetea el estado local (`roundState.status = 'in_progress'`)
- Muestra toast de confirmacion

## Secuencia de uso
1. El organizador ve que la ronda esta cerrada con datos incorrectos
2. Presiona "Re-abrir para re-cerrar"
3. Confirma la accion (dialogo de seguridad)
4. La ronda vuelve a `in_progress`
5. Presiona "Cerrar Ronda" normalmente
6. El nuevo snapshot se genera con los overrides corregidos

## Detalles tecnicos

**Migracion SQL:**
```sql
CREATE OR REPLACE FUNCTION public.reset_round_for_reclose(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only organizer
  IF NOT public.is_round_organizer(p_round_id) THEN
    RAISE EXCEPTION 'Only organizer can reset round';
  END IF;
  -- Only completed rounds
  IF (SELECT status FROM rounds WHERE id = p_round_id) != 'completed' THEN
    RAISE EXCEPTION 'Round is not completed';
  END IF;
  -- Clean up
  DELETE FROM round_snapshots WHERE round_id = p_round_id;
  DELETE FROM ledger_transactions WHERE round_id = p_round_id;
  DELETE FROM sliding_history WHERE round_id = p_round_id;
  DELETE FROM round_close_attempts WHERE round_id = p_round_id;
  -- Reset status
  UPDATE rounds SET status = 'in_progress' WHERE id = p_round_id;
END;
$$;
```

**useRoundManagement.ts:** Nueva funcion `resetRoundForReclose` que llama al RPC y resetea estado local.

**Index.tsx:** Boton condicional cuando `roundState.status === 'completed'` y el usuario es organizador, con dialogo de confirmacion antes de ejecutar.
