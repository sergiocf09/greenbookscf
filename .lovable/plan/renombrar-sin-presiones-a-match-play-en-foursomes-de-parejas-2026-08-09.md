# Renombrar "Sin presiones" a "Match Play" en Foursomes de parejas

## Validación del motor (ya verificada)

Revisé el motor de apuestas y la vista de resultados: la modalidad `matchOnly` **ya considera únicamente la bola baja**.

- `src/lib/bets/teamPressures.ts`: el cálculo por hoyo suma punto solo en el bloque de bola baja (`lowBall | combined | matchOnly`); el bloque de bola alta excluye `matchOnly`.
- En esa misma función el umbral de apertura de presiones se fija en `Infinity` para `matchOnly`, es decir nunca se abren presiones adicionales.
- `src/components/bets/BetDashboard.tsx` (detalle hoyo por hoyo) aplica la misma regla: en `matchOnly` solo se evalúa `lowBall`, y el umbral también es `Infinity`.
- El desempate de medio punto (hándicap .5) solo mueve el resultado de bola baja en esta modalidad, consistente con el motor.

Conclusión: el comportamiento actual es correcto para Match Play en foursomes (solo bola baja, sin presiones). El cambio requerido es únicamente de nomenclatura.

## Cambios de nomenclatura

1. Selector de Modalidad en la configuración de parejas: "Sin presiones" pasa a "Match Play".
2. Vista de resultados (etiqueta debajo del detalle del foursome): "Sin presiones" pasa a "Match Play".
3. Nota informativa del setup: "Solo Match: sin apertura de presiones" pasa a "Match Play: solo cuenta la bola baja, sin apertura de presiones"; y la variante continua a "Match Play continuo: corre del 1 al 18, solo bola baja, se define cuando la ventaja supera los hoyos restantes".
4. Ayuda contextual de apuestas: agregar la aclaración de que en Match Play de foursomes solo cuenta la bola baja del equipo.

No se toca el valor interno `matchOnly` ni ninguna lógica de cálculo, por lo que rondas existentes y configuraciones guardadas siguen funcionando igual.

## Detalles técnicos

- `src/components/setup/bets/ParejasBets.tsx`: `SelectItem value="matchOnly"` (línea ~1005) y la nota informativa (~1241-1244).
- `src/components/bets/BetDashboard.tsx`: etiqueta de modalidad (~3159).
- `src/components/help/ContextualHelp.tsx`: texto de apuestas por parejas.
- Sin migraciones ni cambios en tipos.
