# Actividad mensual coherente y campos desplegables

## Objetivo
Corregir el panel “Mi actividad” para distinguir claramente todas las rondas jugadas de las rondas de 18 hoyos usadas en el promedio, y permitir consultar los campos incluidos en cada período.

## Cambios
- Mantener “Rondas por mes” contando rondas de 9 y 18 hoyos con score.
- Calcular el score promedio solo con rondas finalizadas de 18 hoyos.
- Mostrar en el dato mensual del score, en dos renglones, el promedio y la relación “X de Y rondas”, donde Y coincide con la barra mensual total.
- Convertir los bloques de 3, 6 y 12 meses en controles seleccionables.
- Al seleccionar un período, desplegar debajo la lista de campos y el número de veces jugado entre paréntesis.
- Mantener el panel desplazable y sin bloquear el historial al cerrarlo.

## Validación
- Comprobar que los totales mensuales coincidan entre ambas gráficas.
- Verificar en vista móvil que los textos no se corten, los tres períodos respondan al toque y la lista de campos pueda recorrerse.
