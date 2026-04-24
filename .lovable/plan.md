

## Reemplazar fila "Handicap Actual vs Nuevo" en Calculadora de Hándicap

### Contexto
La fila actual ("Handicap Actual / Sin cambio / Nuevo") en la Calculadora de Hándicap siempre muestra el mismo valor en ambos lados, ya que el hándicap del perfil se sincroniza en tiempo real con el cálculo USGA. Por lo tanto, el indicador de cambio (↑↓ "Sin cambio") nunca aporta información útil.

### Cambio propuesto
Sustituir esa fila por una vista que muestre **la ronda contante más baja** y **la ronda contante más alta** dentro de las 8 mejores diferenciales que se están usando para el cálculo. Esto da un feedback inmediato del rango de diferenciales que mueven el índice.

### Diseño de la nueva fila
Mismo contenedor visual (`bg-muted/50 rounded-lg p-3`), dos columnas:

```text
┌──────────────────────────┬──────────────────────────┐
│ Mejor diferencial usado  │ Peor diferencial usado   │
│ +5.2                     │ +9.6                     │
│ 22-abr · 81 gross        │ 18-abr · 84 gross        │
└──────────────────────────┴──────────────────────────┘
```

- **Izquierda**: etiqueta "Mejor contante" + diferencial (verde si negativo) + fecha corta y gross.
- **Derecha**: etiqueta "Peor contante" + diferencial + fecha corta y gross.
- Si la ronda más baja y la más alta son la misma (ej. solo 1 diferencial usado), mostrar solo una columna centrada.

### Cambios técnicos

**Archivo único**: `src/components/HandicapCalculator.tsx`

1. Reutilizar el set `usedRoundIds` ya calculado.
2. Derivar `usedRounds = differentials.filter(d => usedRoundIds.has(d.roundId))` y obtener `bestUsed` (menor `differential`) y `worstUsed` (mayor `differential`).
3. Reemplazar el bloque JSX actual (`{profile && handicapIndex !== null && (...)} `) por el nuevo card de dos columnas.
4. Eliminar imports ya no necesarios (`TrendingDown`, `TrendingUp`, `Minus`) si dejan de usarse.
5. Mantener el resto del componente intacto (header, card del index calculado, tabla de rondas, footnote).

### Notas
- No se altera la lógica de cálculo USGA ni `useUSGAHandicap`.
- El cambio es puramente visual/informativo en `HandicapCalculator.tsx`.

