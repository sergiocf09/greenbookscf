# Cierre de ronda con cruces: contabilidad separada

## Qué pasó
El cierre de tu ronda de hoy falló en el último paso ("from_profile_id is not a participant in this round"). Al cerrar, la app mezcla los importes del cruce con los de la ronda y los manda juntos al registro final. El amigo cruzado no es jugador de tu ronda, así que el registro rechaza todo el cierre, no solo el cruce.

## Recomendación: opción simple (registro aparte del cruce)
Sumar el cruce al resultado de la ronda obligaría a mezclar dos tarjetas y descuadraría el resultado frente a los demás jugadores. La solución más limpia es esta:

1. **El cierre de la ronda ignora el cruce.** Resultados, foto de la ronda e historial quedan solo con los jugadores reales. Así no hay rondas duplicadas ni otra tarjeta en tu historial.
2. **El cruce se liquida en su propio registro económico,** con la fecha de ese día: quién paga a quién y por cuánto, desglosado por apuesta y marcado "Cruce".
3. **Se cuenta una sola vez:** se liquida cuando cierra la segunda de las dos rondas (así ya están las dos tarjetas completas). Si se reabre y se vuelve a cerrar, se recalcula y se reemplaza, nunca se suma dos veces.
4. **Dónde se ve:** en el balance contra ese rival, en el historial de rivales y en tu balance total del día, con la etiqueta "Cruce". No cambia el resultado de los demás jugadores.
5. **Si falla el cruce, la ronda cierra igual** y aparece un aviso de que el cruce queda pendiente de liquidar.

Después de publicar, podrás volver a cerrar tu ronda de hoy normalmente.

## Detalles técnicos
- `useRoundManagement.ts`: quitar los registros "Cruce" del arreglo que va a `finalize_round_bets` (causa del P0001) y de la foto de la ronda.
- Nueva función de backend `settle_cross_bet(cross_bet_id, lines jsonb)` SECURITY DEFINER: valida que quien llama sea uno de los dos jugadores, que ambas rondas estén cerradas, borra la liquidación previa de ese cruce y escribe los movimientos de libro con `round_id` de la ronda de origen y `segment = 'cross:<id>'`, saltando la validación de participante solo en esa ruta.
- Llamarla al terminar el cierre de cualquiera de las dos rondas (no hace nada si la otra sigue abierta); también al reabrir, borrar la liquidación de ese cruce.
- Los balances por rival y el historial ya leen los movimientos de libro; verificar que los marcados `cross:` se sumen una vez y no se mezclen en los resultados de la ronda.
- Prueba: cerrar ronda con cruce activo no falla y el cruce aparece una sola vez en el balance.
