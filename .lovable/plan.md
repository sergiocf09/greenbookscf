## Objetivo

Unificar la lógica cuando la ronda arranca en el hoyo 10:

1. **Nomenclatura siempre "Front 9 / Back 9"** en todas las apuestas (individuales, parejas y grupales). El detalle de qué hoyos físicos componen cada segmento se muestra solo en el tooltip al hacer clic.
2. **Apuestas de "último en…" (Culebras, Zoológico, Pingüinos)** deben determinar al "último" por el **orden de juego**, no por el número físico de hoyo. Si la ronda empezó en 10, el último hoyo jugado es el 9 (no el 18).

Los Caros ya quedaron correctos en la iteración anterior y no se tocan.

---

## Cambios

### 1. Revertir labels a "Front 9 / Back 9" con tooltip de hoyos físicos

`**src/components/bets/BilateralDetail.tsx**`

- Deshacer el cambio anterior: el primer renglón siempre dice **"Front 9"**, el segundo **"Back 9"**, el tercero **"Total 18"** — independientemente del `startingHole`.
- Agregar un tooltip (usando el componente `Tooltip` ya disponible) en cada label que muestre el rango físico real:
  - `startingHole === 1` → "Hoyos 1–9" / "Hoyos 10–18"
  - `startingHole === 10` → "Hoyos 10–18" / "Hoyos 1–9"
- Los valores numéricos ya se calculan correctamente con `getSegmentHoleRanges` desde la iteración previa; solo se ajusta la presentación.

### 2. "Último" por orden de juego en Culebras / Zoológico / Pingüinos

Crear un helper compartido en `**src/lib/bets/shared.ts**`:

```ts
export const playOrderIndex = (holeNumber: number, startingHole: 1 | 10): number => {
  if (startingHole === 1) return holeNumber - 1;
  // startingHole === 10: orden es 10,11,...,18,1,2,...,9
  return holeNumber >= 10 ? holeNumber - 10 : holeNumber + 8;
};
```

`**src/lib/bets/culebras.ts**`

- Recibir `startingHole` como parámetro.
- Reemplazar `Math.max(...allCulebras.map(c => c.holeNumber))` por el hoyo cuyo `playOrderIndex` sea el mayor.
- `culebrasOnLastHole` se filtra contra ese hoyo (que es el último jugado, no el de mayor número físico).
- El tie-break override (`tieBreakLoser` con formato `hole:playerId`) sigue funcionando porque compara contra el hoyo seleccionado, sea cual sea.

`**src/lib/bets/pinguinos.ts**`

- Mismo tratamiento: recibir `startingHole`, calcular `maxHole` por `playOrderIndex` en lugar de por número físico.

`**src/lib/bets/zoologico.ts**`

- `calculateZoologicoAnimalResult` recibe `startingHole` (default `1`).
- Calcular el "último hoyo" usando `playOrderIndex` sobre `animalEvents`.
- `calculateZoologicoBets` propaga `startingHole` al helper.

### 3. Propagación de `startingHole`

`**src/lib/betCalculations.ts**` (orquestador) — pasar `startingHole` a:

- `calculateCulebrasBets`
- `calculatePinguinosBets`
- `calculateZoologicoBets`

Verificar también que cualquier consumidor directo de `calculateZoologicoAnimalResult` (p.ej. dashboards/popovers de Zoológico) reciba y pase `startingHole`. Si no lo tienen disponible, se toma de `round.startingHole` desde `RoundContext`/`useRoundManagement`.

---

## Detalles técnicos

- Empate en el "último hoyo jugado": se mantiene la lógica existente (mayor `putts` / mayor `overPar` / mayor `count`), porque el cambio es solo en cómo se identifica ese último hoyo.
- No se toca persistencia ni esquema de BD.
- No se toca la lógica de Caros, Vegas, Skins, Medal, Putts ni Sliding (ya corregidas).
- Tests: si existen tests de culebras/zoológico/pingüinos, agregar un caso con `startingHole=10` que verifique que una incidencia en hoyo 18 (primer hoyo jugado) no se considera la "última".

---

## Archivos a modificar

- `src/components/bets/BilateralDetail.tsx` — labels fijos + tooltip
- `src/lib/bets/shared.ts` — helper `playOrderIndex`
- `src/lib/bets/culebras.ts` — parámetro + lógica de último
- `src/lib/bets/pinguinos.ts` — parámetro + lógica de último
- `src/lib/bets/zoologico.ts` — parámetro + lógica de último
- `src/lib/betCalculations.ts` — propagar `startingHole`
- Consumidores de `calculateZoologicoAnimalResult` (si aplica)