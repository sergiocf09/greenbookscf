

## Mejoras UX en Setup de Apuestas de Parejas

### Cambios solicitados

**1. Auto-crear primera instancia al abrir sección (Carritos, Sixes, Vegas)**
Actualmente Foursomes muestra "No hay foursomes configurados" con botón. Se cambiará para que al activar el toggle o expandir la sección vacía, se auto-cree la primera instancia (plantilla vacía). Aplica a:
- **Carritos**: Al hacer toggle ON, crear automáticamente un CarritosTeamBet vacío en `carritosTeams` (eliminar el flujo legacy de `config.carritos` primario)
- **Sixes**: Ya crea instancia al toggle ON — eliminar el bloque "No hay apuestas" y auto-crear al activar
- **Vegas**: Mismo patrón — eliminar bloque vacío
- **Foursomes**: Mismo patrón — al toggle ON, auto-crear un TeamPressuresBet si `bets.length === 0`

**2. Renombrar labels de Wolf timing**
En `ParejasBets.tsx`, líneas ~322-325:
- `"Antes del drive"` → `"Antes del driver"`
- `"Después del drive"` → `"Al pegar el driver"`
- `"Antes del 2° golpe"` permanece igual

También en `WolfDecisionPanel.tsx` (timingLabels, línea ~29):
- A: `"Antes del driver"`
- B: `"Al pegar el driver"`
- C: permanece

**3. Renombrar "Seises" → "Sixes"**
En `ParejasBets.tsx`:
- Título: `"⛳ Seises"` → `"⛳ Sixes"`
- Todos los textos internos: "Seises" → "Sixes"

En `BetDashboard.tsx`:
- Sheet title: `"Configurar parejas · Seises"` → si se mantiene, renombrar. Pero se eliminará (ver punto 5).

**4. Toggle OFF debe colapsar y ocultar contenido**
En `BetSection.tsx`: cuando `enabled` es `false`, forzar `isExpanded` a `false` para que `CollapsibleContent` no se renderice. Cambio en el componente `BetSection`:
- Si `enabled === false`, pasar `open={false}` al `Collapsible` independientemente de `isExpanded`

Además en los `onToggle` handlers de Wolf y Carritos, al desactivar:
- **Wolf**: Colapsar sección al toggle OFF
- **Carritos**: Colapsar sección al toggle OFF
- **Foursomes**: Colapsar sección al toggle OFF

**5. Eliminar sheets de configuración del Dashboard**
En `BetDashboard.tsx`:
- Eliminar el Sheet de "Configurar parejas · Sixes" (~líneas 3011-3065)
- Eliminar el Sheet de "Asignar jugadores · Vegas" (~líneas 3067-3109)
- Eliminar estados `sixesSheetOpen`, `vegasSheetOpen`, `sixesSetsLocal`, `vegasPlayersLocal`
- En los ResultsCards, eliminar props `onConfigureSets` y `onConfigurePlayers` (pasar `undefined` o no pasarlos)
- Los ResultsCards ya tienen guardas de "Participación incompleta" que guían al usuario al setup

**6. Preservar configuración al eliminar jugador**
Ya implementado con las guardas defensivas. El comportamiento actual es correcto: el setup mantiene los IDs de jugadores que siguen en la ronda y deja vacíos los que fueron eliminados, mostrando la advertencia en resultados.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/setup/bets/BetSection.tsx` | Forzar collapse cuando `enabled=false` |
| `src/components/setup/bets/ParejasBets.tsx` | Auto-crear instancia, renombrar timing Wolf, renombrar Sixes, colapsar al desactivar |
| `src/components/bets/WolfDecisionPanel.tsx` | Actualizar `timingLabels` |
| `src/components/bets/BetDashboard.tsx` | Eliminar sheets de config Sixes/Vegas y estados asociados |

### Detalle técnico

**BetSection.tsx** — línea 39:
```tsx
<Collapsible open={enabled === false ? false : isExpanded} onOpenChange={onExpandChange}>
```

**ParejasBets.tsx** — Carritos onToggle:
```tsx
onToggle={(enabled) => {
  onUpdateBet('carritos', { enabled });
  if (enabled) {
    // Auto-create first instance if none exist
    if ((config.carritosTeams || []).length === 0) addCarritosTeam();
    onToggleSection('carritos', true);
  } else {
    onToggleSection('carritos', false);
  }
}}
```

Mismo patrón para Foursomes (auto-crear bet si `bets.length === 0`) y Wolf (colapsar al OFF).

Sixes y Vegas ya crean instancia al toggle ON — solo falta agregar `onToggleSection('sixes', false)` / `onToggleSection('vegas', false)` en el else.

