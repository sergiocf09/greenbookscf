## Objetivo

Permitir que el override por par de "Presiones Back" **sí** gobierne el importe cuando el Front quedó Carry, siempre y cuando el usuario lo confirme explícitamente. Sin confirmación, seguimos protegiendo la fórmula del Carry (2×Front + Total 18) como hoy.

## Comportamiento propuesto (visión de usuario)

1. En la bilateralidad de Presiones, el campo "Back 9" al abrirse muestra el importe base configurado (ej. $50), aunque el motor esté calculando internamente $150 por Carry. Esto se mantiene igual.
2. Cuando el usuario edita ese campo y presiona **Guardar**, la app detecta si ese par está actualmente en Carry (Front empatado neto).
3. Si hay Carry y el back fue modificado, aparece un diálogo de confirmación con el mensaje:

   > "El match quedó **Carry en el Front**. Con la fórmula normal, cada presión del Back valdría **$X** (2×Front + Total 18). Si aplicas este cambio, cada presión del Back valdrá **$Y** (tu monto) y el **Total 18 se paga por separado** con su propio importe. ¿Deseas continuar?"
   >
   > Botones: **Cancelar** / **Aplicar override fuerte**.

4. Si confirma:
   - Se guarda el override de "Presiones Back" con el monto ingresado (comportamiento estándar).
   - Se marca ese override con una bandera `carryHardOverride: true` para que el motor sepa que debe romper la fórmula del Carry.
   - Como consecuencia, el **Total 18 deja de estar absorbido** y se paga con su override o el valor del grupo (el motor ya no lo fuerza a $0/Carry para ese par).
5. Si cancela: no se guarda nada, el Back sigue calculándose con la fórmula del Carry.
6. **Reversión automática:** si más adelante el Front deja de estar empatado (por edición de un hoyo) y luego vuelve a empatarse, el `carryHardOverride` sigue activo hasta que el usuario borre el override de Back manualmente o lo edite de nuevo. Esto es predecible: la bandera vive junto al override; si borran el monto, se borra la bandera.

## Cambios técnicos

**Tipos (`src/types/golf.ts`)**
- Agregar campo opcional `carryHardOverride?: boolean` al tipo `BetOverride`.

**Motor (`src/lib/bets/pressures.ts`)**
- Al calcular Back con Front en Carry, buscar el override del par para "Presiones Back". Si existe y tiene `carryHardOverride === true`:
  - Usar el monto del override como valor por presión del Back (en lugar de `2×front + match18`).
  - Emitir el Total 18 como summary normal (con su override o el valor de grupo), en vez de la fila "Carry $0".
- Renombrar la etiqueta emitida en este caso a `'Presiones Back'` (sin sufijo Carry), para que la aplicación de overrides en `betCalculations.ts` la trate como override normal y no la proteja.

**Aplicación de overrides (`src/lib/betCalculations.ts`)**
- La guarda `isCarryDerived` sigue igual: solo protege summaries con label `(Carry x2+Match)`. Como con `carryHardOverride` ya no emitimos ese label, el override aplica naturalmente.

**UI (`src/components/bets/BilateralDetail.tsx`)**
- En el flujo de Guardar (línea ~3416 en adelante), antes de hacer `upsert('Presiones Back', overrides.back)`:
  - Detectar si el par está en Carry consultando los summaries actuales (existe una fila `Presiones Match 18` con descripción `'Carry'`, o `Presiones Back (Carry x2+Match)`).
  - Detectar si el valor de Back cambió respecto al override previo.
  - Si ambas condiciones se cumplen, abrir un `AlertDialog` con el mensaje descrito arriba, mostrando el valor calculado del Carry ($150 en el ejemplo) vs el nuevo valor ingresado.
  - Al confirmar, guardar el override marcando `carryHardOverride: true`.
  - Al cancelar, abortar el guardado (o guardar el resto sin tocar Back — a decidir; propuesta: abortar completo para que quede claro).
- Cuando el usuario edite de nuevo el back a un valor "coherente con Carry" o borre el override, limpiar la bandera.

## Notas de simplicidad

- No hay UI nueva en el editor: solo un diálogo de confirmación puntual.
- No se persiste estado extra fuera del propio override (una sola bandera booleana).
- Si el Front deja de ser Carry, el override de Back se comporta como override normal (la bandera es inocua).
- Fácil de revertir: borrar override → vuelve a fórmula automática.

## Fuera de alcance

- No modifica el comportamiento de otras apuestas.
- No cambia la UI del editor más allá del diálogo de confirmación.
- No afecta a jugadores invitados vs registrados (el override es por par, sin distinción).
