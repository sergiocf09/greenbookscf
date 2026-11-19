import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { toast } from 'sonner';
import { AlertTriangle, Award, Loader2, Lock, Medal, RotateCcw, Send, Settings, Share2, Trophy, Undo2 } from 'lucide-react';
import i18n from '@/i18n';
import { trs } from '@/i18n/tr';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/formatMoney';
import { formatPlayerName } from '@/lib/playerInput';
import { computePrizePayouts, validatePrizeConfig } from '@/lib/leaderboardPrizes';
import { useLeaderboardPrizes, type LeaderboardPrizesState } from '@/hooks/useLeaderboardPrizes';
import { buildAwardDisplaySections } from '@/lib/prizeAwardDisplay';
import { buildPrizesSharePayouts, poolModeSubtitle, sharePayoutsFromSnapshot } from '@/lib/prizesShareData';
import { PrizePlayerCard } from './PrizePlayerCard';
import { PrizesShareImage, resultColumnLabel } from './PrizesShareImage';
import type { PrizeResultStat, PrizeResultStats } from '@/lib/prizeResultStats';
import type {
  FinalPayoutsSnapshot, PayoutResult, PrizeCandidate, PrizeMode,
} from '@/types/leaderboard';

export interface PrizesPanelParticipant {
  id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  profile_id?: string | null;
}

interface Props {
  leaderboardId: string;
  isMultiDay: boolean;
  participants: PrizesPanelParticipant[];
  /** Strict candidates: only players who completed are eligible. */
  candidates: PrizeCandidate[];
  /** Players with any holes (used only to count who is still in progress). */
  candidatesProjection: PrizeCandidate[];
  scoringModes: string[];
  expectedHolesInfo: { daysWithoutRound: number[]; unreliable: boolean };
  /** Opens PrizeSetupDialog (creator only). */
  onOpenSetup?: () => void;
  /** Leaderboard name and date shown on the share image. */
  leaderboardName?: string;
  dateLabel?: string;
  /** Display-only handicap and results (gross/net/points) per participant, shown next to pool winners. */
  resultStats?: PrizeResultStats;
}

/** Spanish word, plus the English word shown when the UI is in English. */
const FREEZE_WORDS = ['congelar', 'freeze'];
const MODE_LABEL: Record<PrizeMode, string> = { gross: 'Gross', net: 'Neto', stableford: 'Stableford' };
const EMPTY_RESULT: PayoutResult = {
  pools: [], awards: [], byParticipant: [], totalAllocated: 0, totalUnallocated: 0, totalPendingAwards: 0,
};
const centsOf = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
};

/** Same visibility rule the panel applies: creator always; participants only when published. */
export function isPrizesPanelVisible(isCreator: boolean, prizes: LeaderboardPrizesState | null): boolean {
  if (isCreator) return true;
  return !!prizes?.exists && (prizes.status === 'live' || prizes.status === 'final');
}

export const formatFrozenAt = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const en = i18n.language === 'en';
  return format(d, en ? 'MMM d, yyyy · h:mm a' : "d 'de' MMM yyyy · HH:mm", { locale: en ? enUS : es });
};

export const PrizesPanel: React.FC<Props> = ({
  leaderboardId, isMultiDay, participants, candidates, candidatesProjection, scoringModes, expectedHolesInfo, onOpenSetup,
  leaderboardName, dateLabel, resultStats,
}) => {
  const { profile } = useAuth();
  const { prizes, loading, isCreator, setStatus, saving } = useLeaderboardPrizes(leaderboardId);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeText, setFreezeText] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const status = prizes?.status ?? 'draft';
  const isFinal = status === 'final';
  const config = prizes?.config;
  const awards = useMemo(() => prizes?.awards ?? [], [prizes?.awards]);
  const snapshot: FinalPayoutsSnapshot | null = isFinal ? prizes?.finalPayouts ?? null : null;

  const strictResult = useMemo<PayoutResult>(
    () => (config ? computePrizePayouts({ config, awards, candidates }) : EMPTY_RESULT),
    [config, awards, candidates],
  );
  const result: PayoutResult = isFinal
    ? (snapshot ? { ...EMPTY_RESULT, ...snapshot } : EMPTY_RESULT)
    : strictResult;

  const partById = useMemo(() => new Map(participants.map(p => [p.id, p])), [participants]);
  const nameOf = (pid: string) => {
    const snap = snapshot?.participants?.[pid];
    if (snap) return { name: snap.name, initials: snap.initials, color: snap.color, profileId: partById.get(pid)?.profile_id ?? null };
    const p = partById.get(pid);
    return {
      name: p ? formatPlayerName(p.display_name) : trs('Jugador'),
      initials: p?.initials || '??',
      color: p?.avatar_color || '#3B82F6',
      profileId: p?.profile_id ?? null,
    };
  };

  const poolsList = useMemo(() => {
    const catName = (id: string | null | undefined) =>
      (id ? config?.categories.find(c => c.id === id)?.name : null) ?? null;
    if (isFinal && snapshot?.pools) {
      // Frozen pools carry their category; older snapshots fall back to the config by pool id.
      type FrozenPool = { id: string; label: string; mode: PrizeMode; categoryId?: string | null; categoryName?: string | null };
      return (snapshot.pools as unknown as FrozenPool[]).map(p => {
        const live = config?.pools.find(x => x.id === p.id);
        const categoryId = p.categoryId ?? live?.categoryId ?? null;
        return { id: p.id, label: p.label, mode: p.mode, categoryId, categoryName: p.categoryName ?? catName(categoryId) };
      });
    }
    return (config?.pools ?? []).map(p => ({
      id: p.id, label: p.label, mode: p.mode, categoryId: p.categoryId ?? null, categoryName: catName(p.categoryId),
    }));
  }, [isFinal, snapshot, config?.pools, config?.categories]);

  /** Pools grouped by category (display only), in the organizer's pool order. */
  const poolGroups = useMemo(() => {
    const groups: { key: string; name: string | null; pools: typeof poolsList }[] = [];
    for (const p of poolsList) {
      const key = p.categoryId ?? (p.categoryName ? `n:${p.categoryName}` : '__general');
      let g = groups.find(x => x.key === key);
      if (!g) { g = { key, name: p.categoryName ?? null, pools: [] }; groups.push(g); }
      g.pools.push(p);
    }
    return groups;
  }, [poolsList]);
  const hasCategories = poolGroups.some(g => g.key !== '__general');

  // Final: only the frozen stats (never live scores); live/draft: current leaderboard values.
  const statsOf = (pid: string): PrizeResultStat | null => {
    if (isFinal) {
      const sp = snapshot?.participants?.[pid];
      return sp?.results ? { hcp: sp.hcp ?? null, results: sp.results } : null;
    }
    return resultStats?.[pid] ?? null;
  };

  const awardsList = useMemo(() => {
    const winnerById = new Map(result.awards.map(a => [a.awardId, a.participantId]));
    const source = isFinal && snapshot?.awards
      ? snapshot.awards
      : awards.map(a => ({ id: a.id, label: a.label, amount: Number(a.amount) || 0, groupId: a.groupId ?? null, place: a.place ?? null }));
    return source.map(a => ({ ...a, winner: winnerById.get(a.id) ?? null }));
  }, [isFinal, snapshot, awards, result.awards]);
  const awardSections = useMemo(() => buildAwardDisplaySections(awardsList), [awardsList]);

  const validationErrors = useMemo(
    () => (config ? validatePrizeConfig(config, awards) : []),
    [config, awards],
  );

  const projById = useMemo(() => new Map(candidatesProjection.map(c => [c.participantId, c.completed])), [candidatesProjection]);
  const incompleteCount = candidates.filter(c => !c.completed).length;
  const inProgressCount = candidates.filter(c => !c.completed && projById.get(c.participantId)).length;
  const pendingAwards = awardsList.filter(a => !a.winner && centsOf(a.amount) > 0);
  const totalPoolExceeded = (() => {
    if (!config || config.totalPool == null || !Number.isFinite(Number(config.totalPool))) return false;
    const tiers = config.pools.reduce((s, p) => s + p.tiers.reduce((t, x) => t + centsOf(x.amount), 0), 0);
    const aw = awards.reduce((s, a) => s + centsOf(a.amount), 0);
    return tiers + aw > Math.round(Number(config.totalPool) * 100);
  })();

  if (loading || !prizes) return null;
  if (!isPrizesPanelVisible(isCreator, prizes)) return null;

  const hasContent = poolsList.length > 0 || awardsList.length > 0;

  if (!hasContent) {
    return (
      <Card>
        <CardContent className="py-6 flex flex-col items-center text-center gap-2">
          <Trophy className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-semibold">{trs('Aún no hay premios configurados')}</p>
          {isCreator && (
            <>
              <p className="text-xs text-muted-foreground max-w-xs">
                {trs('Define bolsas por lugar y premios especiales como los oyes.')}
              </p>
              <Button size="sm" className="mt-1 gap-1.5" onClick={onOpenSetup}>
                <Award className="h-4 w-4" />{trs('Configurar premios')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  const frozenLabel = formatFrozenAt(snapshot?.frozenAt ?? prizes.finalizedAt);

  const canShare = status === 'live' || status === 'final';
  // Share image: final reads ONLY the frozen snapshot; live uses the strict (official) calculation.
  const sharePayouts = !canShare ? null : isFinal
    ? (snapshot ? sharePayoutsFromSnapshot(snapshot, trs('Jugador')) : null)
    : buildPrizesSharePayouts({
        result: strictResult,
        pools: poolsList,
        awards: awardsList,
        nameOf: pid => nameOf(pid),
        statsOf,
      });
  const shareDate = dateLabel || formatFrozenAt(snapshot?.frozenAt ?? prizes.finalizedAt).split(' · ')[0];
  const shareModes = (scoringModes || [])
    .filter((m): m is PrizeMode => m === 'gross' || m === 'net' || m === 'stableford')
    .map(m => trs(MODE_LABEL[m]));

  const handleFreeze = async () => {
    if (!config) return;
    const res = computePrizePayouts({ config, awards, candidates });
    const snap: FinalPayoutsSnapshot = {
      ...res,
      frozenAt: new Date().toISOString(),
      participants: Object.fromEntries(participants.map(p => {
        const st = resultStats?.[p.id];
        return [p.id, {
          name: formatPlayerName(p.display_name), initials: p.initials || '??', color: p.avatar_color || '#3B82F6',
          ...(st ? { hcp: st.hcp, results: st.results } : {}),
        }];
      })),
      // Each entry carries both the payout fields and its display metadata (id/label/mode),
      // so the snapshot satisfies PayoutResult and the FinalPayoutsSnapshot metadata at once.
      pools: res.pools.map((pp, i) => {
        const p = config.pools.find(x => x.id === pp.poolId) ?? config.pools[i];
        const categoryId = p?.categoryId ?? null;
        const categoryName = categoryId ? config.categories.find(c => c.id === categoryId)?.name ?? null : null;
        return { ...pp, id: pp.poolId, label: p?.label ?? '', mode: (p?.mode ?? 'net') as PrizeMode, categoryId, categoryName };
      }),
      awards: res.awards.map(ra => {
        const a = awards.find(x => x.id === ra.awardId);
        return { ...ra, id: ra.awardId, label: a?.label ?? '' };
      }),
    };
    const ok = await setStatus('final', snap);
    if (ok) {
      toast.success(trs('Premios congelados'));
      setFreezeOpen(false);
      setFreezeText('');
    }
  };

  const handlePublish = async () => {
    if (await setStatus('live')) toast.success(trs('Premios publicados a los participantes'));
  };
  const handleToDraft = async () => {
    if (await setStatus('draft')) toast.success(trs('Premios en borrador'));
  };
  const handleReopen = async () => {
    if (await setStatus('live')) {
      toast.success(trs('Premios reabiertos'));
      setReopenOpen(false);
    }
  };

  const freezeWarnings: string[] = [];
  if (incompleteCount > 0) freezeWarnings.push(`${trs('Jugadores que aún no completan:')} ${incompleteCount}`);
  if (pendingAwards.length > 0) {
    freezeWarnings.push(`${trs('Premios especiales sin ganador:')} ${pendingAwards.length} (${fmtMoney(strictResult.totalPendingAwards)})`);
  }
  if (strictResult.totalUnallocated > 0) freezeWarnings.push(`${trs('Monto sin repartir:')} ${fmtMoney(strictResult.totalUnallocated)}`);
  if (totalPoolExceeded) freezeWarnings.push(trs('La suma de premios supera la bolsa total.'));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-1.5">
            <Trophy className="h-4 w-4 text-amber-500" />{trs('Premios')}
          </CardTitle>
          <div className="flex items-start gap-1">
            <StatusBadge status={status} frozenLabel={frozenLabel} />
            {canShare && sharePayouts && (
              <Button variant="ghost" size="icon" className="h-7 w-7 -mt-0.5" aria-label={trs('Compartir premios')}
                title={trs('Compartir premios')} onClick={() => setShareOpen(true)}>
                <Share2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {status === 'draft'
            ? trs('Los participantes no ven estos premios hasta que los publiques.')
            : status === 'live'
              ? trs('Los montos pueden cambiar mientras se capturan scores.')
              : trs('Los premios quedaron congelados y ya no cambian con los scores.')}
        </p>
      </CardHeader>

      <CardContent className="px-3 pb-3 space-y-3">
        {/* Player summary */}
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {trs('Resumen por jugador')}
          </h3>
          {result.byParticipant.length === 0 ? (
            <div className="rounded-md border border-dashed py-4 text-center">
              <p className="text-sm text-muted-foreground">{trs('Aún no hay premios asignados')}</p>
              {!isFinal && inProgressCount > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {inProgressCount === 1
                    ? trs('1 jugador sigue en curso')
                    : `${inProgressCount} ${trs('jugadores siguen en curso')}`}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {result.byParticipant.map(pp => {
                const who = nameOf(pp.participantId);
                const isMe = !!profile?.id && who.profileId === profile.id;
                return (
                  <PrizePlayerCard
                    key={pp.participantId}
                    name={who.name}
                    initials={who.initials}
                    color={who.color}
                    total={pp.total}
                    items={pp.items}
                    isMe={isMe}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Pool detail, one section per category when categories are used */}
        {poolGroups.map(group => (
          <section key={group.key} className="space-y-1">
            {hasCategories && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-primary px-1">
                {group.name ? `${trs('Categoría')} ${group.name}` : trs('General')}
              </h3>
            )}
            <Accordion type="multiple" defaultValue={group.pools.map(p => p.id)} className="rounded-md border px-2">
          {group.pools.map(pool => {
            const payout = result.pools.find(p => p.poolId === pool.id);
            const modeLabel = trs(MODE_LABEL[pool.mode]);
            const title = pool.label || modeLabel;
            const subtitle = poolModeSubtitle(pool.label, modeLabel);
            const rows = payout?.rows ?? [];
            const withStats = rows.some(r => !!statsOf(r.participantId));
            const cols = withStats
              ? 'grid-cols-[1.25rem_minmax(0,1fr)_1.75rem_2.25rem_3.5rem]'
              : 'grid-cols-[1.5rem_minmax(0,1fr)_4.5rem]';
            return (
              <AccordionItem key={pool.id} value={pool.id}>
                <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
                  <span className="flex items-center gap-1.5 min-w-0 text-left">
                    <Medal className="h-4 w-4 text-amber-500 shrink-0" />
                    <span className="truncate font-semibold">{title}</span>
                    {subtitle && (
                      <span className="text-[10px] text-muted-foreground font-normal shrink-0">{subtitle}</span>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">{trs('Sin ganadores aún')}</p>
                  ) : (
                    <div className="text-sm">
                      {withStats && (
                        <div className={cn('grid items-center gap-1 pb-1 text-[10px] font-semibold uppercase text-muted-foreground', cols)}>
                          <span className="text-center">#</span>
                          <span>{trs('Jugador')}</span>
                          <span className="text-center">HCP</span>
                          <span className="text-center">{resultColumnLabel(pool.mode)}</span>
                          <span className="text-right">{trs('Premio')}</span>
                        </div>
                      )}
                      <ul className="divide-y">
                        {rows.map(r => {
                          const who = nameOf(r.participantId);
                          const st = statsOf(r.participantId);
                          return (
                            <li key={r.participantId} className={cn('grid items-center gap-1 py-1.5', cols)}>
                              <span className="text-center font-bold text-muted-foreground tabular-nums">
                                {r.tied ? `T${r.rank}` : r.rank}
                              </span>
                              <span className="flex items-center gap-1.5 min-w-0">
                                <PlayerAvatar initials={who.initials} background={who.color} size="sm"
                                  isLoggedInUser={!!profile?.id && who.profileId === profile.id} />
                                <span className={withStats ? 'line-clamp-2 leading-tight break-words' : 'truncate'}>{who.name}</span>
                              </span>
                              {withStats && (
                                <>
                                  <span className="text-center text-xs tabular-nums text-muted-foreground">
                                    {st?.hcp != null ? st.hcp : '–'}
                                  </span>
                                  <span className="text-center font-bold tabular-nums">
                                    {st?.results?.[pool.mode] ?? '–'}
                                  </span>
                                </>
                              )}
                              <span className="text-right font-semibold tabular-nums">{fmtMoney(r.amount)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {payout && payout.unallocated > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {trs('Sin repartir:')} <span className="font-semibold tabular-nums">{fmtMoney(payout.unallocated)}</span>
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
            </Accordion>
          </section>
        ))}

        {awardsList.length > 0 && (
        <Accordion type="multiple" defaultValue={['__awards']} className="rounded-md border px-2">
            <AccordionItem value="__awards">
              <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
                <span className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold">{trs('Premios especiales')}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                <div className="space-y-3">
                  {awardSections.map(section => (
                    <div key={section.key}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary border-b border-primary/20 pb-1 mb-1">
                        {section.heading}
                      </p>
                      <div className="divide-y">
                        {section.groups.map(group => {
                          const multi = group.rows.length > 1;
                          return (
                            <div key={group.key} className="py-1.5">
                              {group.title && (
                                <p className="text-xs font-semibold text-foreground mb-0.5">{group.title}</p>
                              )}
                              <ul>
                                {group.rows.map(r => {
                                  const who = r.winner ? nameOf(r.winner) : null;
                                  return (
                                    <li key={r.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_4.5rem] items-center gap-1.5 py-0.5 text-sm">
                                      <span className="text-center text-xs font-bold text-muted-foreground tabular-nums">
                                        {multi ? `${r.place}º` : ''}
                                      </span>
                                      {who ? (
                                        <span className="flex items-center gap-1.5 min-w-0">
                                          <PlayerAvatar initials={who.initials} background={who.color} size="sm"
                                            isLoggedInUser={!!profile?.id && who.profileId === profile.id} />
                                          <span className="truncate">{who.name}</span>
                                        </span>
                                      ) : (
                                        <span className="text-xs text-muted-foreground italic">{trs('Sin ganador aún')}</span>
                                      )}
                                      <span className="text-right font-semibold tabular-nums">{fmtMoney(r.amount)}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
        </Accordion>
        )}

        {/* Notices */}
        <div className="space-y-1">
          {!isFinal && incompleteCount > 0 && (
            <Notice>
              {incompleteCount === 1
                ? trs('1 jugador aún no completa sus hoyos y no cobra todavía.')
                : `${incompleteCount} ${trs('jugadores aún no completan sus hoyos y no cobran todavía.')}`}
            </Notice>
          )}
          {isCreator && !isFinal && (config?.categories.length ?? 0) > 0 && poolsList.some(p => !p.categoryId) && (
            <Notice>{trs('Hay categorías, pero algunas bolsas son para Todos. En Configurar premios usa "Dividir por categoría".')}</Notice>
          )}
          {isCreator && pendingAwards.length > 0 && (
            <Notice>
              {`${trs('Premios especiales sin ganador:')} ${pendingAwards.length} (${fmtMoney(result.totalPendingAwards)})`}
            </Notice>
          )}
          {isCreator && result.totalUnallocated > 0 && (
            <Notice>{`${trs('Monto sin repartir:')} ${fmtMoney(result.totalUnallocated)}`}</Notice>
          )}
          {isCreator && isMultiDay && !isFinal && expectedHolesInfo.daysWithoutRound.length > 0 && (
            <Notice>
              {`${trs('Días sin ronda vinculada:')} ${expectedHolesInfo.daysWithoutRound.map(d => `${trs('Día')} ${d}`).join(', ')}`}
            </Notice>
          )}
          {isCreator && !isFinal && expectedHolesInfo.unreliable && (
            <Notice>{trs('No se pudo confirmar el número de hoyos de la ronda; se asume 18')}</Notice>
          )}
          {isFinal && !snapshot && (
            <Notice>{trs('No se encontró el detalle congelado. Reabre y vuelve a congelar los premios.')}</Notice>
          )}
        </div>

        {isCreator && (
          <section className="space-y-1.5 rounded-md border border-dashed p-2.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {trs('Opciones del organizador')}
            </h3>
            {isCreator && (
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={onOpenSetup}>
                  <Settings className="h-3.5 w-3.5" />{trs('Configurar premios')}
                </Button>
                {status === 'draft' && (
                  <Button size="sm" className="h-8 text-xs gap-1" disabled={saving} onClick={handlePublish}>
                    <Send className="h-3.5 w-3.5" />{trs('Publicar a participantes')}
                  </Button>
                )}
                {status === 'live' && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={saving} onClick={handleToDraft}>
                      <Undo2 className="h-3.5 w-3.5" />{trs('Pasar a borrador')}
                    </Button>
                    <Button size="sm" className="h-8 text-xs gap-1" disabled={saving}
                      onClick={() => { setFreezeText(''); setFreezeOpen(true); }}>
                      <Lock className="h-3.5 w-3.5" />{trs('Congelar premios')}
                    </Button>
                  </>
                )}
                {status === 'final' && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={saving} onClick={() => setReopenOpen(true)}>
                    <RotateCcw className="h-3.5 w-3.5" />{trs('Reabrir premios')}
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        <p className="text-[10px] text-muted-foreground leading-snug text-center px-2">
          {trs('GreenBook solo calcula el reparto. El cobro y el pago de premios es un acuerdo entre los participantes.')}
        </p>
      </CardContent>

      {/* Freeze confirmation */}
      <AlertDialog open={freezeOpen} onOpenChange={o => { if (!saving) setFreezeOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('¿Congelar premios?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs('Se guardará el reparto oficial actual (solo jugadores que completaron) y ya no cambiará con los scores. Escribe')}{' '}
              <strong>{trs('CONGELAR')}</strong>{' '}{trs('para confirmar.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {freezeWarnings.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
              {freezeWarnings.map(w => (
                <li key={w} className="flex items-start gap-1.5 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />{w}
                </li>
              ))}
            </ul>
          )}
          {validationErrors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 space-y-1">
              <p className="text-xs font-semibold text-destructive">{trs('Corrige la configuración antes de congelar:')}</p>
              {validationErrors.map(e => <p key={e} className="text-xs text-destructive">{e}</p>)}
            </div>
          )}
          <Input
            value={freezeText}
            onChange={e => setFreezeText(e.target.value)}
            placeholder={trs('Escribe CONGELAR')}
            className="uppercase"
            disabled={validationErrors.length > 0}
          />
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={saving}>{trs('Cancelar')}</AlertDialogCancel>
            <Button
              disabled={saving || validationErrors.length > 0 || !FREEZE_WORDS.includes(freezeText.trim().toLowerCase())}
              onClick={handleFreeze}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {trs('Congelar premios')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {sharePayouts && (status === 'live' || status === 'final') && (
        <PrizesShareImage
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={leaderboardName || trs('Premios')}
          dateLabel={shareDate}
          modeLabelPairs={shareModes}
          payouts={sharePayouts}
          status={status}
        />
      )}

      {/* Reopen confirmation */}
      <AlertDialog open={reopenOpen} onOpenChange={o => { if (!saving) setReopenOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trs('¿Reabrir premios?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {trs('Se borrará el reparto congelado y los premios se volverán a calcular con los scores actuales. Los participantes los verán como provisionales.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={saving}>{trs('Cancelar')}</AlertDialogCancel>
            <Button disabled={saving} onClick={handleReopen}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {trs('Reabrir premios')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

const Notice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug px-1">
    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
    <span>{children}</span>
  </p>
);

const StatusBadge: React.FC<{ status: 'draft' | 'live' | 'final'; frozenLabel: string }> = ({ status, frozenLabel }) => {
  if (status === 'draft') {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
        {trs('Borrador · solo tú lo ves')}
      </span>
    );
  }
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        {trs('En vivo · provisional')}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end">
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap">
        {trs('Final · congelado')}
      </span>
      {frozenLabel && <span className="text-[9px] text-muted-foreground mt-0.5">{frozenLabel}</span>}
    </span>
  );
};

export default PrizesPanel;
