

## Diagnóstico: Vegas Fixed no se refleja en el Dashboard

### Causa raíz

El problema está en la **sincronización** entre la configuración local (`betConfig.vegasBets[0]`) y el hook de base de datos (`useVegas`).

En `Index.tsx` línea 258, la sincronización solo ocurre cuando `!vegas.isActive`:

```ts
if (firstVegas && !vegas.isActive) {
  vegas.saveConfig({ ... });
}
```

Una vez que el hook guarda la config en la base de datos (por ejemplo, como `rotating`), si el usuario cambia la variante a `fixed` en el setup, **el cambio nunca se propaga** al hook porque `vegas.isActive` ya es `true`.

Además, la dependencia del `useEffect` en línea 277 solo observa `betConfig.vegasBets?.length` — es decir, solo reacciona cuando se agrega o elimina una apuesta de Vegas, **no cuando cambian propiedades internas** como `variant`, `valuePerPoint`, o los player IDs.

El merge en `BetDashboard.tsx` línea 3180 solo sobreescribe campos cuando `hookHasEmptyPlayers`, así que tampoco corrige la variante si los jugadores ya están asignados.

### Solución

**Archivo: `src/pages/Index.tsx`**

1. Cambiar la condición de sincronización de Vegas para que **siempre** re-sincronice cuando las propiedades del `betConfig.vegasBets[0]` cambien, no solo cuando el hook está inactivo.
2. Agregar como dependencias del `useEffect` los campos clave: `variant`, `valuePerPoint`, `playerAId`, etc., o simplemente serializar `betConfig.vegasBets?.[0]` como dependencia.

```ts
// Antes:
if (firstVegas && !vegas.isActive) {
  vegas.saveConfig({ ... });
}

// Después:
if (firstVegas) {
  vegas.saveConfig({ ... });
}
```

Y en las dependencias del efecto, agregar `JSON.stringify(betConfig.vegasBets?.[0])` para detectar cualquier cambio interno.

**Archivo: `src/components/bets/BetDashboard.tsx`**

3. Como defensa adicional, actualizar el merge en línea 3180 para que SIEMPRE tome el `variant` del `betInst` (la fuente de verdad del setup) si existe, no solo cuando `hookHasEmptyPlayers`:

```ts
const mergedVegasConfig = {
  ...hookCfg,
  ...(betInst ? {
    variant: betInst.variant,
    valuePerPoint: betInst.valuePerPoint,
    useHandicap: betInst.useHandicap,
    birdieMultiplier: betInst.birdieMultiplier,
    ...(hookHasEmptyPlayers && betInst.playerAId ? {
      playerAId: betInst.playerAId,
      playerBId: betInst.playerBId,
      playerCId: betInst.playerCId,
      playerDId: betInst.playerDId,
    } : {}),
  } : {}),
};
```

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Index.tsx` | Remover guarda `!vegas.isActive`; agregar dependencia serializada de `vegasBets[0]` |
| `src/components/bets/BetDashboard.tsx` | Merge siempre tome `variant` y config values del `betInst` |

