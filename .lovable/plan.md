

## Plan: Rediseñar ícono PWA — Solo medallón circular sobre fondo blanco

### Objetivo
Eliminar el texto "GreenBook" del ícono PWA, dejando únicamente el medallón circular (el logo con la pelota de golf, "TU RONDA. TUS APUESTAS.") centrado y más grande sobre un fondo blanco sólido.

### Cambios

1. **Procesar los íconos PWA con Python/Pillow**
   - Usar el asset circular existente (`src/assets/greenbook-icon-circle-light.png`) como fuente del medallón
   - Crear un canvas cuadrado con fondo blanco (`#FFFFFF`)
   - Centrar el medallón circular ocupando ~85-90% del canvas para maximizar tamaño
   - Generar: `pwa-icon-192.png`, `pwa-icon-512.png` (fondo blanco, propósito "any")
   - Generar: `pwa-icon-maskable-192.png`, `pwa-icon-maskable-512.png` (fondo blanco, medallón al ~75% para safe zone)
   - Regenerar `apple-touch-icon.png` (180x180) con el mismo diseño

2. **Actualizar `manifest.json`**
   - Cambiar `background_color` a `#FFFFFF` para consistencia con el fondo blanco del ícono

3. **Sin cambios en el código de la app** — solo assets y manifest.

### Resultado esperado
Un ícono limpio: fondo blanco con el medallón verde/dorado centrado y grande, sin texto "GreenBook" debajo, con buen contraste en cualquier launcher Android/iOS.

