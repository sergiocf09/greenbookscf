# Campos de golf: búsqueda primero en GreenBook, descarga solo si hace falta

## Diagnóstico

El diseño original sí funciona en lo esencial: cuando alguien descarga un campo, queda guardado de forma **compartida** y visible para todos los usuarios registrados (los campos descargados no son privados; solo los campos "manuales" quedan restringidos a quien los creó y a los invitados de su ronda). Hoy hay 45 campos: 35 descargados, 7 oficiales y 3 manuales.

Pero la experiencia empuja al usuario a descargar de nuevo:

1. **La lista de campos no tiene buscador.** Es un desplegable que solo muestra tus campos marcados como visibles, con un enlace "Ver todos los campos". Para encontrar un campo que otro usuario ya descargó hay que abrir la lista completa y bajar a mano. Es más fácil apretar "Buscar", que va directo al servicio externo.
2. **La búsqueda "Buscar" ignora los campos que ya están en GreenBook.** Consulta siempre al servicio externo y muestra todos los resultados con el icono de descarga, sin avisar cuáles ya están disponibles en la app. Cada búsqueda consume una consulta del servicio, aunque el campo ya exista.
3. **Nada le dice al usuario "este campo ya está en GreenBook".** Al tocar un resultado ya existente, la app lo reutiliza correctamente por dentro, pero el mensaje que ve es "importado", como si se hubiera descargado.
4. **Un campo ya descargado no se agrega a tus campos visibles.** Si el campo ya estaba en la base, el proceso termina antes de marcarlo como visible para ti, así que vuelve a costar encontrarlo la próxima vez.
5. **Sí se están creando duplicados.** Verificado en la base: "San Gil" y "Zibata" están dos veces, porque el servicio externo cambió el formato de su identificador (antes numérico, ahora alfanumérico) y el control de duplicados solo compara ese identificador. "Malanquin" y "Alamo Country Club" están duplicados entre un campo oficial y su versión descargada.

Conclusión: no hay una fuga grave de consultas por reimportar el mismo campo (eso ya se reutiliza), pero sí hay consultas evitables al servicio externo por falta de búsqueda local, y sí hay duplicados reales.

## Qué se va a hacer

### 1. Buscador dentro de la lista de campos
Agregar un campo de texto arriba de la lista para filtrar por nombre y ciudad entre todos los campos ya disponibles en GreenBook, con tus campos visibles primero y el resto abajo bajo el título "Otros campos en GreenBook". Así la lista completa deja de ser un problema y el usuario encuentra sin descargar nada.

### 2. La búsqueda externa arranca por lo local
Al escribir en "Buscar":
- Primero se muestran los campos que **ya están en GreenBook** que coinciden, con la etiqueta "Ya en GreenBook" y el botón "Usar este campo" (sin icono de descarga, sin consulta externa).
- La consulta al servicio externo solo se dispara si no hay coincidencias locales suficientes, o cuando el usuario toca "Buscar en el catálogo mundial". Eso corta la mayoría de las consultas evitables.
- Los resultados externos que ya existen en GreenBook se marcan igual como "Ya en GreenBook" en vez de ofrecer descarga.

### 3. Mensajes claros
- Campo ya existente: "Este campo ya estaba en GreenBook, lo agregamos a tus campos" (en lugar de "importado").
- Campo nuevo: "Campo descargado y disponible para todos".
- Texto de ayuda en la pantalla: los campos descargados quedan guardados para toda la aplicación, no hay que volver a descargarlos.

### 4. Marcar como visible siempre
Tanto si el campo se descarga como si ya existía, queda agregado a tus campos visibles para que aparezca de inmediato en la lista.

### 5. Evitar nuevos duplicados
Antes de descargar, comparar también por nombre + ciudad (no solo por identificador del servicio). Si ya existe un campo equivalente, se reutiliza en lugar de crear otro.

### 6. Duplicados actuales
Dejar la limpieza de "San Gil", "Zibata", "Malanquin" y "Alamo Country Club" como paso aparte: hay rondas históricas apuntando a esos campos, así que primero reviso a cuál apunta cada ronda y te confirmo antes de unir o esconder alguno. No se borra nada en este cambio.

## Detalle técnico

- `src/components/setup/CourseSelect.tsx`: agregar input de filtro sobre `courses` de `useGolfCourses` (filtro por `name` + `location`), secciones favoritos / otros, y conservar el comportamiento de `showAll`.
- `src/components/courses/CourseSearchDialog.tsx`: nueva etapa local. Recibir la lista local (vía `useGolfCourses` o prop) y filtrarla antes de llamar a `search()`; botón explícito para la búsqueda externa; render distinto para resultados ya presentes (`Ya en GreenBook` + `onImported(localId)` directo).
- `src/hooks/useCourseSearch.ts`: exponer un `matchLocal(query)` y hacer que `importCourse` devuelva también `cached`/`redirected` para que el diálogo elija el mensaje correcto.
- `supabase/functions/golf-course-proxy/index.ts` (acción `import`): además del match por `source_course_key`, buscar por `lower(name)` + ciudad antes de llamar al detalle de la API; mover el `upsert` de `course_favorites` para que corra también en la rama `cached`/`redirected`.
- Sin cambios de esquema ni de políticas de acceso; `golf_courses` con `is_manual = false` ya es legible por todos los usuarios autenticados.
