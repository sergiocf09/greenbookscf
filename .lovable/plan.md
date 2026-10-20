# Reel v4: apuestas y balances de una ronda, más pausado y con zoom

## Objetivo
Rehacer el reel vertical (1080×1920) de apuestas y balances. Debe verse claro y pausado, con zoom sobre cada parte que se toca, y conservar la marca verde, nombres ficticios, música instrumental y pitidos.

## Correcciones a la versión anterior
- Inicio: el gancho se queda fijo en pantalla de 3 a 4 s. Se quita la pantalla que aparecía y desaparecía enseguida.
- Cada clic sigue la misma secuencia: zoom hacia el botón (lápiz o flechita), un indicador de toque, una pausa, el diálogo que se abre, una pausa para leerlo y un zoom out al teléfono completo.
- El ejemplo de Foursomes usa cifras moderadas y pocas presiones, para que el detalle se lea limpio y sin números enormes.

## Guion (aprox. 75–90 s)
1. **Gancho** (fijo): "¿Quién va ganando y cuánto? GreenBook lo sabe al instante."
2. **Apuestas generales para todos**: en la matriz de apuestas se activan Presiones individuales, Oyeses y Unidades, con zoom a cada interruptor.
3. **Parejas**: en la misma matriz se activa Foursomes y se genera la primera apuesta de parejas.
4. **Ajuste individual**: zoom al lápiz de una bilateralidad, toque, se abre el cuadro de importe, se cambia el monto, se guarda y zoom out.
5. **Detalle de Foursome**:
   - Zoom al renglón único con Front, Back y Total.
   - Toque a la flechita, que abre los hoyos de la pareja.
   - Toque a un hoyo, que abre el detalle de cómo se formó ese hoyo.
6. **Ronda capturada hasta el hoyo 17**: se abre la hoja de balances con zoom moderado a uno o dos jugadores. Ejemplo: "Pedro +$400".
7. **Captura del hoyo 18**: Pedro hace birdie y se confirma el hoyo.
8. **Balances otra vez**: el mismo zoom muestra que Pedro pasa de +$400 a +$550, con un pitido. Luego zoom out a todos los jugadores: quién gana y quién pierde.
9. **Cierre**: la imagen para compartir por WhatsApp y el correo de resultados (recreados con nombres ficticios y totales iguales), más una invitación a armar la ronda.

## Cómo se produce
- Se usa una ronda de prueba ficticia en tu cuenta, con cuatro jugadores inventados y el score cargado hasta el hoyo 17.
- No se envía ningún correo ni mensaje. La ronda se elimina al terminar.
- Se graban las pantallas reales de la app. Encima se agregan el zoom, los indicadores de toque, los textos cortos que explican cada paso y las pausas.
- Se entregan dos versiones: con música y pitidos, y solo pitidos (para poner música desde Instagram). La velocidad ya queda pensada para leer, sin tener que ralentizar después.
- Se revisa cuadro por cuadro en cada clic, para que no haya pantallas que aparezcan y desaparezcan ni cortes.

## Detalles técnicos
- La grabación se hace en la app local con la sesión de Sergio. La ronda ficticia se crea desde la propia pantalla de setup.
- La edición (zoom, cursor, textos, audio) se hace en una composición de video. El archivo de salida va en /mnt/documents/ads/videos/ con el nombre greenbook_reel_balances_ronda_v4.
