# Co-administradores: salir de una ronda abierta sin poder cerrarla

## Cómo funciona hoy
- Solo el organizador puede cerrar la tarjeta y reabrirla (el botón "Re-abrir" solo aparece al organizador y el servidor también lo valida contra el organizador).
- Cuando un co-administrador o participante entra a la app con una ronda abierta, aparece "Tarjeta pendiente" con "Restaurar" y "Ocultar de mi vista".
- Problemas:
  1. "Ocultar" solo existe en ese aviso. Si el usuario ya está dentro de la ronda (Resultados), solo ve "Solo el organizador puede cerrar la tarjeta" y no tiene forma de salir: la ronda se le vuelve a abrir cada vez.
  2. Ocultar se guarda solo en ese teléfono; en otro dispositivo o tras borrar datos, reaparece.
  3. Si la ronda queda reabierta y el organizador no la cierra, el co-admin queda "atrapado" indefinidamente.

## Secuencia propuesta
"Salir" significa: dejar de tener la ronda abierta/restaurada en pantalla. NO la oculta: sigue visible como pendiente hasta que el organizador la cierre (transparencia).

```text
Co-admin / participante con ronda abierta
  -> Resultados: botón "Salir de esta ronda" (debajo de "Solo el organizador puede cerrar")
  -> Confirmación: "La ronda seguirá abierta y en manos de <Organizador>. Tus scores se conservan."
  -> Vuelve a la pantalla de inicio limpia; la app ya no la restaura sola al entrar (en ningún dispositivo)
  -> La ronda sigue en "Rondas pendientes" (menú/aviso) con etiqueta "Abierta por <Organizador>"
     y botón "Ver / Restaurar" por si quiere volver a entrar
  -> Si el organizador la REABRE: se le notifica ("<Organizador> reabrió la ronda en <Campo>")
     y vuelve a aparecer en pendientes; tampoco se restaura sola
  -> Cuando el organizador cierra: sale de pendientes y llegan resultados/historial normalmente
```
- Se elimina la opción actual "Ocultar de mi vista" (que la desaparecía por completo); se reemplaza por "Salir" con el comportamiento anterior.
- El organizador sigue con control total (cerrar, reabrir, eliminar). Salir no lo quita de la ronda ni cambia apuestas, scores o balances.
- Para el organizador no aparece "Salir".

## Detalles técnicos
- Nueva tabla `round_exited_by_profile (profile_id, round_id, exited_at)` con GRANT + RLS (solo el propio perfil lee/inserta/borra).
- `useRoundManagement`: la auto-restauración ignora rondas con salida registrada; la lista de pendientes las sigue mostrando (marcadas "Saliste").
- Al reabrir (`reset_round_for_reclose`) se borran las salidas de esa ronda y se dispara aviso a participantes (toast en tiempo real y aparece en pendientes).
- Restaurar manualmente borra su fila de salida.
- Nuevo botón y confirmación en `PlayViews` (rama no-organizador); textos en `phrases.en.json`.
