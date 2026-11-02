# El cruce como un rival más en la fila de jugadores

## Qué cambia para el usuario

1. **Nuevo jugador en la fila de rivales:** en "Balance vs" (la cuadrícula de jugadores del tablero), el amigo con quien cruzas aparece como un jugador más, con su balance debajo y una etiqueta pequeña **"CRUCE"** encima para distinguirlo.
2. **Un toque abre todo el detalle:** igual que con cualquier rival, se despliega el detalle de cada apuesta (Medal Front/Back/Total, Presiones, Oyeses, Skins, etc.), y al tocar cada apuesta se ve hoyo por hoyo. Es la misma pantalla que ya usas, así que se ve igual que en el resto de la ronda.
3. **La configuración del cruce va dentro de ese detalle:** golpes entre ustedes, importes de cada apuesta, prender/apagar apuestas y "Quitar cruce" quedan arriba del detalle, en un bloque compacto que empieza cerrado.
4. **La tarjeta "Apuestas de Cruce" de abajo se simplifica:** se quita la lista de apuestas y su configuración. Queda solo como resumen: nombre del amigo, total del cruce, y "Esperando respuesta" si la invitación está pendiente. Tocar el resumen abre el mismo avatar de arriba.
5. **Separación intacta:** el amigo cruzado sigue fuera de la matriz de apuestas, de la tarjeta, de los resultados de la ronda y de los demás grupos. Solo aparece en la fila de rivales de los dos jugadores del cruce.
6. **Sin doble conteo:** el balance del cruce no se suma a la "Tabla General" de la ronda. Al cerrar la ronda se registra una sola vez, con la etiqueta "Cruce", como ya se hace hoy.

## Qué hay que confirmar

- La pantalla de detalle de un rival hoy lee las apuestas de la ronda. Para el cruce va a leer la configuración propia del cruce y las tarjetas de los dos jugadores, así que los números deben coincidir con el total que hoy calcula el cruce. Lo voy a probar con una ronda de prueba que borraré al final, sin mandar mensajes.

## Detalles técnicos

- `BetDashboard.tsx`: en la cuadrícula de rivales, agregar entradas sintéticas por cada cruce aceptado en el que participa el jugador base (`myCrossBets`), con un badge "CRUCE"/"CROSS" y balance de `crossNet(computeCrossBet(...))`. Seleccionarlo usa el mismo estado `selectedRival` con un id con prefijo `cross:`.
- Al seleccionarlo, renderizar `BilateralDetail` alimentado por la ronda virtual de 2 jugadores que ya arma `crossBets.ts` (players, scores, `BetConfig` derivada del cruce, `bilateralHandicaps` con los golpes acordados), para mostrar el mismo desglose por apuesta y hoyo. Encima, el bloque de configuración que hoy vive en la tarjeta (golpes, importes por segmento, quitar cruce), plegado por defecto.
- Excluir los ids `cross:` de `bilateralBalanceMap`, de la Tabla General y de los totales del grupo.
- Reducir la tarjeta inferior de "Apuestas de Cruce" a una fila de resumen que hace scroll y selecciona el avatar.
- Traducciones ES/EN para "CRUCE", el resumen y "Esperando respuesta".
- Mantener las pruebas de `crossBets` y agregar una que confirme que el total del avatar es igual al resultado de `computeCrossBet`.
