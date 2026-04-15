

# Plan: Fase 2 — Hándicaps editables en Sixes/Vegas + Modalidades de equipo

## Resumen

Tres bloques de trabajo:
1. **Sixes y Vegas: hándicaps editables + Base Cero / Full Hándicap** (confirmado con screenshots)
2. **Modalidad "Diferencial de Equipo"** — suma de HCPs por pareja, diferencia neta a un solo jugador
3. **Modalidad "Sliding de Equipo"** — cálculo cruzado entre parejas, dividido entre 2, con lógica de medio punto simplificada

---

## Aclaración del medio punto (según instrucciones del usuario)

El medio punto se asigna al hoyo donde el stroke index del campo coincide con la posición del medio punto. Ejemplo: si el resultado es 3.5 strokes, el jugador recibe strokes completos en los hoyos con handicap index 1, 2, 3 y un **medio stroke** en el hoyo con handicap index 4. En ese hoyo específico:
- **Si empata** el hoyo antes de aplicar el stroke → el medio se convierte en stroke completo y gana el hoyo
- **Si pierde** el hoyo → el medio no aplica
- En todos los demás hoyos, no hay efecto del medio punto

Esto se implementa con `calculateStrokesPerHole` existente: se distribuyen los strokes enteros normalmente, y se marca un flag `halfStrokeHole` indicando en qué hoyo hay medio punto.

---

## Cambio 1 — Tipos (`src/types/golf.ts`)

Agregar a `SixesBetInstance` y `VegasBetInstance`:
```ts
teamHandicaps?: Record<string, number>;
```

Crear un tipo compartido para las modalidades de hándicap de equipo (usado por todas las apuestas de parejas):
```ts
export type TeamHandicapMode = 'individual' | 'baseCero' | 'diferencialEquipo' | 'slidingEquipo';
export interface TeamHandicapConfig {
  mode: TeamHandicapMode;
  diferencialRecipientOverride?: string; // playerId cuando ambos jugadores del equipo receptor empatan en HCP
  slidingHalfPointMode?: 'roundDown' | 'halfPoint';
}
```

Agregar `handicapConfig?: TeamHandicapConfig` a: `TeamPressuresBet`, `CarritosTeamBet`, `SixesBetInstance`, `VegasBetInstance`, y `WolfSetupConfig`.

---

## Cambio 2 — Utilidad de cálculo (`src/lib/handicapUtils.ts`)

Nuevas funciones:

```ts
// Diferencial de equipo: suma HCPs de cada pareja, diferencia al jugador de mayor HCP
calcTeamDifferential(teamA: [hcp, hcp], teamB: [hcp, hcp])
  → { diff, receivingTeam, recipientPlayerId, teamHandicaps }

// Sliding de equipo: cruza A↔C, A↔D, B↔C, B↔D, suma, divide entre 2
calcSlidingTeamDifferential(slidings: {ac, ad, bc, bd})
  → { raw, rounded, hasHalf, halfStrokeHoleIndex?, receivingPlayerId, teamHandicaps }

// Distribución de strokes con medio punto
calculateStrokesPerHoleWithHalf(strokes: number, hasHalf: boolean, course, startingHole)
  → { strokesPerHole: number[], halfStrokeHole: number | null }
```

La función `calculateStrokesPerHoleWithHalf` reutiliza `calculateStrokesPerHole` para los strokes enteros (`Math.floor(strokes)`) y determina el `halfStrokeHole` como el siguiente hoyo en la secuencia del handicap index donde no se recibió stroke completo.

---

## Cambio 3 — UI Setup (`src/components/setup/bets/ParejasBets.tsx`)

### 3a — Hándicaps editables en Sixes y Vegas

En `SixesBetCard` y `VegasBetCard`:
- Pasar `bet.teamHandicaps ?? {}` a `TeamColumns`
- `onUpdateHandicaps` actualiza `bet.teamHandicaps`
- Agregar botón toggle Base Cero / Full Hándicap (misma lógica que ya existe en Foursomes/Carritos)

### 3b — Selector de modalidad unificado

Reemplazar el botón "Base Cero / Full Hándicap" en **todas** las apuestas de parejas con un selector tipo `Select`:

```
Modalidad HCP: [Individual ▾]
  • Individual — cada jugador con su HCP del setup
  • Base Cero — relativo al mínimo
  • Diferencial Equipo — un solo jugador recibe la diferencia neta
  • Sliding Equipo — basado en sliding bilateral (solo si hay datos)
```

Cuando se selecciona **Diferencial Equipo**:
- Se calcula automáticamente y se muestra un mini resumen: "Jugador X recibe N golpes"
- Si ambos jugadores del equipo receptor empatan en HCP, aparece un selector para elegir quién recibe
- Los inputs de HCP se vuelven read-only

Cuando se selecciona **Sliding Equipo**:
- Se muestra el cálculo automático
- Si hay medio punto, aparece toggle: "Redondear abajo" vs "Medio punto"
- Mini explicación: "El medio punto aplica solo si empata el hoyo con handicap index N"

---

## Cambio 4 — Motores de cálculo

### Sixes (`src/lib/bets/sixes.ts`)
La función `getScore` actualmente usa `player.handicap` directamente. Modificar para aceptar `teamHandicaps?: Record<string, number>` desde la config y usarlo como override (misma lógica que `teamPressures.ts`). Agregar soporte para medio punto: en el hoyo marcado como `halfStrokeHole`, el stroke solo se aplica si el net score del jugador empata con su rival directo.

### Vegas (`src/lib/bets/vegas.ts`)
Misma modificación que Sixes.

### TeamPressures y Carritos
Ya soportan `teamHandicaps`. Solo agregar la lógica del medio punto.

---

## Cambio 5 — Defaults (`src/components/setup/bets/defaultBetConfig.ts`)

Agregar `handicapConfig: { mode: 'individual' }` como default para las apuestas que lo usen.

---

## Archivos afectados

| Archivo | Cambios |
|---------|---------|
| `src/types/golf.ts` | `TeamHandicapMode`, `TeamHandicapConfig`, `teamHandicaps` en Sixes/Vegas |
| `src/lib/handicapUtils.ts` | `calcTeamDifferential`, `calcSlidingTeamDifferential`, `calculateStrokesPerHoleWithHalf` |
| `src/components/setup/bets/ParejasBets.tsx` | HCPs editables en Sixes/Vegas, selector de modalidad unificado |
| `src/lib/bets/sixes.ts` | Soporte `teamHandicaps` + medio punto |
| `src/lib/bets/vegas.ts` | Soporte `teamHandicaps` + medio punto |
| `src/lib/bets/teamPressures.ts` | Medio punto |
| `src/lib/bets/carritos.ts` | Medio punto |
| `src/components/setup/bets/defaultBetConfig.ts` | Defaults |

