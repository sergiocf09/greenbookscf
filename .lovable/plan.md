

## Plan: Corrección del cálculo de montos en Las Vegas

### Diagnóstico

He verificado los datos reales de la ronda y confirmado el bug. Los números que reportas coinciden exactamente con lo que el código produce y lo que debería producir:

| Jugador | Correcto | Actual (buggy) |
|---------|----------|-----------------|
| Cruz Fernández | +$440 | +$840 |
| Cruz Delfín | -$140 | -$180 |
| Pizarro | -$260 | -$220 |
| Ocampo | -$40 | -$440 |

### Causa raíz

En `buildVegasSetResults` (línea 123 de `vegas.ts`), el `totalAmount` se calcula como la **suma de valores absolutos** de las diferencias por hoyo:

```
totalAmount = Σ |diff_hoyo_i| × $10
```

Pero en Las Vegas el cobro es sobre la **diferencia neta acumulada** del set:

```
totalAmount = |Σ diff_hoyo_i| × $10
```

Ejemplo Set 1: las diferencias por hoyo son +10, +12, +1, -9, +1, 0. El neto es +15, pero la suma de absolutos es 33. Esto infla el monto de $150 a $330 por equipo.

### Cambio

**Archivo: `src/lib/bets/vegas.ts`**

Reemplazar la línea 123:
```typescript
const totalAmount = details.reduce((acc, d) => acc + d.amountThisHole, 0);
```

Por lógica que use el **neto** del set multiplicado por la tarifa correspondiente:

```typescript
// Sin montos por segmento: tarifa uniforme
// Con montos por segmento en rotatorio: cada set tiene su tarifa
// Con montos por segmento en fijo: front y back se liquidan por separado
const totalAmount = (() => {
  if (!config.useSegmentAmounts || config.variant !== 'fixed') {
    return Math.abs(totalDiff) * getVegasSegmentAmount(config, s.start);
  }
  // Fixed + segment amounts: liquidar front y back por separado
  const frontDiff = details.filter(d => d.holeNumber <= 9).reduce((a, d) => a + d.diff, 0);
  const backDiff = details.filter(d => d.holeNumber > 9).reduce((a, d) => a + d.diff, 0);
  return Math.abs(frontDiff) * getVegasSegmentAmount(config, 1)
       + Math.abs(backDiff) * getVegasSegmentAmount(config, 10);
})();
```

Los `amountThisHole` individuales se mantienen para la visualización del tooltip por hoyo, pero ya no se suman para el cobro final.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/bets/vegas.ts` | Corregir cálculo de `totalAmount` en `buildVegasSetResults` |

### Nota sobre los puntos de Ocampo

Verificando los scores reales: Ocampo tiene -15 (Set 1) - 9 (Set 2) + 20 (Set 3) = **-4 puntos netos** = -$40, no +$60 como mencionaste. Es posible que haya un error en la cuenta manual. El motor con la corrección dará -$40 para Ocampo.

