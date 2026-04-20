

## Dictamen: por qué la app publicada no muestra los cambios

### Causa raíz

La app tiene **PWA con Service Worker activado en producción** (`vite.config.ts` con `VitePWA` + `registerType: "autoUpdate"` + `skipWaiting: true`). El guard en `src/main.tsx` deliberadamente **mantiene el Service Worker activo SOLO en `golfgreenbookscf.com`** y lo desinstala en cualquier otro host. Esto crea dos problemas combinados:

**Problema 1 — Caché de Workbox sirviendo bundles viejos**
La estrategia `NetworkFirst` con `cleanupOutdatedCaches: true` debería actualizar, pero el cache `static-assets-cache-v2` tiene un `networkTimeoutSeconds: 3` muy corto. En redes móviles lentas (4G/datos), el SW responde con la versión vieja del bundle JS antes de que termine la descarga del nuevo, y como JS importa por hash, sigue cargando módulos viejos en cadena.

**Problema 2 — `additionalManifestEntries` con `revision: Date.now()`**
```ts
additionalManifestEntries: [{ url: "/", revision: Date.now().toString() }]
```
Esto hace que **cada build genere un revision diferente para `/`**, lo cual es correcto, PERO Workbox lo precachea. Si el usuario abre la PWA instalada (modo standalone iOS), el SW viejo sigue sirviendo el `/` viejo desde precache hasta que se actualice, y la actualización requiere cerrar TODAS las pestañas/instancias de la app.

**Problema 3 — iOS PWA no libera SW al "desinstalar"**
Cuando borraste la app de la pantalla de inicio en iOS, el Service Worker registrado en Safari **sigue vivo** asociado al origen `golfgreenbookscf.com`. Borrar caché del navegador en iOS no siempre desregistra SWs de PWAs ya instaladas previamente. Por eso ves la versión vieja incluso después de "limpiar todo".

### Por qué el preview/desarrollo sí funciona

El guard en `main.tsx` desregistra SW y borra caches en cualquier host que NO sea `golfgreenbookscf.com`. Por eso preview y `greenbookscf.lovable.app` siempre muestran lo último.

---

## Plan de solución

### Cambio 1 — `src/main.tsx`: forzar actualización al detectar SW viejo

Agregar lógica que, en producción (`golfgreenbookscf.com`), escuche el evento `controllerchange` del SW y haga `window.location.reload()` automático cuando detecte que un nuevo SW tomó control. Esto hace que el primer load tras un deploy muestre la versión vieja por ~1 segundo y luego recargue sola con la versión nueva.

### Cambio 2 — `vite.config.ts`: subir el timeout y endurecer el caché

- Cambiar `networkTimeoutSeconds: 3` → `10` en `static-assets-cache-v2` para dar tiempo a descargar bundles nuevos en redes lentas.
- Eliminar `additionalManifestEntries` con `Date.now()` (genera precache problemático del HTML root).
- Cambiar el handler del `document` request a `NetworkFirst` con timeout corto pero **sin precache del root**, así el HTML siempre se valida contra red.
- Renombrar el cache a `static-assets-cache-v3` para forzar invalidación total del cache viejo en dispositivos con la versión actual.

### Cambio 3 — Mecanismo de "kill switch" de emergencia

Agregar al inicio de `main.tsx` (solo en `golfgreenbookscf.com`) un check de versión: si `localStorage.appVersion` no coincide con una constante hardcodeada en el bundle, desregistrar SW + borrar caches + recargar. Esto te da un botón rojo: cada vez que necesites garantizar que TODOS los usuarios reciban una versión nueva sí o sí, incrementas la constante `APP_VERSION` y se autolimpia en todos los dispositivos al primer load.

### Cambio 4 — Acción inmediata para tu dispositivo (manual, no requiere código)

Mientras se publican los cambios anteriores, en tu iPhone:
1. Safari → Ajustes → Avanzado → Datos de sitios web → buscar `golfgreenbookscf.com` → Eliminar.
2. Esto SÍ desregistra el SW (a diferencia de borrar historial general).
3. Recarga la app.

### Archivos a modificar

- `src/main.tsx` — agregar listener `controllerchange` + version kill switch
- `vite.config.ts` — ajustar workbox config (timeout, cache name, quitar `additionalManifestEntries`)

### Resultado esperado

- Tras publicar este fix una sola vez, los próximos deploys serán visibles en máximo 1 recarga (el SW detecta nueva versión, toma control, dispara recarga automática).
- El kill switch queda disponible para forzar updates urgentes incrementando `APP_VERSION`.
- El cache viejo `static-assets-cache-v2` se elimina automáticamente al cambiar a `v3`.

