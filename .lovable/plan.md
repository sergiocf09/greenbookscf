# Co-administradores: salir de una ronda abierta sin poder cerrarla

## Cómo funciona hoy
- Solo el organizador puede cerrar la tarjeta y reabrirla (el botón "Re-abrir" solo aparece al organizador y el servidor también lo valida contra el organizador).
- Cuando un co-administrador o participante entra a la app con una ronda abierta, aparece "Tarjeta pendiente" con "Restaurar" y "Ocultar de mi vista".
- Problemas:
  1. "Ocultar" solo existe en ese aviso. Si el usuario ya está dentro de la ronda (Resultados), solo ve "Solo el organizador puede cerrar la tarjeta" y no tiene forma de salir: la ronda se le vuelve a abrir cada vez.
  2. Ocultar se guarda solo en ese teléfono; en otro dispositivo o tras borrar datos, reaparece.
  3. Si la ronda queda reabierta y el organizador no la cierra, el co-admin queda "atrapado" indefinidamente.

## Secuencia propuesta
```text
Co-admin / participante con ronda abierta
  -> Resultados: botón "Salir de esta ronda" (debajo de "Solo el organizador puede cerrar")
  -> Confirmación: "La ronda seguirá abierta y en manos de <Organizador>. Tus scores capturados se conservan."
  -> Se oculta en todos sus dispositivos, vuelve a pantalla de inicio limpia
  -> No vuelve a aparecer en "Tarjeta pendiente" ni se auto-restaura
  -> Cuando el organizador cierre: le llegan resultados/historial normalmente
  -> Si el organizador lo reabre de nuevo: no se le vuelve a imponer; puede volver a entrar por invitación/link si quiere
```
- El organizador sigue con control total (cerrar, reabrir, eliminar). Sus apuestas y balances no cambian: salir no elimina al jugador de la ronda ni sus scores.
- Para el organizador no aparece "Salir"; él sigue teniendo "Cerrar tarjeta" / "Eliminar".

## Detalles técnicos
- Nueva tabla `round_hidden_for_profile (profile_id, round_id, hidden_at)` con GRANT + RLS (solo el propio perfil lee/inserta/borra).
- `useRoundManagement`: al buscar rondas pendientes y al auto-restaurar, excluir las ocultas en el servidor (además del localStorage actual, que se migra al guardar).
- `handleHidePendingRoundLocally` pasa a insertar en la tabla; nuevo botón en `PlayViews` (rama no-organizador) que oculta y llama `onStartNewRound`.
- Si el usuario vuelve a unirse por link/código, se borra su fila de ocultos para esa ronda.
- Textos nuevos en `phrases.en.json` ("Leave this round", etc.).
