# Ajuste de tendencia de Handicap Index 90 días

## Objetivo

Dejar una lectura consistente de la tendencia de Handicap Index a 90 días, pero con dos presentaciones distintas:

1. **Rankings**: sin mini gráfica; mostrar solo un delta compacto del cambio del Handicap Index contra la referencia de 90 días.
2. **Historial de handicap**: mantener la mini gráfica en el extremo superior derecho, pero como una tendencia de múltiples puntos del Handicap Index dentro de la ventana de 90 días, más el delta referencia vs actual.

## Comportamiento esperado

### Rankings

- Eliminar la gráfica/sparkline de la columna de tendencia.
- Sustituirla por un delta pequeño y pegado al HCP del jugador o en la misma columna compacta, por ejemplo:
  - `-0.8` en verde cuando el Handicap Index bajó/mejoró.
  - `+0.6` en rojo cuando el Handicap Index subió/empeoró.
  - `0.0` o `—` neutro cuando está estable o no hay referencia suficiente.
- Mantener la comparación única: **Handicap Index actual − Handicap Index de referencia de 90 días**.
- Conservar la semántica visual: verde = mejora, rojo = empeora, neutro = estable/sin referencia.

### Historial de handicap

- En el bloque superior derecho, mostrar una mini gráfica del **Handicap Index** de los últimos 90 días.
- La línea debe poder reflejar varios puntos históricos del índice dentro de la ventana, no solo una línea de referencia a actual.
- Mantener énfasis en la comparación principal:
  - punto/valor de referencia de 90 días,
  - punto/valor actual,
  - delta compacto entre ambos.
- No volver a usar la comparativa de “últimos 3 diferenciales vs 3 anteriores”. Esa lógica queda eliminada para esta lectura.
- La gráfica debe ser discreta y menos detallada que la gráfica grande de diferenciales que ya aparece abajo.

## Detalles técnicos

- Ajustar `HandicapRankingHeader.tsx` y `HandicapRankingRows.tsx` para reemplazar la columna gráfica por un delta compacto de 90 días.
- Mantener `computeHandicapTrend` como fuente de verdad para el delta y el color.
- Evolucionar `HandicapSparkline.tsx` para que soporte dos modos de visualización:
  - `delta`: referencia vs actual, si se necesita conservarlo en algún lugar.
  - `series`: múltiples puntos de Handicap Index dentro de la ventana de 90 días para el historial.
- En `HandicapHistoryView.tsx`, pasar la serie de puntos al componente de gráfica y mostrar ahí el delta referencia vs actual.
- Validar que la dirección visual respete la lógica golfística:
  - si el Handicap Index baja, la línea baja y el color es verde;
  - si el Handicap Index sube, la línea sube y el color es rojo.

## Verificación

- Revisar visualmente rankings para confirmar que ya no aparece la mini gráfica y que el delta queda compacto.
- Revisar historial de handicap para confirmar que la mini gráfica superior derecha usa puntos de índice dentro de 90 días.
- Confirmar que el color y el signo del delta coinciden con la tendencia real.
