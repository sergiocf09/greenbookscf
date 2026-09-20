&nbsp;

&nbsp;

# Zibatá: corregir las ventajas (hándicap de hoyo) con la tarjeta actualizada

## Comparación tarjeta vs. aplicación

Los pares coinciden hoyo por hoyo (36 + 36 = 72) y los ratings/slopes por tee también coinciden exactamente con la tarjeta (Negras 75.1/140, Azules 72.6/133, Blancas 69.9/127, Amarillas 67.9/123, Rojas 71.4/134 — la tarjeta muestra 74.1 en Rojas; ver duda abajo).

Lo que no coincide son las **ventajas**: 12 de los 18 hoyos están distintos.


| Hoyo | Tarjeta | App hoy |
| ---- | ------- | ------- |
| 1    | 13      | 9       |
| 2    | 3       | 5       |
| 3    | 7       | 11      |
| 4    | 9       | 3       |
| 5    | 15      | 15      |
| 6    | 17      | 17      |
| 7    | 11      | 7       |
| 8    | 1       | 1       |
| 9    | 5       | 13      |
| 10   | 14      | 8       |
| 11   | 10      | 18      |
| 12   | 2       | 2       |
| 13   | 8       | 14      |
| 14   | 16      | 10      |
| 15   | 18      | 16      |
| 16   | 4       | 4       |
| 17   | 12      | 12      |
| 18   | 6       | 6       |


Efecto práctico: en Zibatá los golpes de ventaja se están asignando a hoyos equivocados, así que los netos y las apuestas con hándicap salen mal (por ejemplo el hoyo 9 debería recibir golpe muy pronto y hoy casi al final; el 11 recibe golpe temprano en la tarjeta y hoy es el último).

Además la aplicación no tiene cargadas las yardas de ningún tee en Zibatá (están vacías), mientras la tarjeta las trae completas.

## Qué se va a hacer

1. **Actualizar las ventajas de los 18 hoyos** de Zibatá a los valores de la tarjeta.
2. **Cargar las yardas por tee** (negras, azules, blancas, amarillas, rojas) de los 18 hoyos, tal como vienen en la tarjeta.
3. Aplicar lo mismo a **las dos copias de Zibatá** que existen hoy en la base (una de julio con 1 ronda y otra de agosto con 3 rondas), para que cualquier ronda futura quede correcta sin importar cuál se elija.
4. **No se toca nada de las 4 rondas ya cerradas** de Zibatá: cada ronda cerrada guarda su propio respaldo de resultados, así que sus balances quedan intactos. El cambio aplica de aquí en adelante.
5. Las dos copias duplicadas de Zibatá siguen pendientes de unificar; eso se trata aparte para no mover rondas históricas.

## Duda a confirmar

En la tarjeta, la línea de Rojas dice rating **74.1** y la aplicación tiene **71.4**. Parece un dígito invertido al capturar, y 74.1 con slope 134 es un rating de damas. Confirma si lo dejo en 71.4 o lo cambio a 74.1.

## Detalle técnico

- `UPDATE public.course_holes SET stroke_index = ...`  por `hole_number` para los dos `course_id` de Zibatá (`bd6585ff…` y `fdf1f12b…`), vía la herramienta de datos (no es cambio de esquema).
- Mismo `UPDATE` para `yards_black / yards_blue / yards_white / yards_yellow / yards_red` con los valores de la tarjeta.
- Las rondas cerradas leen de `round_snapshots.snapshot_json`, por lo que no se recalculan con este cambio.