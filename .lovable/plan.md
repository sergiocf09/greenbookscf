# Medal General en Sliding: dictamen y corrección

## Cómo debe funcionar (confirmado con tu regla)
- Cada jugador se compara contra cada rival usando los golpes de la matriz de esa pareja (no el hándicap individual).
- Gana un tramo (F9, B9, Total) solo quien le gane a TODOS sus rivales en su comparación bilateral. Si a uno no le gana, ese tramo no paga.
- El ganador cobra el importe del tramo a cada rival, y eso aparece en la bilateral de cada pareja.

El motor de cálculo ya hace exactamente esto. El error está en otro lado.

## Dictamen (ronda de Luis González, 14 oct)
- En la ronda guardada, Medal General **no tiene la modalidad Sliding**: está guardada sin ese dato, por eso se calcula como USGA (neto individual con hándicaps 0.0 / 11.5 / 15.2 / 15.5, gana el neto más bajo, empates divididos).
- La causa: al guardar la configuración de la ronda, y al volver a cargarla, la app copia los datos de Medal General campo por campo (importes, tramos, participantes…) y **se olvidó del selector USGA/Sliding**. En el teléfono de quien lo eligió se ve Sliding un momento, pero los demás teléfonos, cualquier recarga y el cierre de la ronda usan USGA. De ahí la inconsistencia.
- La matriz de golpes sí está bien guardada (ej. Luis da 8 a Rubio, 6 a Castañón y recibe 1 de Gustavo; Gustavo da 10 a Rubio y 8 a Castañón; Rubio da 1 a Castañón).
- Con esa matriz, en el Total 18: Rubio (89 gross) le gana a Luis 81 vs 86, a Gustavo 79 vs 83 y a Castañón 89 vs 90 → **Rubio es ganador absoluto del Total** y cobraría $25 a cada uno. F9 y B9 se verifican tras la corrección, hoyo por hoyo según ventajas.

## Corrección
1. Guardar y recuperar el selector USGA/Sliding de Medal General junto con el resto de su configuración.
2. En esta ronda (sigue abierta), dejar Medal General en Sliding, como se eligió, para que todos los teléfonos y el cierre calculen igual.
3. Revisar que el resultado de F9, B9 y Total muestre en cada bilateral el importe ganado por el ganador absoluto, y te paso la tabla resultante.
4. Agregar una prueba: con una matriz como la de esta ronda, Sliding elige al ganador absoluto, y el ajuste se conserva al guardar/cargar.

## Detalles técnicos
- `src/hooks/useBetConfigPersistence.ts`: añadir `handicapMode` al tipo `medalGeneral` (l.89), a la carga (l.440) y al guardado (l.615).
- Dato de la ronda `d7882ff1…`: actualizar `bet_config.medalGeneral.handicapMode = 'bilateral'`.
- Sin cambios en `medalGeneral.ts` / `medalGeneralSliding.ts`; el cierre ya inyecta la matriz desde `round_handicaps`.
