
Objetivo: corregir la persistencia de `manchaGenerica` y `unidadGenerica` cuando el contador supera 1, para que al refrescar o restaurar la ronda se conserven todas las incidencias y se reflejen igual en avatares, badges e íconos de detalle.

Diagnóstico
- La restauración sí parece estar preparada para reconstruir conteos: `restoreMarkerStateFromRows(...)` suma múltiples filas de `hole_markers` para `manchaGenerica` y `unidadGenerica`.
- El problema más probable está en el guardado concurrente desde `src/pages/Index.tsx`:
  - `updateScore(...)` dispara `saveScoreToDb(...)` en cada click de `+/-`.
  - `saveScoreToDb(...)` hace “delete all manual markers” + “insert current marker rows”.
  - Si el usuario toca rápido dos veces (`1`, luego `2`), ambas escrituras corren en paralelo y la más vieja puede terminar al final, dejando solo 1 fila en DB.
- Eso explica exactamente el síntoma: en UI local se ve bien al momento, pero después de refresh/restaurar solo queda una incidencia.

Plan de implementación
1. Endurecer el guardado de score/markers en `src/pages/Index.tsx`
- Reemplazar el guardado “sin control de orden” por un guardado serializado por `playerId + holeNumber`.
- Mantener una referencia por hoyo/jugador con:
  - último payload pendiente
  - bandera “saving”
  - versión/timestamp incremental
- Asegurar que solo el último estado de `markers` llegue a la base, evitando que una escritura vieja sobreescriba una nueva.

2. Separar claramente el caso de marcadores
- Conservar el `upsert` de `hole_scores`.
- Después, para `hole_markers`, seguir usando `expandMarkerStateToRows(...)`, pero ejecutarlo únicamente dentro del flujo serializado.
- Así, el ciclo `delete + insert` siempre representará el estado final del contador, no un estado intermedio.

3. Revisar los puntos donde se restaura la ronda
- Verificar consistencia entre:
  - `src/hooks/useRoundManagement.ts`
  - `src/hooks/useScorePersistence.ts`
- Mantener `select('hole_score_id, marker_type, is_auto_detected')` en ambos lugares para no perder agregación numérica.
- Si detecto alguna lectura incompleta, la alineo al mismo formato usado por `restoreMarkerStateFromRows(...)`.

4. Validar que la UI consuma el conteo restaurado sin colapsarlo
- Confirmar que las vistas que muestran:
  - badges junto al avatar
  - resumen visual de unidades/manchas
  - detalle de incidencias
  sigan leyendo `score.markers.manchaGenerica` y `score.markers.unidadGenerica` como número.
- No cambiaré el diseño; solo aseguraré que el dato restaurado no se degrade a booleano en ningún punto del flujo.

5. Verificación final
- Probar este caso exacto:
  - marcar 2+ unidades genéricas
  - marcar 2+ manchas genéricas
  - esperar guardado
  - refrescar
  - restaurar ronda
- Confirmar que:
  - el contador numérico se conserva
  - los badges muestran la cantidad correcta
  - los íconos/resúmenes siguen reflejando múltiples incidencias
  - bilateralidad y montos no cambian

Archivos que probablemente tocaré
- `src/pages/Index.tsx` — fix principal del guardado concurrente
- Posible ajuste menor de consistencia en:
  - `src/hooks/useRoundManagement.ts`
  - `src/hooks/useScorePersistence.ts`

Detalles técnicos
- No hace falta cambiar base de datos.
- No hace falta tocar componentes de UI para el bug raíz.
- La causa no parece ser `markerPersistence.ts`, sino una condición de carrera al persistir múltiples clicks rápidos del contador.
