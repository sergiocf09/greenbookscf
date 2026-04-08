

## Matriz de Configuración Rápida para Parejas + Correcciones en Grupal

### Resumen

Tres cambios: (1) crear una matriz de configuración rápida para apuestas de parejas, (2) corregir la alineación de iniciales en las matrices existentes, y (3) agregar Nines a la matriz grupal.

---

### 1. Nueva Matriz de Parejas (`ParejasParticipationMatrix.tsx`)

Crear un nuevo componente similar a `GrupalParticipationMatrix` y `ParticipationMatrix`.

**Filas**: Foursomes, Carritos, Wolf, Sixes, Vegas
**Columnas**: Jugadores (iniciales)

**Lógica de cada fila**:
- El checkbox de fila controla si la apuesta está habilitada (equivale al toggle actual)
- Las celdas individuales controlan si ese jugador participa en esa apuesta
- Al desactivar la fila completa, la sección de configuración detallada abajo se oculta (mismo efecto que toggle OFF)
- Al activar la fila, se auto-crea la primera instancia si no existe (mismo patrón del UX actual)

**Filtrado de jugadores en dropdowns**:
- Cuando un jugador se desmarca de una apuesta en la matriz, ese jugador no aparece en los `<Select>` de asignación de parejas en la configuración detallada de esa apuesta
- Esto se implementa filtrando `playerOptions` en cada card (Foursomes, Carritos, Sixes, Vegas) según los jugadores activos para esa apuesta

**Mapeo de datos por tipo de apuesta**:
| Apuesta | Enabled | Participantes |
|---------|---------|---------------|
| Foursomes | `config.teamPressures.enabled` | Jugadores usados en `teamA`/`teamB` de `bets[]` |
| Carritos | `config.carritos.enabled` | Jugadores en `teamA`/`teamB` |
| Wolf | `config.wolfSetup?.enabled` | Todos los jugadores (Wolf usa todos, 4-6) |
| Sixes | `sixesBets.length > 0` | Jugadores en sets de cada instancia |
| Vegas | `vegasBets.length > 0` | Jugadores en `playerAId`..`playerDId` |

Para simplificar, la columna de jugador en parejas actúa como un filtro: marca qué jugadores están *disponibles* para configurar en esa apuesta. Si un jugador se desmarca, se elimina de los dropdowns y de cualquier asignación existente donde aparezca.

**Ubicación**: Se renderiza al inicio de `ParejasBets.tsx`, antes de las secciones individuales (mismo patrón que en `GrupalBets.tsx` e `IndividualBets.tsx`).

---

### 2. Corregir alineación de iniciales en matrices

En los tres componentes de matriz (`ParticipationMatrix.tsx`, `GrupalParticipationMatrix.tsx`, y el nuevo `ParejasParticipationMatrix.tsx`):

- Cambiar la celda del header (`<th>`) para usar el mismo `min-w` y padding que las celdas de datos (`<td>`)
- Asegurar que el botón de iniciales en el header tenga exactamente las mismas dimensiones (`w-7 h-7`) y centrado que los botones `✓/—` en el cuerpo
- Agregar `mx-auto` consistente en ambos para garantizar alineación vertical perfecta

---

### 3. Agregar Nines a la matriz grupal

En `GrupalParticipationMatrix.tsx`:

- Agregar `{ key: 'nines', label: '5-3-1' }` al array `GRUPAL_BETS`
- El tipo `GrupalBetKey` se amplía para incluir `'nines'`

**Manejo especial**: Nines usa `ninesBets[]` (array de instancias con `playerIds`) en lugar de un objeto con `participantIds`. La función `getParticipantIds` necesita un caso especial:
- Si `betKey === 'nines'`: verificar `config.ninesBets`. Si está vacío → `[]`. Si tiene instancias, unir todos los `playerIds` de todas las instancias como el set de participantes.
- Al hacer toggle de fila para Nines: ON → crear primera instancia con todos los jugadores; OFF → vaciar `ninesBets[]`
- Al toggle celda individual: agregar/remover `playerId` de los `playerIds` de cada instancia de Nines

---

### Archivos a crear/modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/setup/bets/ParejasParticipationMatrix.tsx` | **Nuevo** — Matriz de configuración rápida para parejas |
| `src/components/setup/bets/ParejasBets.tsx` | Importar y renderizar la nueva matriz al inicio; filtrar `playerOptions` según participantes activos |
| `src/components/setup/bets/GrupalParticipationMatrix.tsx` | Agregar Nines al array + lógica especial para `ninesBets` |
| `src/components/setup/bets/ParticipationMatrix.tsx` | Ajustar alineación header vs celdas |

