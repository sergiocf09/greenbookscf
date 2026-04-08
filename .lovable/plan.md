## Ajustes en Parejas y Nines — Plan Consolidado

### 1. Corregir nota informativa de Foursomes (TeamPressureCard)

**Archivo**: `ParejasBets.tsx` (líneas 813-817)

La nota actual dice:
- Combinado: "nuevas apuestas cuando diferencia > 2" ✓ correcto
- Individual: "nuevas apuestas cuando diferencia = 2" ✗ incorrecto

Corregir a:
- `lowBall`: "Bola Baja: no apuesta cuando diferencia = 2"
- `highBall`: "Bola Alta: no apuesta cuando diferencia = 2"  
- `combined`: "Combinado: no apuesta cuando diferencia > 2"
- `matchOnly`: (no mostrar nota de presiones, ver punto 2)

### 2. Agregar modalidad "Solo Match" a Foursomes

**Archivos**: `golf.ts`, `ParejasBets.tsx`, `teamPressures.ts`

- Ampliar `scoringType` en `TeamPressuresBet` de `'lowBall' | 'highBall' | 'combined'` a `'lowBall' | 'highBall' | 'combined' | 'matchOnly'`
- En el Select de modalidad del `TeamPressureCard`, agregar opción "Solo Match"
- En `teamPressures.ts`: cuando `scoringType === 'matchOnly'`, NO abrir presiones (solo acumular resultado de hoyos ganados como lowBall pero sin threshold de apertura)
- En la nota inferior: si matchOnly, mostrar "Solo Match: sin apertura de presiones"
- Actualizar `useBetConfigPersistence.ts` para incluir `'matchOnly'` en el tipo

### 3. Ocultar secciones no seleccionadas en la matriz de parejas

**Archivo**: `ParejasBets.tsx`

Actualmente todas las `BetSection` se renderizan siempre. Envolver cada una con un condicional que verifique si la apuesta está habilitada en la matriz:
- Foursomes: `config.teamPressures.enabled`
- Carritos: `config.carritos.enabled`
- Loba: `config.wolfSetup?.enabled`
- Sixes: `(config.sixesBets?.length ?? 0) > 0`
- Vegas: `(config.vegasBets?.length ?? 0) > 0`

Si ninguna está activa, no mostrar nada debajo de la matriz.

### 4. Reordenar Loba al final

**Archivos**: `ParejasParticipationMatrix.tsx`, `ParejasBets.tsx`

En `PAREJAS_BETS` mover `wolf` al último lugar:
```
Foursomes → Carritos → Sixes → Vegas → 🐺 Loba
```

En `ParejasBets.tsx` reordenar las `BetSection` para que Loba sea la última.

### 5. Permitir deseleccionar jugadores en la matriz de parejas

**Archivo**: `ParejasParticipationMatrix.tsx`

Actualmente las celdas de la matriz son `<div>` no clickeables. Cambiar a `<button>` clickeable (como en la grupal) con lógica:
- Al hacer click en una celda, toggle la participación del jugador en esa apuesta
- **Mínimo 4 jugadores** seleccionados por apuesta — si hay 4 o menos seleccionados, no permitir deseleccionar (o mostrar nota)
- Cuando un jugador se deselecciona, filtrarlo de los `playerOptions` del `Select` en la configuración detallada de esa apuesta

Esto requiere:
- Agregar `handleCellToggle` similar a la grupal
- Agregar `handleColumnToggle` para toggle de columna (click en iniciales)
- Propagar los `participantIds` a cada apuesta para filtrar selectores
- Actualizar `getParejasActivePlayerIds` para que devuelva solo los seleccionados

### 6. Nines: mensaje inteligente para múltiples grupos

**Archivo**: `GrupalParticipationMatrix.tsx` (líneas 318-332)

Lógica actual: si Nines activo y count ≠ 3, muestra "Selecciona exactamente 3 jugadores".

Nueva lógica:
- Si hay **1 sola instancia** de ninesBets y sus playerIds ≠ 3 → "Selecciona exactamente 3 jugadores para Nines"
- Si hay **múltiples instancias** de ninesBets, cada una con exactamente 3 playerIds → "Múltiples grupos de Nines activos" (nota informativa, sin warning)
- Si hay múltiples instancias y alguna no tiene 3 → "Selecciona exactamente 3 jugadores por cada grupo de Nines"

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/types/golf.ts` | Agregar `'matchOnly'` a scoringType de TeamPressuresBet |
| `src/components/setup/bets/ParejasBets.tsx` | Nota Foursomes, Solo Match UI, ocultar secciones, reordenar Loba al final |
| `src/components/setup/bets/ParejasParticipationMatrix.tsx` | Reordenar Loba, hacer celdas clickeables, lógica de toggle por celda/columna, min 4 jugadores |
| `src/lib/bets/teamPressures.ts` | Manejar `matchOnly` (no abrir presiones) |
| `src/hooks/useBetConfigPersistence.ts` | Incluir `'matchOnly'` en tipo |
| `src/components/setup/bets/GrupalParticipationMatrix.tsx` | Nines: mensaje inteligente multi-grupo |
