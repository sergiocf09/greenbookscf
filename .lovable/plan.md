## Modelo conceptual (simplificado)

El cruce **no tiene su propia matriz de apuestas**. Hereda las apuestas individuales que ya están configuradas en la ronda (pestaña **Individuales** de la matriz). El sheet bilateral del cruce sólo permite **incluir/excluir** apuestas para ese par y **ajustar strokes** — sin duplicar amounts ni sub-configuración.

```text
Setup → Matriz de apuestas → Individuales      ← UNA sola fuente de verdad
                                  │
                                  ▼
Dashboard → Apuestas de Cruce → [rival]        ← hereda; per-cross sólo on/off + strokes
```

## 1. Botón "Cruzar" compacto en panel En Vivo

Mover el `<button Cruzar>` a la **misma línea** que "Hoyo N", a la izquierda con `ml-2`, sin generar segundo renglón. Mantener altura de fila igual que antes del botón. Tamaño `text-[10px] px-2 py-0.5`.

## 2. Invitación de un toque

- Reemplazar `CrossBetSetupSheet` (selección de apuestas + montos) por un `AlertDialog` mínimo:
  > **¿Cruzar tarjeta con {Nombre}?** — Cancelar / Enviar invitación
- Al confirmar: `sendInvitation({ targetProfileId, betConfigProposal: {} })`. La invitación viaja sin apuestas; el rival sólo acepta el cruce, no apuestas específicas.
- `CrossBetSetupSheet.tsx` queda sin uso (lo dejamos en el repo, sin importarlo).

## 3. Sección "Apuestas de Cruce" en el Bet Dashboard

Cada tarjeta de cruce activo se expande para mostrar:

### (a) Apuestas heredadas — incluir/excluir

- Listar **sólo las apuestas individuales habilitadas en la ronda** (Medal, Match Play, Putts, Manchas, Bloques, Unidades, Skins, etc., resolviendo overrides por grupo si aplica).
- Cada una con un toggle "Incluir en este cruce" (default: incluida). El monto y la sub-configuración se muestran como **read-only** (heredan de Individuales).
- Persistencia: el campo `bet_config` de `round_cross_bets` guarda `{ medal: { included: true }, putts: { included: false }, ... }` — sólo banderas por cruce.
- Si la ronda **no tiene ninguna apuesta individual habilitada**, mostrar mensaje:
  > "Aún no hay apuestas individuales configuradas. Ve a **Apuestas → Individuales** para activarlas."
  > con botón directo a esa pestaña.

### (b) Ajuste de strokes (bilateralidad cruzada)

- Montar `CrossGroupHandicapWidget` usando el `round_player` sintético del rival (`target_round_player_id` que ya crea `accept_cross_bet_invitation`). Esto reutiliza el mismo patrón que cruces dentro de un setup multigrupo: sliding sugerido + override manual con +/−.

## Cambios técnicos

- **Migración Supabase** — RPC `update_cross_bet_config(p_cross_bet_id uuid, p_bet_config jsonb)` con `SECURITY DEFINER`, valida que `auth.uid()` sea iniciador o target.
- `**src/hooks/useCrossBets.ts**` — añadir `updateCrossBetConfig` mutation.
- `src/components/friends/FriendsLiveHeaderBadge.tsx` — relayout: botón "Cruzar" inline a laizquierda de "Hoyo N".
- `**src/pages/Index.tsx**` — sustituir `CrossBetSetupSheet` por un `AlertDialog` simple de confirmación.
- `**src/components/bets/BetDashboard.tsx**` — en la sección "Apuestas de Cruce":
  - leer apuestas individuales activas del `BetConfig` resuelto para el grupo;
  - render por cruce con toggles de inclusión, hint del monto heredado, `CrossGroupHandicapWidget`;
  - mensaje + atajo si no hay apuestas configuradas.

## No se hace

- No se crea una pestaña "Cruce" nueva en la matriz.
- No se duplica el editor de montos ni sub-modalidades en el sheet del cruce.
- No se tocan los cálculos de balances (motor bilateral los procesa por las apuestas heredadas, filtradas por la bandera `included` por cruce).