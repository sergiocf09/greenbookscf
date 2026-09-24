# Selector Español / Inglés — diagnóstico y complejidad

## Diagnóstico
- Hoy la app no tiene ningún sistema de idiomas: todo el texto está escrito directamente en español dentro de ~310 archivos (~91 mil líneas).
- Estimado: 3,500–4,500 textos visibles (botones, títulos, avisos, tooltips, errores, ayuda, correos).
- La ayuda (cajón de ayuda) es un archivo con ~15 mil caracteres de explicaciones de apuestas.
- También hay texto en español fuera de pantalla: correos de cierre de ronda, mensajes de error del servidor, imágenes compartidas, fechas y meses ("Ago 26"), formato de dinero.

## Grado de complejidad: ALTO (en volumen), BAJO (en riesgo técnico)
- No cambia cálculos ni datos; solo textos. El riesgo es olvidar textos o romper un texto que la lógica usa para comparar.
- Esfuerzo estimado: 8–12 sesiones de trabajo, por fases.

## Fases propuestas
1. Base: selector ES/EN en el menú de perfil, guardado por usuario; fechas y meses en el idioma elegido.
2. Pantallas principales: inicio, configuración de ronda, captura de scores, bet dashboard.
3. Apuestas: configuración y detalle bilateral de cada apuesta.
4. Ayuda completa, historial, estadísticas, rankings, leaderboards, Teams Cup.
5. Correos, imágenes compartidas, términos y privacidad (legal requiere revisión humana).

## Nombres de apuestas — propuesta (confirmar o corregir)
| Español | Propuesta inglés |
|---|---|
| Medal | Medal |
| Presiones | Presses |
| Match Play | Match Play |
| Bloques | Blocks |
| Skins | Skins |
| Caros | High-Stakes Holes (?) |
| Oyes / Oyeses | Closest to the Pin (?) |
| Unidades | Units / Dots (?) |
| Manchas | Blots / Marks (?) |
| Culebras | Snakes |
| Pingüinos | Penguins (?) |
| Rayas | Rayas / Stripes (?) |
| Carritos | Carts / Team Carts (?) |
| Coneja | Rabbit |
| Zoológico | Zoo / Animals |
| Loba | Wolf |
| Sixes, Vegas, Nines | Sin cambio |
| Parejas / Foursomes | Pairs / Foursomes |
| Sliding | Sliding (?) |
| Cruzar tarjeta | Cross Match (?) |

Los marcados (?) necesitan tu decisión: ¿traducimos o dejamos el nombre en español como marca propia?

## Detalles técnicos
- Librería i18next + react-i18next; archivos `es.json` / `en.json` por módulo.
- Idioma guardado en el perfil (columna nueva) y en el navegador.
- Textos usados en comparaciones lógicas (tipos de apuesta del ledger) se mantienen como claves internas; solo cambia la etiqueta mostrada.
- Fechas con `date-fns` locale; dinero con `Intl.NumberFormat`.
