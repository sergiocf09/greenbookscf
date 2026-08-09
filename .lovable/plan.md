# Pareja base automática en Foursomes y Carritos (5 jugadores)

## Objetivo
Cuando en una apuesta de parejas participan exactamente 5 jugadores, permitir elegir 2 jugadores como **pareja base** y generar automáticamente los 3 matches contra las combinaciones de los otros 3 (A+B, A+C, B+C). Aplica a **Foursomes (Presiones por Parejas)** y a **Carritos**. Si no se elige pareja base, todo sigue funcionando exactamente como hoy (creación manual pareja por pareja).

## Comportamiento
1. En la tarjeta de Foursomes y en la de Carritos aparece un bloque compacto **"Pareja base (5 jugadores)"**, visible solo cuando la matriz de participación de esa apuesta tiene exactamente 5 jugadores activos.
2. El bloque tiene dos selectores (Jugador base 1 y Jugador base 2) y un botón **"Generar 3 matches"**.
3. Al generar:
   - Se crean 3 apuestas: base vs (A+B), base vs (A+C), base vs (B+C).
   - Los montos (front/back/total) y opciones (tipo de scoring, umbral de presión, hándicaps por jugador, sub-modalidades de units/oyeses en Foursomes) se copian de la primera apuesta ya configurada; si no existe ninguna, se usan los valores por defecto actuales.
   - La pareja base queda siempre como equipo A para lectura consistente.
4. Si ya existen matches configurados, el botón pide confirmación: **Reemplazar** los existentes o **Agregar** los que falten (no se duplica una combinación que ya exista).
5. Después de generar, cada match queda 100% editable/eliminable como hoy (jugadores, montos, hándicaps, scoring).
6. La pareja base seleccionada se guarda en la configuración de la ronda para que al reabrir el setup se muestre lo elegido; no impone nada sobre los matches ya creados.

## Detalles técnicos
- `src/types/golf.ts`: agregar campos opcionales `basePairTeamPressures?: [string, string]` y `basePairCarritos?: [string, string]` en `BetConfig` (opcionales, retrocompatibles con configs y plantillas existentes).
- Nuevo helper `src/components/setup/bets/basePairGenerator.ts`:
  - `getPairCombinations(others: string[]): [string,string][]`
  - `buildBasePairTeamPressures(base, others, template)` → `TeamPressuresBet[]`
  - `buildBasePairCarritosTeams(base, others, template)` → `CarritosTeamBet[]`
  - Deduplicación por conjunto de 4 jugadores (orden de equipos irrelevante).
- Nuevo componente de UI `src/components/setup/bets/BasePairSelector.tsx` (dos `Select` + botón + `AlertDialog` de confirmación), reutilizado por ambas secciones.
- `src/components/setup/bets/ParejasBets.tsx`: montar `BasePairSelector` dentro de las secciones `teamPressures` y `carritos`, usando `foursomesOptions` / `carritosOptions` (que ya respetan la matriz de participación) para decidir la visibilidad (== 5 opciones) y las opciones de selección. La escritura se hace con `onUpdateConfig`, respetando el flujo de overrides por grupo existente.
- Sin cambios en los motores de cálculo (`src/lib/bets/carritos.ts`, `teamPressures.ts`) ni en la persistencia: se generan las mismas estructuras que hoy se crean a mano.
- Ayuda contextual: añadir una línea en la sección de apuestas de `ContextualHelp.tsx` explicando la pareja base.

## Fuera de alcance
- Sixes y Vegas (mantienen su lógica actual).
- Casos con 6+ jugadores (round robin completo) — no se toca.
