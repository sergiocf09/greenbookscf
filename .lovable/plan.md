
Diagnóstico de Loba

1. Hallazgo principal: el problema no está en “faltan jugadores” como causa real general.
   - Revisé el flujo completo: setup → sync en `Index.tsx` → `useWolf` → panel en `ScoringView` → `WolfResultsCard`.
   - La configuración actual de la ronda sí existe y está activa:
     - `betConfig.wolfSetup.enabled = true`
     - `wolf_config` sí tiene `player_order` y `participant_ids`
   - El bloqueo del dashboard viene de datos inconsistentes en `wolf_hole_state`, no de que la apuesta esté deshabilitada.

2. Causa exacta de que no aparezca en el dashboard
   - `WolfResultsCard` calcula `missingPlayerIds` a partir de los `wolf_player_id` y `partner_ids` guardados en `wolf_hole_state`.
   - En la ronda actual hay hoyos guardados con jugadores que no pertenecen al match actual de Loba:
     - Hoyo 2: `wolf_player_id = 6669...` (Cynthia Alanis)
     - Hoyo 5: `wolf_player_id = dc1e...` (Alejandro Saucedo Urbina)
     - Hoyo 10: `wolf_player_id = dc1e...`
     - Hoyo 15: `wolf_player_id = dc1e...`
   - Pero `wolf_config.participant_ids` de esa ronda solo contiene 4 jugadores:
     - Fernando Ocampo
     - Sergio Cruz Delfin
     - Sergio Cruz Fernández
     - Sergio Pizarro
   - Resultado: `WolfResultsCard` entra al estado de alerta “Agregar jugadores faltantes” y no renderiza los resultados.

3. Causa exacta de que en algunos hoyos no aparezca la plantilla/panel de selección
   - En `ScoringView.tsx` el jugador Loba del hoyo se calcula así:
     - primero usa `betConfig.wolfSetup.playerOrder`
     - si no, usa `displayPlayers[(currentHole - 1) % displayPlayers.length]`
   - Ese cálculo usa el estado local de setup, no la fuente persistida de `wolfHook.wolfConfig.participantIds/playerOrder`.
   - Además usa `displayPlayers`, no la lista real filtrada de participantes de Loba.
   - Si el orden local quedó viejo, o si hubo cambios de participantes/matriz, algunos hoyos pueden apuntar a IDs que ya no están en `displayPlayers`.
   - En `WolfDecisionPanel`, si `wolfPlayerId` no existe dentro de `players`, hace `return null`.
   - Eso explica exactamente por qué “desaparece” el panel en hoyos como 2, 5, 10 y 15: el hoyo sí tiene un Wolf asignado, pero es un jugador ajeno a la lista visible/activa, entonces el panel no se pinta.

4. Dictamen funcional profundo
   - Setup:
     - El sorteo y persistencia de `playerOrder` sí existen.
     - La matriz de parejas ya es la fuente de participantes para Loba.
   - Sync:
     - `Index.tsx` ya guarda `participantIds` y `playerOrder` en `wolf_config`.
     - Ese tramo hoy no parece ser el fallo principal.
   - Captura por hoyo:
     - El panel depende de una resolución local del Wolf que no está anclada a la configuración persistida real de la ronda.
     - Ahí está la ruptura más importante de UX y consistencia.
   - Persistencia de hoyos:
     - La tabla `wolf_hole_state` ya tiene registros contaminados/obsoletos de jugadores ajenos al match.
     - No existe hoy una limpieza/validación para impedir que se guarden o sobrevivan decisiones con IDs fuera de `participantIds`.
   - Dashboard:
     - La tarjeta sí está condicionada correctamente por `wolfSetup.enabled === true`.
     - Pero queda anulada por el guard de `missingPlayerIds`, que hoy se activa por datos corruptos o desfasados.

5. Problemas secundarios detectados
   - `onWolfDecision` en `Index.tsx` usa `wolf.getCurrentWolfId(holeNumber)` para guardar, mientras `ScoringView` calcula por su cuenta otro `effectiveWolfId`.
   - O sea: el panel visual y el guardado no necesariamente usan la misma fuente.
   - Eso puede permitir que el usuario vea/espere un Wolf y se guarde otro.
   - También hay una advertencia de React en `WolfDecisionPanel` por uso de `Badge` con refs, pero eso es visual/técnico; no explica el fallo principal.

Solución propuesta

Fase 1 — Corregir la lógica fuente de verdad
1. En `ScoringView.tsx`, dejar de resolver el Wolf con `betConfig.wolfSetup.playerOrder` y `displayPlayers`.
2. Resolver el Wolf usando exclusivamente:
   - `wolfConfig.participantIds`
   - `wolfConfig.playerOrder`
   - y como fallback solo participantes activos de Loba, no todos los jugadores del grupo.
3. El panel debe siempre basarse en la misma fuente que usa `useWolf.saveDecision`.

Fase 2 — Unificar render y guardado
1. Pasar desde `Index.tsx` el `wolfId` real del hook o una función única de resolución.
2. Evitar que `ScoringView` calcule una cosa y `onWolfDecision` guarde otra.
3. La regla debe ser: un solo resolvedor de Wolf por hoyo en toda la app.

Fase 3 — Blindar integridad de datos
1. Antes de guardar una decisión en `useWolf.saveDecision`, validar:
   - `wolfPlayerId` pertenece a `wolfConfig.participantIds`
   - `partnerIds` también pertenecen a `wolfConfig.participantIds`
   - `partnerIds` no incluyen al propio Wolf
2. Si la matriz cambia o cambia `participantIds`, limpiar o invalidar estados de hoyo incompatibles.
3. En el dashboard, filtrar o marcar como inválidos los `wolf_hole_state` fuera de `participantIds` en lugar de mostrar el mensaje genérico.

Fase 4 — Reparación de datos ya dañados
1. Hacer una migración/repair lógica para la ronda actual:
   - localizar `wolf_hole_state` con `wolf_player_id` o `partner_ids` fuera de `wolf_config.participant_ids`
   - eliminar o resetear esos hoyos inválidos
2. Esto es importante porque aunque corrijamos el código, la ronda abierta seguirá rota si esos registros persisten.

Fase 5 — Ajustar el mensaje del dashboard
1. Reemplazar el mensaje genérico “Agregar jugadores faltantes”.
2. Mostrar algo específico:
   - “La configuración guardada de Loba contiene decisiones con jugadores fuera del match actual.”
3. Mejor aún: si se implementa la limpieza automática, evitar mostrar ese estado y reparar silenciosamente.

Implementación concreta sugerida

Archivos a tocar
1. `src/components/scoring/ScoringView.tsx`
   - reemplazar la resolución de `regularWolfPlayerId`
   - usar participantes reales de Loba
   - asegurar que el panel no dependa de `displayPlayers` completo cuando Loba es subconjunto
2. `src/pages/Index.tsx`
   - unificar la fuente del Wolf del hoyo con la usada por `saveDecision`
3. `src/hooks/useWolf.ts`
   - agregar validación fuerte antes de `upsert`
   - opcionalmente exponer helper de participantes válidos / Wolf por hoyo
4. `src/components/bets/WolfResultsCard.tsx`
   - cambiar el manejo de datos inválidos del dashboard
   - usar `participantIds` como autoridad y detectar estados corruptos de forma explícita
5. `supabase/migrations/...`
   - script de saneamiento para `wolf_hole_state` inválidos
   - opcionalmente constraint lógica adicional vía trigger o limpieza controlada desde app

Resumen del dictamen
- Sí hay un problema real de diseño lógico.
- No es que “la loba no despliegue porque falten jugadores” en abstracto.
- El problema real es una desincronización entre:
  - participantes persistidos,
  - orden persistido,
  - cálculo local del Wolf por hoyo,
  - y registros viejos/contaminados en `wolf_hole_state`.
- Los hoyos 2, 5, 10 y 15 faltan porque el panel intenta renderizar un Wolf que no pertenece al conjunto actual visible/activo.
- El dashboard no aparece porque detecta IDs ajenos al match en los estados guardados y entra en el warning genérico.

Plan de corrección recomendado
1. Hacer a `wolf_config` la única fuente de verdad.
2. Unificar resolución del Wolf entre panel y guardado.
3. Validar que ningún `wolf_hole_state` pueda guardar IDs fuera de `participantIds`.
4. Limpiar los registros contaminados de la ronda actual.
5. Ajustar el warning del dashboard para que deje de ser genérico y, idealmente, desaparezca con la reparación automática.

Detalles técnicos
- Ronda inspeccionada: la más reciente en progreso.
- `wolf_config` está bien poblada con 4 participantes y orden válido.
- `wolf_hole_state` contiene hoyos con IDs ajenos al match actual.
- Esos IDs ajenos son la causa directa tanto del panel ausente en ciertos hoyos como de la no aparición del resultado en dashboard.
- El warning de React sobre `Badge` no es la causa funcional principal.

Si apruebas, el siguiente paso correcto sería implementar:
1. saneamiento de datos inválidos,
2. unificación del resolvedor de Loba,
3. validación para que no vuelva a pasar.
