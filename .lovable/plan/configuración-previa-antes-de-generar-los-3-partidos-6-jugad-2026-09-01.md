# Configuración previa antes de generar los 3 partidos (6 jugadores)

## Objetivo

Con 6 jugadores en Foursomes y Carritos, hoy el botón "Generar los 3..." crea los partidos copiando lo que haya en el primer partido. Se busca que, igual que ya ocurre con 5 jugadores (Pareja base), el usuario pueda elegir **antes de generar**:

- Foursomes: Modalidad de Juego, Modalidad de HCP, Match Play 18 (cuando aplica), montos Front/Back/Total, ⭐ Unidades (on/off + valor), Oyeses (on/off + valor + modalidad).
- Carritos: Modalidad de Juego, Modalidad de HCP y montos Front/Back/Total.

Esa configuración se replica en los 3 partidos generados, y cada partido sigue siendo editable individualmente después.

## Experiencia de usuario

1. Con 6 jugadores participantes, arriba de la lista de partidos aparece un panel plegable "Generar 3 partidos (6 jugadores)" con el mismo estilo del panel de Pareja base actual.
2. El panel muestra la terna de parejas propuesta (P1+P2 / P3+P4 / P5+P6) y el control Shuffle para recorrer las 15 combinaciones antes de generar.
3. Debajo, los controles de configuración común (los listados arriba), precargados con los valores por defecto actuales de la apuesta.
4. Botón "Generar 3 partidos". Si ya existen partidos configurados, se pide confirmación con las opciones actuales: Reemplazar / Agregar faltantes / Cancelar.
5. Tras generar, cada tarjeta de partido conserva sus controles de edición individual sin cambios.
6. El Shuffle dentro de la tarjeta del primer partido sigue funcionando y ahora reutiliza la configuración común elegida en el panel (en lugar de leer solo el primer partido) al regenerar los 3.

## Detalle técnico

- Reutilizar `BasePairSelector.tsx` extendiéndolo con un modo `players: 5 | 6`:
  - En modo 6, se ocultan los selectores "Jugador base 1/2" y se muestra la terna de parejas + Shuffle (usando `getPairCombos` / `findPairComboIndex` ya existentes en `ParejasBets.tsx`, que se moverán a `basePairGenerator.ts` para poder importarlas desde el selector sin ciclo de imports).
  - Los bloques de configuración común (Modalidad Juego, Modalidad HCP, Match Play 18, montos, Unidades, Oyeses) se mantienen tal cual y se emiten en el mismo objeto `BasePairDefaults`.
- `onGenerate` en modo 6 entrega `(pairs, mode, defaults)`; `ParejasBets.tsx` lo conecta a `applySixPairsFoursomes` / `applySixPairsCarritos`, que hoy llaman a `buildTeamPressuresFromPairs` / `buildCarritosFromPairs`. Ambos builders ya aceptan `defaults` y `resolveTeamHandicaps`, así que solo hay que pasarlos (los `defaults` tienen prioridad sobre el template).
- Guardar los `defaults` elegidos en estado local del panel y pasarlos también al `onApplySixPairs` de la tarjeta del primer partido, para que el Shuffle posterior regenere con la misma configuración.
- Modo 'add': seguir usando `dropExistingMatches` para no duplicar partidos con el mismo cuarteto.
- Los handicaps por modalidad (Diferencial/Sliding Equipo) se recalculan por partido vía `resolveTeamHandicaps`, como ya se hace con 5 jugadores.
- Se retira el botón simple "Generar los 3 foursomes/carritos (6 jugadores)" y su lógica queda dentro del nuevo panel.

Sin cambios en Sixes ni en los motores de cálculo de apuestas.
