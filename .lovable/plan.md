

## Dashboard: Mostrar solo apuestas habilitadas y validar configuración

### Problema
Las cards de Wolf, Sixes, Vegas y Nines aparecen en el BetDashboard si existen en la BD (`hook.isActive`), sin importar si el toggle en el setup está desactivado. Además, cuando el toggle está activo pero faltan jugadores por configurar, no hay indicación clara.

### Cambios

**1. Condicionar renderizado al `enabled` del betConfig (`BetDashboard.tsx`, líneas 2957-2997)**

Agregar verificación del flag `enabled` en el `effectiveBetConfig`:

- **Wolf** (línea 2958): `wolfHook?.isActive && wolfHook.wolfConfig && effectiveBetConfig.wolfSetup?.enabled !== false`
- **Sixes** (línea 2969): `sixesHook?.isActive && sixesHook.sixesConfig && (effectiveBetConfig.sixesBets ?? []).some(b => b.enabled !== false)`  
  — Si `sixesBets` no existe o está vacío, no se muestra
- **Vegas** (línea 2979): `vegasHook?.isActive && vegasHook.vegasConfig && (effectiveBetConfig.vegasBets ?? []).some(b => b.enabled !== false)`
- **Nines** (línea 2989): `ninesHook?.isActive && ninesHook.ninesConfig && (effectiveBetConfig.ninesBets ?? []).some(b => b.enabled !== false)`

**2. Validar configuración de jugadores en cada ResultsCard**

Los guards de "Participación incompleta" ya existen en cada card (del fix anterior). Estos detectan jugadores faltantes. Sin embargo, también deben cubrir el caso de "no se han asignado jugadores aún" (IDs vacíos):

- **SixesResultsCard**: Si algún set tiene `team1` o `team2` con strings vacíos `''`, mostrar warning "Falta configurar jugadores"
- **VegasResultsCard**: Si `playerAId`, `playerBId`, `playerCId` o `playerDId` son strings vacíos, mostrar warning
- **NinesResultsCard**: Si `playerIds` está vacío o tiene menos de 3 entries, mostrar warning
- **WolfResultsCard**: Ya valida por número mínimo de jugadores

El mensaje será: "⚠️ Falta configurar jugadores — revisa la configuración de esta apuesta en la sección de Apuestas."

**3. Renombrar "Seises" → "Sixes" en SixesResultsCard**

Buscar y reemplazar las ocurrencias restantes de "Seises" en `SixesResultsCard.tsx`.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/bets/BetDashboard.tsx` | Agregar check de `enabled` en condiciones de render de Wolf/Sixes/Vegas/Nines |
| `src/components/bets/SixesResultsCard.tsx` | Guard para sets sin jugadores + renombrar "Seises" |
| `src/components/bets/VegasResultsCard.tsx` | Guard para player IDs vacíos |
| `src/components/bets/NinesResultsCard.tsx` | Guard para playerIds vacíos/insuficientes |

