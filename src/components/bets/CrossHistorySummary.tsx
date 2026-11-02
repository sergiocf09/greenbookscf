import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCrossHistory, crossHistoryTotal, type CrossHistoryLine } from '@/lib/crossBetHistory';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import i18n from '@/i18n';

export function CrossHistorySummary({ roundId, roundNet }: { roundId: string; roundNet: number }) {
  const { profile } = useAuth();
  const [lines, setLines] = useState<CrossHistoryLine[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!profile) return;
    fetchCrossHistory().then(data => { if (active) setLines(data.filter(line => line.own_round_id === roundId)); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [roundId, profile?.id]);
  const en = i18n.language === 'en';
  if (failed) return <p className="text-sm text-destructive">{en ? 'Crossing results could not be loaded.' : 'No se pudieron cargar los resultados del cruce.'}</p>;
  if (!lines.length) return null;
  const total = crossHistoryTotal(lines);
  const money = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}$${fmtMoney(Math.abs(n))}`;
  return <section className="border-t border-border pt-4 space-y-3">
    <h4 className="font-semibold text-primary">{en ? 'Crossings' : 'Cruces'}</h4>
    {Array.from(new Set(lines.map(line => line.rival_profile_id))).map(id => {
      const group = lines.filter(line => line.rival_profile_id === id);
      return <div key={id} className="space-y-1">
        <div className="flex justify-between gap-2 text-sm"><span className="font-medium">{group[0]?.rival_name}</span><span className="text-muted-foreground">{group.every(line => line.is_final) ? (en ? 'Final' : 'Final') : (en ? 'Provisional' : 'Provisional')}</span></div>
        {group.map(line => <div key={line.line_id} className="flex justify-between gap-2 text-sm"><span className="text-muted-foreground">{line.label}</span><span className={cn('font-semibold tabular-nums', line.net_amount < 0 ? 'text-destructive' : 'text-primary')}>{money(line.net_amount)}</span></div>)}
      </div>;
    })}
    <div className="border-t border-border pt-2 text-sm space-y-1">
      <div className="flex justify-between"><span>{en ? 'Round' : 'Ronda'}</span><span>{money(roundNet)}</span></div>
      <div className="flex justify-between"><span>{en ? 'Crossings' : 'Cruces'}</span><span>{money(total)}</span></div>
      <div className="flex justify-between font-bold"><span>{en ? 'Your total' : 'Tu total'}</span><span>{money(roundNet + total)}</span></div>
    </div>
  </section>;
}