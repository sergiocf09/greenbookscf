# Plan: Balances Pre-GB — UX limpio y toggle de inclusión

Ámbito: solo `src/components/HistoricalBalances.tsx` y `src/components/balances/PreAppBalanceSheet.tsx` (presentación). Sin cambios de lógica, datos, RLS ni cálculos compartidos. La data sigue siendo exclusiva del owner.

## 1. Arreglar el bug "no pasa nada al hacer clic"

**Causa:** la vista de detalle (`if (selectedRival) return ...`, línea 535) no incluye el `<PreAppBalanceSheet>`. El Sheet sólo está montado en el `return` principal al final del archivo, por eso aparece después de pulsar "Volver".

**Fix:** envolver el JSX de la vista de detalle en un `<>...</>` y renderizar el `<PreAppBalanceSheet>` adentro también (o extraer el bloque del Sheet a una función `renderPreAppSheet()` y llamarla en ambos returns). Así el clic abre el Sheet al instante sobre la vista del rival.

## 2. Renombrar "Pre-app" → "Pre-GB"

Cambiar todos los textos visibles:
- Botón del header de detalle: `Pre-app` → `Pre-GB`
- Badge en la lista de rivales: `+pre-app` → `+pre-GB`
- Desglose bajo el monto combinado: `Pre: …` se mantiene corto; el título del Sheet pasa a `Balance Pre-GB vs {rival}`; texto auxiliar "Solo visible para ti…" igual.
- Tooltip/`title` y placeholders dentro de `PreAppBalanceSheet.tsx` ("registro pre-app" → "registro pre-GB", "Sin registros pre-app" → "Sin registros pre-GB", "Total pre-app" → "Total pre-GB").

No tocar nombres de tabla, hook, props ni tipos (`pre_app_balances`, `usePreAppBalances`, `PreAppBalance`, `summaryByRival`) — son internos.

## 3. Toggle incluir/excluir Pre-GB del total

**Modelo:** un estado local en `HistoricalBalances`:
```
const [excludedPreApp, setExcludedPreApp] = useState<Set<string>>(new Set());
```
La clave es `rival.id` (mismo `rivalKey` que usa `preAppMap`). No se persiste — es vista del momento, igual que `showGuests`.

**Vista de detalle (header del rival):**
- Cuando `hasPreApp`:
  - El número grande muestra `combined` si el rival NO está en `excludedPreApp`; muestra sólo `selectedRival.netAmount` (sólo app) si SÍ está excluido.
  - Bajo el número, el chip `App: …  Pre: …` se convierte en dos botones inline:
    - `App: ±$X` (informativo, no clickable)
    - `Pre: ±$Y` clickable. Si está incluido → texto en color + `underline decoration-dotted`. Si está excluido → mismo color atenuado + `line-through decoration-dotted` y aria-pressed. Tap alterna `excludedPreApp` para esa clave.
  - Microcopy debajo (text-[10px] muted): "Toca Pre para incluirlo/excluirlo del total".
- Cuando NO hay pre-GB: el botón `Pre-GB` del header sirve únicamente para abrir el Sheet de captura (estado actual).

**Vista de listado de rivales (Vs Rivales):**
- Mantener el badge `+pre-GB` cuando hay registros.
- Si el rival está en `excludedPreApp`, el monto grande muestra sólo `netAmount` (app) y el badge se ve atenuado con `line-through decoration-dotted` para indicar que está fuera del total. Tap en el badge alterna inclusión (sin abrir el detalle — `e.stopPropagation()`).
- El "Balance Total" superior se recalcula sumando, por cada rival, `netAmount + (excluded ? 0 : preTotal)`.

**Persistencia entre vistas:** como el estado vive en `HistoricalBalances`, navegar a detalle y volver mantiene la exclusión.

## 4. QA manual

1. Abrir balances → entrar a un rival con pre-GB ya cargado → tap `Pre`: ahora el monto grande muestra sólo app y `Pre` aparece tachado punteado.
2. Tap otra vez `Pre`: vuelve a sumar.
3. Entrar a rival sin pre-GB → tap `Pre-GB` (header): el Sheet abre al instante, sin necesidad de volver.
4. Capturar un registro → al cerrar Sheet, header muestra desglose App/Pre y badge en el listado.
5. En listado, tap en `+pre-GB`: monto del rival y "Balance Total" se actualizan; no entra al detalle.
6. Confirmar en otro usuario que sigue sin ver nada (RLS sin cambios).

## Detalles técnicos

- Archivos tocados: `HistoricalBalances.tsx` (render dual del Sheet + toggle + textos), `PreAppBalanceSheet.tsx` (textos `Pre-app` → `Pre-GB`).
- Sin migraciones, sin cambios en `usePreAppBalances`, sin afectar `player_vs_player`, rankings, leaderboards ni bilateralidad.
- Accesibilidad: el toggle Pre usa `<button aria-pressed={!isExcluded}>` con `title` "Incluir/Excluir Pre-GB del total".
