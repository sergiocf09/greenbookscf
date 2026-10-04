# Orden personalizable y diálogo de grupos de amigos

## Resultado
- Permitir reordenar los grupos directamente con el dedo o mouse, moviéndolos arriba o abajo.
- Guardar el orden elegido por cada usuario y respetarlo tanto en Amigos como al agregar jugadores a una ronda.
- Ajustar las tres pestañas del diálogo para que “Buscar jugadores” siempre se vea completo en móvil, reduciendo el espacio de “Grupos”.
- Completar las traducciones al inglés de todos los textos nuevos de grupos, confirmaciones, estados y errores.

## Implementación
- Añadir una posición persistente a cada grupo y devolver los grupos en ese orden desde Lovable Cloud.
- Incorporar arrastre táctil accesible en la lista de grupos, con un control visual específico para mover cada fila y actualización inmediata del orden.
- Exponer en el hook una operación para guardar el orden completo sin alterar nombres, emojis ni integrantes.
- Dar anchos proporcionales a las pestañas y tamaños de texto móviles que eviten recortes.
- Traducir también los mensajes del hook para que los avisos respeten el idioma seleccionado.

## Verificación
- Comprobar en móvil que las tres pestañas caben sin cortes.
- Crear varios grupos, reordenarlos, cerrar/reabrir el diálogo y confirmar que el orden permanece.
- Confirmar que el mismo orden aparece al agregar amigos a una ronda.
- Revisar la pantalla en español e inglés y validar compilación y errores visibles.
