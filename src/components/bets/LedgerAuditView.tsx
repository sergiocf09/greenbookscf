/**
 * LedgerAuditView
 * 
 * Shows a complete breakdown of the snapshot ledger grouped by bet type.
 * Lets the organizer verify that all results were correctly saved on close.
 * Only visible when a valid snapshot exists.
 */

import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Shield, DollarSign } from 'lucide-react';
import { SnapshotLedgerEntry, SnapshotPlayer } from '@/lib/roundSnapshot';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface LedgerAuditViewProps {
  ledger: SnapshotLedgerEntry[];
  players: SnapshotPlayer[];
  /** The logged-in user's snapshot player id (for perspective) */
  myPlayerId?: string;
  isOrganizer?: boolean;
}

// ── helpers ────────────────────────────────────────────────

const BET_TYPE_ORDER = [
  'Medal', 'Presiones', 'Skins', 'Rayas', 'Oyes',
  'Carritos', 'Presiones Parejas', 'Caros', 'Unidades',
  'Manchas', 'Culebras', 'Pingüinos', 'Zoológico',
  'Coneja', 'Medal General', 'Stableford', 'Putts', 'Side Bet',
];

const groupByBetType = (ledger: SnapshotLedgerEntry[]) => {
  const map = new Map<string, SnapshotLedgerEntry[]>();
  for (const entry of ledger) {
    if (entry.amount <= 0) continue;
    const key = entry.betType;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }
  // Sort by known order, unknowns at end
  const sorted = new Map(
    [...map.entries()].sort(([a], [b]) => {
      const ai = BET_TYPE_ORDER.findIndex(t => a.startsWith(t));
      const bi = BET_TYPE_ORDER.findIndex(t => b.startsWith(t));
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
  );
  return sorted;
};

const segmentLabel = (seg: string, hole?: number) => {
  if (seg === 'front') return 'Delantera';
  if (seg === 'back') return 'Trasera';
  if (seg === 'total') return 'Total';
  if (seg === 'hole' && hole) return `Hoyo ${hole}`;
  return seg;
};

const fmt = (n: number) => `$${n.toLocaleString('es-MX')}`;

// ── sub-components ──────────────────────────────────────────

interface EntryRowProps {
  entry: SnapshotLedgerEntry;
  players: SnapshotPlayer[];
  myPlayerId?: string;
}

const EntryRow: React.FC<EntryRowProps> = ({ entry, players, myPlayerId }) => {
  const fromPlayer = players.find(p => p.id === entry.fromPlayerId);
  const toPlayer = players.find(p => p.id === entry.toPlayerId);

  const isUserWinning = entry.toPlayerId === myPlayerId;
  const isUserLosing = entry.fromPlayerId === myPlayerId;
  const isUserInvolved = isUserWinning || isUserLosing;

  return (
    <div className={cn(
      'flex items-center gap-2 py-2 px-3 rounded-lg text-sm',
      isUserWinning && 'bg-green-500/10 dark:bg-green-900/20',
      isUserLosing && 'bg-destructive/10',
      !isUserInvolved && 'bg-muted/30',
    )}>
      {/* From player */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {fromPlayer && (
          <PlayerAvatar
            initials={fromPlayer.initials}
            background={fromPlayer.color}
            size="sm"
            isLoggedInUser={fromPlayer.id === myPlayerId}
          />
        )}
        <span className={cn(
          'truncate text-xs font-medium',
          entry.fromPlayerId === myPlayerId ? 'text-destructive' : 'text-foreground'
        )}>
          {entry.fromPlayerName}
        </span>
      </div>

      {/* Arrow + amount */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <div className={cn(
          'text-xs font-bold',
          isUserWinning ? 'text-green-600' : isUserLosing ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {fmt(entry.amount)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {segmentLabel(entry.segment, entry.holeNumber)}
        </div>
      </div>

      {/* Arrow icon */}
      <span className="text-muted-foreground shrink-0">→</span>

      {/* To player */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className={cn(
          'truncate text-xs font-medium text-right',
          entry.toPlayerId === myPlayerId ? 'text-green-600' : 'text-foreground'
        )}>
          {entry.toPlayerName}
        </span>
        {toPlayer && (
          <PlayerAvatar
            initials={toPlayer.initials}
            background={toPlayer.color}
            size="sm"
            isLoggedInUser={toPlayer.id === myPlayerId}
          />
        )}
      </div>
    </div>
  );
};

interface BetGroupProps {
  betType: string;
  entries: SnapshotLedgerEntry[];
  players: SnapshotPlayer[];
  myPlayerId?: string;
}

const BetGroup: React.FC<BetGroupProps> = ({ betType, entries, players, myPlayerId }) => {
  const [expanded, setExpanded] = useState(false);

  const typeTotal = entries.reduce((s, e) => s + e.amount, 0);
  
  // Calculate user's net for this bet type
  const userNet = entries.reduce((s, e) => {
    if (e.toPlayerId === myPlayerId) return s + e.amount;
    if (e.fromPlayerId === myPlayerId) return s - e.amount;
    return s;
  }, 0);

  const hasUserInvolved = entries.some(e => e.toPlayerId === myPlayerId || e.fromPlayerId === myPlayerId);

  return (
    <div className={cn(
      'border border-border rounded-xl overflow-hidden',
      hasUserInvolved && userNet > 0 && 'border-green-500/30',
      hasUserInvolved && userNet < 0 && 'border-destructive/30',
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-card hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{betType}</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {entries.length} transacción{entries.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasUserInvolved && myPlayerId && (
            <span className={cn(
              'text-sm font-bold',
              userNet > 0 ? 'text-green-600' : userNet < 0 ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {userNet > 0 ? '+' : ''}{fmt(userNet)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {fmt(typeTotal)} total
          </span>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Entries */}
      {expanded && (
        <div className="px-2 pb-2 pt-1 space-y-1 bg-muted/10">
          {entries.map((entry, i) => (
            <EntryRow key={i} entry={entry} players={players} myPlayerId={myPlayerId} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Summary row per player ──────────────────────────────────

interface PlayerSummaryRowProps {
  player: SnapshotPlayer;
  ledger: SnapshotLedgerEntry[];
  myPlayerId?: string;
}

const PlayerSummaryRow: React.FC<PlayerSummaryRowProps> = ({ player, ledger, myPlayerId }) => {
  const won = ledger.filter(e => e.toPlayerId === player.id).reduce((s, e) => s + e.amount, 0);
  const lost = ledger.filter(e => e.fromPlayerId === player.id).reduce((s, e) => s + e.amount, 0);
  const net = won - lost;

  return (
    <div className={cn(
      'flex items-center gap-2 py-2.5 px-3 rounded-lg',
      player.id === myPlayerId ? 'bg-primary/10 border border-primary/30' : 'bg-muted/20',
    )}>
      <PlayerAvatar
        initials={player.initials}
        background={player.color}
        size="md"
        isLoggedInUser={player.id === myPlayerId}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{player.name}</p>
        <p className="text-xs text-muted-foreground">
          Ganó {fmt(won)} · Perdió {fmt(lost)}
        </p>
      </div>
      <div className={cn(
        'text-base font-bold shrink-0',
        net > 0 ? 'text-green-600' : net < 0 ? 'text-destructive' : 'text-muted-foreground'
      )}>
        {net > 0 ? <TrendingUp className="h-4 w-4 inline mr-0.5" /> : net < 0 ? <TrendingDown className="h-4 w-4 inline mr-0.5" /> : <Minus className="h-4 w-4 inline mr-0.5" />}
        {net >= 0 ? '+' : ''}{fmt(net)}
      </div>
    </div>
  );
};

// ── Main component ──────────────────────────────────────────

export const LedgerAuditView: React.FC<LedgerAuditViewProps> = ({
  ledger,
  players,
  myPlayerId,
  isOrganizer,
}) => {
  const [view, setView] = useState<'summary' | 'detail'>('summary');

  const grouped = useMemo(() => groupByBetType(ledger), [ledger]);
  const grandTotal = useMemo(() => ledger.reduce((s, e) => s + (e.amount > 0 ? e.amount : 0), 0), [ledger]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const netA = ledger.filter(e => e.toPlayerId === a.id).reduce((s, e) => s + e.amount, 0)
                 - ledger.filter(e => e.fromPlayerId === a.id).reduce((s, e) => s + e.amount, 0);
      const netB = ledger.filter(e => e.toPlayerId === b.id).reduce((s, e) => s + e.amount, 0)
                 - ledger.filter(e => e.fromPlayerId === b.id).reduce((s, e) => s + e.amount, 0);
      return netB - netA;
    });
  }, [players, ledger]);

  if (ledger.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">Sin datos de ledger</p>
        <p className="text-xs mt-1">Esta ronda no tiene apuestas registradas en el snapshot.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">Auditoría del Ledger</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-full px-2.5 py-1">
          <DollarSign className="h-3 w-3" />
          {ledger.length} transacciones · {fmt(grandTotal)} total
        </div>
      </div>

      {/* View toggle */}
      <div className="flex rounded-lg bg-muted/50 p-0.5 gap-0.5">
        <button
          onClick={() => setView('summary')}
          className={cn(
            'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
            view === 'summary' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Resumen por jugador
        </button>
        <button
          onClick={() => setView('detail')}
          className={cn(
            'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
            view === 'detail' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Desglose por tipo
        </button>
      </div>

      {view === 'summary' && (
        <div className="space-y-2">
          {sortedPlayers.map(player => (
            <PlayerSummaryRow key={player.id} player={player} ledger={ledger} myPlayerId={myPlayerId} />
          ))}
          {/* Verification: net sum across all players should be $0 (zero-sum) */}
          {(() => {
            const netByPlayer = new Map<string, number>();
            for (const e of ledger) {
              if (e.amount <= 0) continue;
              netByPlayer.set(e.toPlayerId, (netByPlayer.get(e.toPlayerId) || 0) + e.amount);
              netByPlayer.set(e.fromPlayerId, (netByPlayer.get(e.fromPlayerId) || 0) - e.amount);
            }
            const grandNet = Array.from(netByPlayer.values()).reduce((s, v) => s + v, 0);
            const isZeroSum = Math.abs(grandNet) < 0.01;
            return (
              <div className={cn(
                'flex items-center justify-center gap-1.5 text-xs pt-1',
                isZeroSum ? 'text-green-600' : 'text-destructive'
              )}>
                {isZeroSum
                  ? <><span className="font-medium">✓ Suma de netos = $0</span><span className="text-muted-foreground">(partida zero-sum)</span></>
                  : <><span className="font-medium">⚠ Suma de netos = ${grandNet}</span><span className="text-muted-foreground">(esperado $0)</span></>
                }
              </div>
            );
          })()}
        </div>
      )}

      {view === 'detail' && (
        <div className="space-y-2">
          {[...grouped.entries()].map(([betType, entries]) => (
            <BetGroup
              key={betType}
              betType={betType}
              entries={entries}
              players={players}
              myPlayerId={myPlayerId}
            />
          ))}
        </div>
      )}
    </div>
  );
};
