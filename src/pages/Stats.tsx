import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { usePlayerStats, type PlayerStats, type PlayerMilestone, type CourseSummary, type HoleAvg, type RecentRound } from '@/hooks/usePlayerStats';
import { isPaywallActive } from '@/lib/paywallConfig';
import { fmtPct, fmtAvg, fmtVsPar, vsParColor } from '@/lib/statsFormatters';
import { ProfileDialog } from '@/components/ProfileDialog';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import GreenBookLogo from '@/components/GreenBookLogo';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Loader2, BarChart2, MapPin, TrendingDown, Target, Circle, Feather, Minus, Lock, Check, ChevronDown,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine, CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';

/* ═══════════════ MAIN PAGE ═══════════════ */
const Stats: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { isPro, isFounder } = useSubscription();
  const [courseId, setCourseId] = useState<string | null>(null);
  const { stats, milestones, courses, holeAvgs, recentRounds, loading, error } = usePlayerStats(courseId);
  const [profileOpen, setProfileOpen] = useState(false);

  const canViewStats = isPro || isFounder || !isPaywallActive();
  const selectedCourse = courses.find(c => c.course_id === courseId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <GreenBookLogo height={32} />
        <button onClick={() => setProfileOpen(true)} className="p-0 bg-transparent border-none cursor-pointer">
          <PlayerAvatar
            initials={profile?.initials ?? ''}
            background={profile?.avatar_color ?? '#3B82F6'}
            size="sm"
            isLoggedInUser
          />
        </button>
      </header>

      {/* Course selector */}
      <div className="px-4 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {selectedCourse ? selectedCourse.course_name : 'Global — Todos los campos'}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]" align="start">
            <DropdownMenuItem onClick={() => setCourseId(null)}>
              Global — Todos los campos
            </DropdownMenuItem>
            {courses.map(c => (
              <DropdownMenuItem key={c.course_id} onClick={() => setCourseId(c.course_id)}>
                {c.course_name} ({c.rounds_played})
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-6 pt-4">
        {!stats || stats.rounds_played === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <BarChart2 className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Juega tu primera ronda para ver tus estadísticas</p>
          </div>
        ) : (
          <>
            {/* Section A — KPI Grid */}
            <KPIGrid stats={stats} profile={profile} canViewStats={canViewStats} />

            {!canViewStats && <UpgradeBanner onNavigate={() => navigate('/')} />}

            {canViewStats && (
              <>
                <ScoreDistribution stats={stats} />
                <ParPerformance stats={stats} />
                {courseId && holeAvgs.length > 0 && (
                  <HoleByHoleChart holeAvgs={holeAvgs} courseName={selectedCourse?.course_name ?? ''} />
                )}
                {milestones && <Milestones milestones={milestones} />}
                {recentRounds.length > 0 && <RecentRoundsSection rounds={recentRounds} />}
              </>
            )}
          </>
        )}
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
};

export default Stats;

/* ═══════════════ KPI GRID ═══════════════ */
function KPIGrid({ stats, profile, canViewStats }: { stats: PlayerStats; profile: any; canViewStats: boolean }) {
  const handicap = profile?.current_handicap;
  const hcpColor = handicap == null ? 'text-muted-foreground' : handicap < 18 ? 'text-emerald-500' : handicap < 25 ? 'text-yellow-500' : 'text-red-500';
  const girColor = stats.gir_pct == null ? 'text-muted-foreground' : Number(stats.gir_pct) > 50 ? 'text-emerald-500' : Number(stats.gir_pct) > 30 ? 'text-yellow-500' : 'text-red-500';

  const birdiesPct = stats.holes_played > 0 ? (stats.birdies_count / stats.holes_played) * 100 : null;
  const parsPct = stats.holes_played > 0 ? (stats.pars_count / stats.holes_played) * 100 : null;
  const bogeysPct = stats.holes_played > 0 ? (stats.bogeys_count / stats.holes_played) * 100 : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <KPICard icon={<TrendingDown className={cn("h-5 w-5", hcpColor)} />} label="Handicap" value={handicap?.toFixed(1) ?? '—'} sub={stats.rounds_played > 0 ? `avg score: ${fmtAvg(stats.avg_gross_score)}` : undefined} />
      <KPICard icon={<BarChart2 className="h-5 w-5 text-primary" />} label="Score Promedio" value={fmtAvg(stats.avg_gross_score)} sub={<span className={vsParColor(stats.avg_score_vs_par != null ? Number(stats.avg_score_vs_par) : null)}>vs par: {fmtVsPar(stats.avg_score_vs_par != null ? Number(stats.avg_score_vs_par) : null)}</span>} />
      <KPICard icon={<Target className={cn("h-5 w-5", girColor)} />} label="Greens en Reg." value={fmtPct(stats.gir_pct != null ? Number(stats.gir_pct) : null)} sub={`P3:${fmtPct(stats.gir_pct_par3 != null ? Number(stats.gir_pct_par3) : null, 0)} P4:${fmtPct(stats.gir_pct_par4 != null ? Number(stats.gir_pct_par4) : null, 0)} P5:${fmtPct(stats.gir_pct_par5 != null ? Number(stats.gir_pct_par5) : null, 0)}`} />
      <KPICard icon={<Circle className="h-5 w-5 text-primary" />} label="Putts por GIR" value={fmtAvg(stats.avg_putts_per_gir != null ? Number(stats.avg_putts_per_gir) : null, 2)} sub={`1-putt:${fmtPct(stats.pct_one_putt != null ? Number(stats.pct_one_putt) : null, 0)} 3-putt+:${fmtPct(stats.pct_three_putt_plus != null ? Number(stats.pct_three_putt_plus) : null, 0)}`} />
      <KPICard icon={<Feather className="h-5 w-5 text-emerald-500" />} label="% Birdies" value={fmtPct(birdiesPct)} sub={`Total: ${stats.birdies_count} birdies`} locked={!canViewStats} />
      <KPICard icon={<Minus className="h-5 w-5 text-muted-foreground" />} label="% Pares" value={fmtPct(parsPct)} sub={`Bogeys: ${fmtPct(bogeysPct, 0)}`} locked={!canViewStats} />
    </div>
  );
}

function KPICard({ icon, label, value, sub, locked }: { icon: React.ReactNode; label: string; value: string; sub?: React.ReactNode; locked?: boolean }) {
  return (
    <Card className="rounded-xl p-4 shadow-sm relative">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <div className="relative">
        <p className={cn("text-2xl font-bold", locked && "blur-sm select-none")}>{value}</p>
        {locked && <Lock className="h-4 w-4 text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />}
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

/* ═══════════════ UPGRADE BANNER ═══════════════ */
function UpgradeBanner({ onNavigate }: { onNavigate: () => void }) {
  const items = [
    'Distribución completa de resultados',
    'Putting & GIR por tipo de hoyo',
    'Milestones y logros personales',
    'Promedio por hoyo en cada campo',
  ];
  return (
    <Card className="border-emerald-500/50 bg-emerald-500/10 rounded-xl p-5 space-y-3">
      <h3 className="font-semibold text-foreground">Desbloquea tus estadísticas completas</h3>
      <p className="text-sm text-muted-foreground">GIR detallado, putting, scrambling, milestones, promedio por hoyo y más</p>
      <ul className="space-y-1">
        {items.map(t => (
          <li key={t} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-emerald-500 shrink-0" />{t}</li>
        ))}
      </ul>
      <Button onClick={onNavigate} className="w-full mt-2">Ver planes →</Button>
    </Card>
  );
}

/* ═══════════════ SCORE DISTRIBUTION ═══════════════ */
function ScoreDistribution({ stats }: { stats: PlayerStats }) {
  const total = stats.holes_played || 1;
  const data = [
    { name: 'Águilas', count: stats.eagles_count, pct: ((stats.eagles_count / total) * 100).toFixed(1), fill: 'hsl(var(--primary))' },
    { name: 'Birdies', count: stats.birdies_count, pct: ((stats.birdies_count / total) * 100).toFixed(1), fill: '#22c55e' },
    { name: 'Pares', count: stats.pars_count, pct: ((stats.pars_count / total) * 100).toFixed(1), fill: 'hsl(var(--muted-foreground))' },
    { name: 'Bogeys', count: stats.bogeys_count, pct: ((stats.bogeys_count / total) * 100).toFixed(1), fill: '#eab308' },
    { name: 'Dobles', count: stats.doubles_count, pct: ((stats.doubles_count / total) * 100).toFixed(1), fill: '#f97316' },
    { name: '+3 o peor', count: stats.worse_count, pct: ((stats.worse_count / total) * 100).toFixed(1), fill: '#ef4444' },
  ];

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">Distribución de Resultados</h2>
      <Card className="rounded-xl p-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 60, right: 40, top: 5, bottom: 5 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={55} />
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
              formatter={(value: number, _name: string, props: any) => [`${value} (${props.payload.pct}%)`, 'Hoyos']}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </section>
  );
}

/* ═══════════════ PAR PERFORMANCE ═══════════════ */
function ParPerformance({ stats }: { stats: PlayerStats }) {
  const pars = [
    { par: 3, avg: stats.avg_vs_par_par3, gir: stats.gir_pct_par3 },
    { par: 4, avg: stats.avg_vs_par_par4, gir: stats.gir_pct_par4 },
    { par: 5, avg: stats.avg_vs_par_par5, gir: stats.gir_pct_par5 },
  ];
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">Rendimiento por Par</h2>
      <div className="flex gap-3">
        {pars.map(p => {
          const val = p.avg != null ? Number(p.avg) : null;
          return (
            <Card key={p.par} className="flex-1 rounded-xl p-3 text-center">
              <Badge variant="secondary" className="mb-2">Par {p.par}</Badge>
              <p className={cn("text-xl font-bold", vsParColor(val))}>{fmtVsPar(val)}</p>
              <p className="text-xs text-muted-foreground mt-1">GIR: {fmtPct(p.gir != null ? Number(p.gir) : null, 0)}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/* ═══════════════ HOLE BY HOLE ═══════════════ */
function HoleByHoleChart({ holeAvgs, courseName }: { holeAvgs: HoleAvg[]; courseName: string }) {
  const colorForVsPar = (v: number) => {
    if (v <= -1) return '#22c55e';
    if (v <= 0) return 'hsl(var(--muted-foreground))';
    if (v <= 1) return '#eab308';
    return '#ef4444';
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">Score por Hoyo — {courseName}</h2>
      <Card className="rounded-xl p-4">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={holeAvgs} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="hole_number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
              formatter={(_v: number, _n: string, props: any) => {
                const h = props.payload as HoleAvg;
                return [`${fmtAvg(h.avg_strokes)} avg (${fmtVsPar(h.avg_vs_par)})`, `Hoyo ${h.hole_number} (Par ${h.par})`];
              }}
            />
            <Bar dataKey="avg_strokes" radius={[4, 4, 0, 0]}>
              {holeAvgs.map((h, i) => (
                <Cell key={i} fill={colorForVsPar(Number(h.avg_vs_par))} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground text-center mt-2">{holeAvgs[0]?.rounds_count ?? 0} rondas registradas en este campo</p>
      </Card>
    </section>
  );
}

/* ═══════════════ MILESTONES ═══════════════ */
function Milestones({ milestones: m }: { milestones: PlayerMilestone }) {
  const items = [
    { emoji: '🦅', label: 'Águilas', value: m.eagles_total, zero: true },
    { emoji: '🐦', label: 'Birdies', value: m.birdies_total, zero: true },
    { emoji: '🏆', label: 'Mejor ronda', value: m.best_round_score != null ? `${m.best_round_score}` : '—', sub: m.best_round_course ?? undefined },
    { emoji: '🔥', label: 'Mejor racha', value: `${m.birdie_streak_best}`, sub: 'birdies seguidos', zero: true },
    { emoji: '⛳', label: 'Hoyos jugados', value: m.total_holes },
    { emoji: '📍', label: 'Campos jugados', value: m.unique_courses },
    { emoji: '👥', label: 'Contrincantes', value: m.unique_opponents },
    { emoji: '🎯', label: 'Hoyo en uno', value: m.holes_in_one > 0 ? m.holes_in_one : 'Ninguno aún', special: m.holes_in_one > 0 },
    { emoji: '🏌️', label: 'Sin bogeys', value: `${m.rounds_no_bogey}`, sub: 'rondas', zero: true },
    { emoji: '📊', label: 'Sub-80', value: m.rounds_sub_80 },
    { emoji: '📊', label: 'Sub-90', value: m.rounds_sub_90 },
    { emoji: '📊', label: 'Sub-100', value: m.rounds_sub_100 },
    { emoji: '📈', label: 'Mejora hcp', value: m.handicap_delta != null ? (Number(m.handicap_delta) > 0 ? `▼ ${Number(m.handicap_delta).toFixed(1)}` : fmtVsPar(-Number(m.handicap_delta))) : '—' },
  ];

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">Logros</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {items.map((it, i) => {
          const isZero = (it.zero && (it.value === 0 || it.value === '0'));
          return (
            <div
              key={i}
              className={cn(
                "bg-muted/30 rounded-xl p-3 text-center",
                isZero && "opacity-50",
                it.special && "border border-amber-500/50 bg-amber-500/10"
              )}
            >
              <span className="text-lg">{it.emoji}</span>
              <p className={cn("text-lg font-bold mt-1", it.special && "text-amber-500")}>{it.value}</p>
              {it.sub && <p className="text-[10px] text-muted-foreground">{it.sub}</p>}
              <p className="text-xs text-muted-foreground">{it.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ═══════════════ RECENT ROUNDS ═══════════════ */
function RecentRoundsSection({ rounds }: { rounds: RecentRound[] }) {
  const borderColor = (vsPar: number) => {
    if (vsPar < 0) return 'border-l-emerald-500';
    if (vsPar <= 5) return 'border-l-yellow-500';
    if (vsPar <= 10) return 'border-l-orange-500';
    return 'border-l-red-500';
  };

  const formatDate = (d: string) => {
    try {
      const date = new Date(d + 'T00:00:00');
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(2)}`;
    } catch { return d; }
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">Últimas Rondas</h2>
      <div className="space-y-1.5">
        {rounds.map((r, i) => (
          <div key={i} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-l-4", borderColor(r.vs_par))}>
            <span className="text-xs text-muted-foreground w-16 shrink-0">{formatDate(r.round_date)}</span>
            <span className="text-xs truncate flex-1">{r.course_name}</span>
            <span className="text-sm font-bold tabular-nums w-8 text-right">{r.total_strokes}</span>
            <span className={cn("text-xs tabular-nums w-10 text-right font-medium", vsParColor(r.vs_par))}>{fmtVsPar(r.vs_par)}</span>
            <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{r.total_putts}p</span>
          </div>
        ))}
      </div>
    </section>
  );
}
