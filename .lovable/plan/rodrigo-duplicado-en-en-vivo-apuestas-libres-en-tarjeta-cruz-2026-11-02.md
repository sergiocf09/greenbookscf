# Rodrigo duplicado en "en vivo" + apuestas libres en tarjeta cruzada

## Diagnóstico (confirmado con datos de hoy)
- No se creó una ronda extra. Hoy solo hay dos rondas abiertas:
  - Tu ronda (7 jugadores), donde Rodrigo está como **jugador cruzado**.
  - La ronda de Rodrigo (con Pony, Carlos Echevarría y Alex Ramos), donde captura su tarjeta.
- La lista "amigos en vivo" toma cada lugar donde aparece Rodrigo. Por eso sale dos veces: una con su score real (+3) y otra en tu ronda sin hoyos, porque ahí solo está para el cruce.
- Además, el cruce de hoy guardó solo "Medal incluido", sin importe. El formato que guarda la invitación no coincide con el que muestra el formulario, así que se pierden los importes.

## Solución propuesta
1. **En vivo sin duplicados:** los jugadores cruzados ya no salen como entrada aparte. Cada amigo aparece una vez, con el score de la ronda donde captura su tarjeta.
2. **Apuestas cruzadas libres:** en el cruce, los dos jugadores eligen qué apuestas individuales activan o quitan, con sus importes. No depende de lo que configuró cada ronda. El formulario mostrará todas las apuestas individuales disponibles (Medal Front/Back/Total, Presiones, Putts, Match Play, Unidades, Manchas, Oyeses, Rayas, Bloques, Caros, Skins, etc.) y cada una se podrá encender o apagar.
3. **Editar después de aceptar:** los dos jugadores del cruce podrán abrir el detalle bilateral y agregar, quitar o cambiar importes durante la ronda. Así se hace hoy en las bilaterales normales, y no requiere ser co-admin.
4. **Importes guardados bien:** se corrige el formato para que lo propuesto en la invitación sea exactamente lo que se cobra.

## Detalles técnicos
- Cambiar `get_friends_live_rounds` para excluir `round_players.is_cross_only = true`.
- `CrossBetSetupSheet`: ampliar la lista de apuestas y unificar la forma `{enabled, amount}` / `{included}` con la que lee `BetDashboard` y el cierre.
- Nueva función segura para que el iniciador u objetivo de `round_cross_bets` actualice su `bet_config`, con fusión atómica por tipo de apuesta, igual que las bilaterales.
- Tests: no duplicar en vivo, y que el importe del cruce se refleje en el cálculo.
