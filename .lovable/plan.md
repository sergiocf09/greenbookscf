## Diagnóstico

La ronda del 8 de mayo volvió a guardar valores erróneos al recerrarse porque el código corregido en el archivo de Carritos sí agrega `betId`, pero `generateRoundSnapshot` no persiste ese `betId` en el ledger del snapshot. En consecuencia, si el usuario reabre y cierra, las 3 apuestas de Carritos con mismos equipos/importes vuelven a verse iguales para el deduplicador y se colapsan a una sola.

Esto explica exactamente el patrón:
- En vivo/cierre: el motor calcula Rodrigo $3,400 correctamente.
- Al guardar snapshot: el ledger colapsa Carritos repetidos y baja a Rodrigo $2,950.
- Al reparar manualmente el snapshot se ve bien.
- Al reabrir/recerrar se regenera desde código y vuelve el error.

## Plan de implementación

1. **Hacer persistente el identificador de apuesta en snapshots**
   - Agregar `betId?: string` a `SnapshotLedgerEntry`.
   - Cuando `generateRoundSnapshot` construya el ledger, copiar `summary.betId` a cada entrada.
   - Mantener compatibilidad con snapshots viejos: si no hay `betId`, no cambia nada.

2. **Blindar Carritos multi-instancia**
   - Mantener el `betId` que ya se añade en `calculateCarritosBets`.
   - Confirmar que cada Carritos configurado (`carritos-177826...`) produce entradas distinguibles aun si par, segmento e importe son iguales.

3. **Extender la prueba existente**
   - Ajustar la prueba de Carritos para validar no solo totales/cantidad, sino también que el ledger del snapshot conserva dos `betId` distintos.
   - Ejecutar la prueba enfocada de `teamBetPersistence.test.ts`.

4. **Reparar nuevamente la ronda afectada**
   - Reaplicar la corrección de datos a la ronda del 8 de mayo para que el snapshot quede otra vez con:
     - Rodrigo Echevarria: $3,400
     - Carlos Echevarría: $3,050
     - Antonio Gomez Aguirre: -$5,350
     - German Galvez: -$775
     - Adrian Garza Frisbie: -$325
   - Verificar por consulta que Carritos tiene 12 entradas por segmento y $600 por segmento.

5. **Validar el caso del jugador eliminado**
   - Verificar que Sergio Cruz ya no está en el snapshot tras el recierre y que su eliminación no afecta los balances porque estaba en cero.
   - Confirmar que el snapshot actual vuelve a coincidir con el último `balanceComparison` del cierre.