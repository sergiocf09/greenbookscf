# Dictamen y corrección del Shuffle de parejas

## Qué encontré (verificado en el código)

En `src/components/setup/bets/ParejasBets.tsx`, el botón Shuffle dentro de `TeamColumns` (líneas 1008-1027) hace esto al hacer clic:

```text
onUpdateTeamA(next.teamA);
onUpdateTeamB(next.teamB);
if (next.teamC) onUpdateTeamC(next.teamC);
```

Es decir, dispara 2 o 3 actualizaciones parciales seguidas y **nunca usa `onShuffleTeams`**, que es el setter atómico que sigue declarado en las props (línea 974) y que los padres siguen pasando (Sixes línea 1988, Carritos 1594, Foursomes 1165).

Dos consecuencias, que corresponden exactamente a los dos síntomas reportados:

1. **4 jugadores (regresión).** En Sixes, `onShuffleTeams` era el único camino que, además de fijar el Set 1, regeneraba automáticamente los Sets 2 y 3 con la rotación correcta. Al haberse reemplazado por `onUpdateTeamA` + `onUpdateTeamB`, el Set 1 cambia pero los Sets 2 y 3 quedan con la rotación anterior, y además cada llamada parcial parte del mismo snapshot de configuración, por lo que la segunda escritura puede sobrescribir a la primera. Resultado: combinaciones incorrectas / inconsistentes con 4 jugadores.

2. **6 jugadores (se queda en la última combinación).** Con `teamA`, `teamB` y `teamC` escritos en tres llamadas separadas contra el mismo snapshot (`onUpdate` → `onUpdateBet('carritos', updates)` / `updateCarritosTeam`), el estado resultante puede quedar mezclado: una pareja nueva junto con una vieja. Ese estado mixto no coincide con ninguna de las 15 combinaciones, `currentIdx` regresa `-1`, y el ciclo deja de avanzar de forma predecible: se queda anclado en la misma combinación en lugar de dar la vuelta a la primera. El módulo `% 15` está bien; el problema es que el estado leído nunca corresponde a una combinación válida del ciclo.

## Corrección propuesta

1. **Escritura atómica.** Extender `onShuffleTeams` a `(teamA, teamB, teamC?)` y hacer que el botón Shuffle lo use como único camino de actualización (con fallback a los setters individuales solo si el padre no lo provee).
   - Sixes: sigue recibiendo `(a, b)` y regenerando Sets 2 y 3 → comportamiento de 4 jugadores idéntico al original.
   - Carritos y Foursomes: `onUpdate({ teamA, teamB, teamC })` en una sola llamada, para que el estado siempre corresponda a una combinación válida.

2. **Ciclo robusto de 6 jugadores.** Guardar el índice de combinación en el estado local del componente (`useRef`/`useState`) y usarlo como base del avance, con la detección por parejas solo como respaldo cuando el índice no coincide con el estado actual. Así el clic 16 regresa a la combinación 1 sin depender de reconocer el estado.

3. **Poder regresar.** Mostrar el contador de posición (`3/15`, `2/3`) junto al botón y añadir una flecha "atrás" que retrocede una combinación, para cuando el organizador se pasa de la que quería.

4. **Sin cambios de lógica de apuestas.** No se toca `getNextPairCombo` en su tabla de combinaciones ni el motor de cálculo; solo el flujo de actualización y la UI del control.

## Verificación

- Prueba de ciclo: con 4 jugadores, 3 combinaciones únicas y regreso a la primera al 4º clic; con 6, 15 únicas y regreso al 16º.
- Sixes con 4 jugadores: al hacer Shuffle, Sets 2 y 3 se regeneran con la rotación esperada.
- Carritos y Foursomes con 6: cada clic deja tres parejas disjuntas y el contador avanza 1..15 y vuelve a 1.
