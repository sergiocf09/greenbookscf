&nbsp;

De lo que propones al final, ejecuta 1, 2 ... conservqndo a Gustavo en la tarjeta creada por Sergio

# Cierres de hoy en Malanquín: qué pasó y cómo evitarlo

## Lo que quedó guardado (datos reales)

**Tu ronda (Sergio, 7 jugadores, cerrada 15:27)**

- Grupo 1: Sergio 84, Edgar 111, Enrique 96. Son scores reales.
- Grupo 2: Gustavo De Echevarría 93 (real, son los mismos golpes que en la ronda de Luis). **Luis, Jorge Zerecero y Felipe León tienen 72 cada uno, exactamente el par hoyo por hoyo.** Nunca se borraron: la app los guardó y, al cerrar, les puso par en los hoyos que no tenían captura.
- Primer cierre (15:18): la app lo frenó por "Discrepancia UI vs Motor" (Jorge +$1,090, Luis −$260…), porque la pantalla ya no los mostraba pero el cálculo sí los contaba.
- Segundo cierre (15:27): pasó y guardó 70 movimientos de dinero. Esos movimientos incluyen apuestas **ficticias** contra jugadores con par, por ejemplo Gustavo → Jorge $450, Luis → Jorge $360, Felipe León → Jorge $300, Gustavo → Felipe $240. Tus balances con Edgar, Enrique y Gustavo sí salen de scores reales.

**Ronda de Luis González (4 jugadores, cerrada 15:27)**

- Es una **ronda aparte**, no tu segundo grupo. Se creó y se cerró en 4 segundos con "Importar tarjeta" (foto o captura de la tarjeta).
- Scores reales: Luis 88, Jorge 96, Felipe **Ocampo** 94 (es otra persona, no Felipe León) y Gustavo 93.
- **Sin apuestas: $0 de movimientos.** No hay ningún dinero cruzado contigo.
- Gustavo aparece en las dos rondas con la misma tarjeta, así que su ronda cuenta dos veces para su historial y su hándicap.

**Quién podía hacer qué:** nadie fue coadmin del grupo 2. Lo que la app permite hoy:

- Capturar scores en su propio grupo: cualquier jugador puede.
- Quitar jugadores: solo tú, como organizador.
- Cerrar tu ronda: solo tú.

Luis no cerró tu ronda. Importó y cerró la suya.

## Metodología propuesta

1. **Corregir los datos de hoy (con tu visto bueno):** reabrir tu ronda, quitar a Luis, Jorge y Felipe León del grupo 2 y volver a cerrar. El dinero queda solo entre jugadores con scores reales: Sergio, Edgar, Enrique y Gustavo. Para Gustavo, quitarlo también de una de las dos rondas: ¿cuál conservamos?
2. **No volver a poner par al cerrar:** si a un jugador le faltan hoyos, el cierre se detiene y muestra quién y cuáles. Tú decides entre capturar, quitarlo o cerrar como incompleta. Nunca se rellena con par en silencio.
3. **Quitar jugadores siempre se guarda o avisa:** ya se corrigió ayer, falta publicar. Si el borrado falla, el jugador vuelve a aparecer con un aviso de error en vez de desaparecer solo de la pantalla.
4. **Antes de cerrar, recargar del servidor:** así la lista de jugadores y sus scores coinciden con lo que capturan los otros teléfonos, y la "Discrepancia" muestra nombres con una explicación clara.
5. **Importar tarjeta sin duplicados:** si un jugador de la tarjeta importada ya tiene una ronda ese día y en ese campo, la app avisa: "Gustavo ya está en la ronda de Sergio, ¿vincular, omitir o continuar?".
6. **Permisos del grupo 2:** se queda igual, el organizador manda. Opcional: dar al primer jugador del grupo 2 permiso de quitar jugadores solo de su grupo, sin poder cerrar.

## Detalles técnicos

- Paso 1: confirmar en `useRoundManagement` dónde el cierre guarda todos los `hole_scores` (en el estado local los que faltan quedan en par) y bloquearlo cuando a un jugador le falten capturas reales.
- La validación previa al cierre vuelve a leer `round_players` y `hole_scores` en lugar de usar el estado en memoria.
- `useScorecardImporter`: antes de llamar a `create_round`, consultar si hay `round_players` del mismo perfil en la misma fecha y campo.
- Corrección de datos: con reabrir, quitar y volver a cerrar, el libro de cuentas (`ledger`) y la foto del cierre (`snapshot`) se regeneran.
- Pruebas: cierre bloqueado con hoyos faltantes y aviso de duplicado al importar.