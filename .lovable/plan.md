# Premios dentro de la configuración del torneo

## Qué pasa hoy
- En torneos de un día, la sección de Premios aparece abajo, después de la tabla de posiciones; si aún no hay jugadores, queda escondida al fondo y no se nota.
- En torneos multidía, Premios es una pestaña más junto a "Día 1, Día 2…", que solo se ve cuando ya hay tabla con rondas vinculadas.
- La configuración del torneo (lápiz/engrane) no menciona premios, así que el organizador no sabe dónde buscarlos.

## Cambios propuestos
1. **Configuración del torneo**: dentro de "Editar configuración" (día y multidía) agregar una sección **Premios** con un resumen corto (bolsas, total repartido, estado Borrador / En vivo / Final) y el botón **Configurar premios**, que abre el mismo configurador actual.
2. **Al crear el torneo**: después de guardarlo, mostrar un aviso "¿Quieres configurar premios ahora?" con **Configurar** o **Después**. Se puede hacer sin jugadores ni rondas.
3. **Acceso directo visible**: en el encabezado del torneo, junto a jugadores y modalidad, mostrar un chip **Premios** para el creador. Si todavía no hay premios, dirá "Agregar premios"; si ya hay, mostrará el estado.
4. **Vista de resultados**: la sección de premios sigue existiendo, con estas reglas:
   - En torneos de un día, se mueve arriba de la tabla como tarjeta plegable.
   - En multidía, la pestaña Premios aparece desde el inicio para el creador, aunque no haya rondas, con el texto "Los resultados aparecerán al vincular rondas".
5. Los participantes siguen viendo los premios solo cuando están "En vivo" o "Final". No cambia el cálculo ni el congelado.

## Detalles técnicos
- Reutilizar `PrizeSetupDialog` y `useLeaderboardPrizes`; sin migraciones ni cambios en el motor, en las posiciones ni en `rules_json`.
- `EditLeaderboardConfigDialog` / `EditMultiDayConfigDialog` reciben un `onOpenPrizes` y el resumen de premios.
- Hacer que la pestaña de premios en multidía no dependa de que existan días con tabla; ajustar la regla que regresa a "all".
- Agregar traducciones ES/EN y verificar en el navegador móvil: torneo nuevo sin rondas → configurar premios desde Configuración y desde el chip.
