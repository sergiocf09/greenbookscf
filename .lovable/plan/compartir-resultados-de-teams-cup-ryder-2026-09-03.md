# Compartir resultados de Teams Cup (Ryder)

## Dictamen: qué se ve hoy y qué pasa al cerrar el día 1

Cómo funciona hoy, verificado en el código y en la función del backend que calcula cada match:

- El resultado de cada match se calcula **en vivo** a partir de los hoyos **confirmados** de la ronda vinculada. No se guarda como historia.
- Cuando el organizador **cierra** la ronda del día 1, los scores de esa ronda quedan bloqueados por el backend (no se pueden modificar). Por eso el resultado del día 1 queda de hecho **inamovible**: seguirá calculándose igual siempre, y solo cambiaría si el creador aplica un resultado manual (override).
- Con **Día 1** seleccionado se ven los matches del día 1 y su marcador parcial. Con **Día 2** seleccionado se ven los del día 2 (hoy sin scores, "Pendiente").
- Con **Total** seleccionado hoy se listan **todos los matches de todos los días juntos**, sin separación, agrupados solo por grupo de juego. El marcador grande es el acumulado (día 1 cerrado + día 2 en vivo).

## Cambio 1: vista "Total" más clara

Con **Total** seleccionado:
- Se muestra el marcador acumulado grande (equipo A – equipo B) y su barra de progreso, como hoy.
- **Ya no se lista cada match.** En su lugar, un desglose compacto por día/sesión: nombre del día, puntos de cada equipo en ese día, y una etiqueta de estado ("Cerrado" / "En juego" / "Pendiente").
- Cada fila del desglose es tocable y lleva a ese día (equivale a tocar su chip).
- La lista completa de matches se sigue viendo al seleccionar un día concreto (agrupada por grupo de juego, como ya funciona).

## Cambio 2: botón de compartir en la fila de días

- Se agrega un botón de compartir al **extremo derecho** de la fila de chips (Total / Día 1 / Día 2), fijo y siempre visible aunque la fila haga scroll horizontal.
- **Habilitado** cuando la selección es compartible:
  - Día concreto: solo si su ronda vinculada está **cerrada**.
  - Total: si **al menos un día** está cerrado; los días aún no cerrados se marcan como "En juego" en la imagen y sus puntos no se presentan como definitivos.
- **Deshabilitado** en caso contrario, con mensaje: "Disponible cuando el organizador cierre la ronda".

## Cambio 3: imagen para compartir de la Ryder

Nueva imagen vistosa, con el mismo estilo y flujo que la de cierre de ronda tradicional (verde Augusta + dorado, marca GreenBook, compartir nativo a WhatsApp con descarga de respaldo):

- Encabezado: nombre de la competencia, campo y fecha, y qué se está compartiendo ("Total acumulado" o el día/sesión).
- Marcador central grande con nombres y colores de los dos equipos, y barra de puntos.
- Desglose por día cuando se comparte el Total (puntos por día + estado).
- Lista de todos los matches de la selección: jugadores de cada lado (nombre corto), resultado del match (ej. "3&2", "AS", "En juego") y a qué lado favorece; separadores por grupo de juego.
- Pie con la marca y golfgreenbookscf.com.

## Detalles técnicos

- `src/components/leaderboards/TeamsCupDetailInline.tsx`: en la vista Total, sustituir la lista de matches por el desglose por slot usando `cup.standingsBySlot`; añadir el botón de compartir junto a los chips con el gating de cierre.
- Estado de cierre por día: derivarlo del `status` de la ronda vinculada a los matches de ese slot (`rounds.status = 'completed'`), consultado en `src/hooks/useTeamsCup.ts` y expuesto como `slotClosedMap` / helper `isSlotClosed(key)`.
- Nuevo componente `src/components/leaderboards/TeamsCupShareImage.tsx`: canvas 1080px de ancho con alto dinámico según número de matches, reutilizando el patrón de `src/components/share/RoundShareImage.tsx` (preview en diálogo, `navigator.share` con archivo, fallback a descarga).
- Los datos de matches y resultados vienen de `cup.matches` + `cup.results` y del orden por grupo ya existente (`cup.getMatchGroupNumber`), sin nuevas consultas ni cambios de esquema.
- Sin migraciones de base de datos ni cambios en la lógica de cálculo de puntos.
