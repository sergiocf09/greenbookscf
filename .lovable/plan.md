

## Plan: Desambiguación en Carritos/Foursomes + Ampliar grid de hoyos en Foursomes

### Cambios

**1. `src/components/bets/CarritosResultsCard.tsx`** — Desambiguación de nombres

- Importar `disambiguateShortNames` de `playerInput.ts`
- Crear un `shortNames` map con `useMemo` usando todos los players
- **TeamHoleGrid** (líneas 31, 37, 41, 47): Reemplazar `name.split(' ')[0]` por lookup en `shortNames`
- **Línea de nombres** (líneas 290, 294): Reemplazar `formatPlayerName(p.name).split(' ')[0]` por lookup en `shortNames`
- Pasar `shortNames` map como prop a `TeamHoleGrid` o resolverlo inline

**2. `src/components/bets/BilateralDetail.tsx`** — Desambiguación en tooltips de Presiones, Skins y Putts

- Ya importa `disambiguateShortNames`; crear `shortNames` map con `useMemo`
- Línea 2545: `{player.initials} vs {rival.initials}` → usar short names desambiguados
- Línea 2643-2645 (Skins final): `{player.initials}` / `{rival.initials}` → short names
- Línea 2675 (Putts): `{player.initials} vs {rival.initials}` → short names
- Línea 1853-1856 (Rayas conflict): `{player.initials}` / `{rival.initials}` → short names

**3. `src/components/bets/BilateralDetail.tsx`** — Ampliar grid de hoyos en Foursomes

- Líneas 2552, 2569: El grid usa `grid-cols-9 gap-0.5` con `w-full h-7 text-[9px]`
- Ampliar: cambiar `gap-0.5` → `gap-1`, `h-7` → `h-8`, `text-[9px]` → `text-[10px]` para que los números con presiones (ej: `+8+5+1`) no se sobrepongan
- Considerar `overflow-hidden text-ellipsis` como fallback si el contenido es muy largo

### Archivos

| Archivo | Cambio |
|---------|--------|
| `src/components/bets/CarritosResultsCard.tsx` | Desambiguación en TeamHoleGrid + línea de nombres |
| `src/components/bets/BilateralDetail.tsx` | Desambiguación en tooltips + ampliar grid hoyos Foursomes |

