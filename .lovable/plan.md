# Scores Attestation — Implementation Plan

Feature: allow a non-organizer participant to attest the scores of a completed round. Surface pending attestations in the header (badge) and profile menu, expose attestation status in the handicap history. Title displayed in English: **"Scores Attestation"**.

## 1. Database migration

Single migration adding:
- `rounds.attested_by UUID REFERENCES profiles(id) ON DELETE SET NULL`
- `rounds.attested_at TIMESTAMPTZ`
- `handicap_history.is_attested BOOLEAN NOT NULL DEFAULT false`
- RPC `attest_round(p_round_id UUID)` — SECURITY DEFINER, validates: round exists, status='completed', not yet attested, caller ≠ organizer, caller is a real (non-ghost) participant. Updates `rounds` and flips `handicap_history.is_attested=true` for that round.
- RPC `get_pending_attestations()` — returns rows `{round_id, round_date, course_name, organizer_name, player_names[], my_total_strokes}` for completed rounds where the caller participated as a real account, is not the organizer, and the round is not yet attested.
- `GRANT EXECUTE ... TO authenticated` for both RPCs.

Note: `round_players.is_ghost` will be guarded with `(rp.is_ghost IS NULL OR rp.is_ghost = false)` — if the column does not exist we will simplify to `rp.profile_id IS NOT NULL` during execution. Existing SELECT RLS on `rounds` already covers the new columns.

## 2. New hook `src/hooks/useAttestation.ts`

React Query hook exposing:
- `pendingRounds: AttestationRound[]` from `get_pending_attestations` RPC (staleTime 60s).
- `attestRound(roundId)` mutation calling `attest_round` RPC; on success invalidates `pending-attestations` and `handicap-history` queries.
- `isLoading`, `isAttesting`, `attestError`.

`AttestationRound` interface: `{roundId, roundDate, courseName, organizerName, playerNames[], myTotalStrokes}`.

## 3. New component `src/components/attestation/AttestationSheet.tsx`

Bottom/right sheet titled **"Scores Attestation"** (English title, Spanish subtitle: "Confirma que los scores de estas rondas son correctos…"). Lists each pending round as a card with:
- Course name + date
- Organizer name + other player names (first 3 + overflow)
- My total strokes
- "Atestar" button → calls `onAttest(roundId)`, shows per-row loading state.
Empty state when `rounds.length === 0`.

## 4. Update `src/hooks/useHandicapHistory.ts`

- Add `isAttested: boolean` to `HandicapHistoryEntry`.
- Map `is_attested: row.is_attested ?? false` in **both** entry-construction blocks (materialized path and fallback path — fallback defaults to `false`).

## 5. Update `src/components/profile/HandicapHistoryView.tsx`

- Import `Check`, `Clock` from lucide-react; import `cn` from `@/lib/utils`.
- In `RoundRow`, render small ✓ (emerald, attested) or ⏳ (muted, pending) icon beside course name.
- Below the "X/Y diferenciales" summary, add a line: "Atestadas: N de M (P%)", color-coded (emerald ≥80%, yellow ≥50%, muted otherwise), computed over the differentials currently used for the index.

## 6. Update `src/pages/Index.tsx`

- Extend `DialogName` union with `'attestation'`; add `attestation: false` to `DIALOGS_INITIAL`.
- Import + instantiate `useAttestation(profile?.id ?? null)`.
- Pass `attestationCount={pendingAttestations.length}` and `onOpenAttestation={() => openDialog('attestation')}` to `<AppHeader/>`.
- Render `<AttestationSheet open={dialogs.attestation} onClose={...} rounds={pendingAttestations} isAttesting={isAttesting} onAttest={attestRound} />` next to the other dialogs.

## 7. Update `src/components/layout/AppDialogs.tsx`

- Add `'attestation'` to the local `DialogName` union (the `DialogState` Record updates automatically).

## 8. Update `src/components/layout/AppHeader.tsx`

- Extend `AppHeaderProps` with `attestationCount: number` and `onOpenAttestation: () => void`; destructure both.
- Import `ScrollText` from lucide-react.
- In the right-hand actions area, before Friends, render a button with ScrollText icon and a red badge showing `attestationCount` (capped at "9+"), only when count > 0. Clicking calls `onOpenAttestation`.
- In the profile dropdown, after "Rondas Pendientes", add a "Scores Attestation (N)" menu item, shown only when count > 0.

## Files touched

```text
supabase/migrations/<new>.sql            (PART 1)
src/hooks/useAttestation.ts              (NEW)
src/components/attestation/AttestationSheet.tsx  (NEW)
src/hooks/useHandicapHistory.ts          (edit)
src/components/profile/HandicapHistoryView.tsx   (edit)
src/pages/Index.tsx                      (edit)
src/components/layout/AppDialogs.tsx     (edit)
src/components/layout/AppHeader.tsx      (edit)
```

No bet calculators, scoring, or other unrelated components will be modified. Title text uses English "Scores Attestation" as requested; explanatory copy remains in Spanish.

## Technical notes

- The pasted JSX in the user instructions had stripped angle brackets (rendering glitch). The actual component code will use proper `<Sheet>`, `<Button>`, etc. JSX matching the project's shadcn `sheet` and `button` primitives.
- The `attest_round` ghost check is best-effort: if `round_players.is_ghost` is absent, the guard falls back to `profile_id IS NOT NULL`.
- React Query keys (`pending-attestations`, `handicap-history-materialized`) are invalidated on success so the badge and history refresh immediately.
