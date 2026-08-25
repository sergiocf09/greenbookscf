# Ocultar importes en el Bet Dashboard

Agregar un botón Eye/EyeOff en el header "Balance General" que oculta todas las cifras en pesos (reemplazadas por `••••`), manteniendo colores y estructura. El estado se guarda en localStorage.

## Comportamiento

- Ícono Eye/EyeOff a la derecha del título "Balance General".
- Con el toggle activo se enmascaran: balance total de cada jugador, total vs cada rival en la vista expandida, el Σ del pie de tabla, y los totales de BilateralDetail y CarritosResultsCard.
- Se mantiene visible: el desglose numérico sin signo de peso (Ind / Car / Pres) dentro del jugador expandido, y todos los campos de configuración de montos (valor por hoyo, valor de unidad, textos explicativos de fórmulas).
- Colores verde / rojo / neutro se conservan siempre.
- El estado persiste al cambiar de pestaña y al recargar (clave `greenbook_amounts_hidden`).

Nota sobre una ambigüedad en la especificación: el texto dice que al expandir un jugador sus sub-balances "sí se muestran", pero el checklist (punto 4) pide que el total de cada rival muestre `••••`. Voy con el checklist: los totales por rival se enmascaran y lo que permanece visible es el desglose Ind/Car/Pres. Si prefieres lo contrario, dímelo y lo ajusto.

## Detalles técnicos

`src/components/bets/BetDashboard.tsx`
- Imports `Eye`, `EyeOff` de lucide-react.
- Estado `amountsHidden` inicializado desde localStorage (con try/catch), `toggleAmountsHidden` que persiste el valor.
- Helpers locales `showAmt` / `showAmtSigned` con máscara `••••`.
- Botón en el `CardTitle` de Balance General.
- Enmascarar: balance por jugador en la lista (línea ~1948 del bloque de `tablaGeneralPlayers`), total vs rival en la vista expandida, y el bloque Σ (línea ~2150) usando la variante con render condicional para evitar tocar el IIFE anidado.
- Pasar `amountsHidden={amountsHidden}` a `<BilateralDetail>` (línea ~2403) y `<CarritosResultsCard>` (línea ~2472).

`src/components/bets/BilateralDetail.tsx`
- Nueva prop opcional `amountsHidden?: boolean` (default `false`), helpers `showAmt` / `showAmtSigned` locales.
- Aplicarlos a los totales calculados: `grandTotal`, `frontTotalAmount`, `backTotalAmount`, `medalTotalAmount`, `oyesTotal`, `computedTotalBalance`, `data.amount` y los totales por fila. No tocar inputs de configuración ni textos de mecánica.

`src/components/bets/CarritosResultsCard.tsx`
- Nueva prop opcional `amountsHidden?: boolean` (default `false`) y los mismos helpers.
- Aplicar `showAmtSigned` a `baseTeamMoney`, `frontMoney`, `backMoney`, `totalMoney`.

Solo cambios de presentación: ningún cálculo de apuestas, persistencia de ronda ni lógica de negocio se modifica.
