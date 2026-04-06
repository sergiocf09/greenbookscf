import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMoneyRankings } from '@/hooks/useMoneyRankings';
import type { MoneyRanking } from '@/hooks/useMoneyRankings';
import { useHandicapRanking } from '@/hooks/useHandicapRanking';
import { useLiveHandicap } from '@/hooks/useLiveHandicap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, ArrowLeft, Loader2, Users, TrendingUp, TrendingDown, Crown, LogOut, User, Minus, Award } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import GreenBookLogo from '@/components/GreenBookLogo';
import { ProfileDialog } from '@/components/ProfileDialog';
import { HandicapRankingHeader } from '@/components/handicap/HandicapRankingHeader';
import { sortHandicapRankingEntries, withLiveHandicapOverride, type HandicapRankingSortKey, type HandicapRankingSortDirection } from '@/lib/handicapRankingUtils';
import { HandicapRankingRows } from '@/components/handicap/HandicapRankingRows';

const toTitleCase = (name: string) =>
  name.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

const PositionBadge = ({ rank }: { rank: number }) => (
  <span className="text-xs font-bold text-muted-foreground w-6 text-center">{rank}</span>
);

const TrendIcon = ({ trend }: { trend: number | null }) => {
  if (trend === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
  if (trend < -0.4) return <TrendingDown className="h-3 w-3 text-green-500" />;
  if (trend > 0.4) return <TrendingUp className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

const MoneyRankings = () => {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { rankings, loading, createRanking } = useMoneyRankings();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [formName, setFormName] = useState('');
  const [creating, setCreating] = useState(false);
  const [globalSortKey, setGlobalSortKey] = useState<HandicapRankingSortKey>('handicap');
  const [globalSortDir, setGlobalSortDir] = useState<HandicapRankingSortDirection>('asc');

  const handleGlobalSort = (key: HandicapRankingSortKey) => {
    if (key === globalSortKey) setGlobalSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setGlobalSortKey(key); setGlobalSortDir('asc'); }
  };

  const { entries: globalHcpEntries, loading: loadingGlobalHcp } = useHandicapRanking(null, 'global');
  const { liveHandicapIndex } = useLiveHandicap(profile?.id ?? null, profile?.current_handicap ?? null);

  const visibleRankings = useMemo(() => rankings, [rankings]);
  const displayGlobalHcpEntries = useMemo(
    () => sortHandicapRankingEntries(
      withLiveHandicapOverride(globalHcpEntries, profile?.id ?? null, liveHandicapIndex),
      globalSortKey, globalSortDir,
    ),
    [globalHcpEntries, globalSortKey, globalSortDir, liveHandicapIndex, profile?.id],
  );

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setCreating(true);
    const result = await createRanking(formName);
    setCreating(false);
    if (result) {
      setShowCreateDialog(false);
      setFormName('');
      navigate(`/rankings/${result.id}`);
    }
  };

  const RankingCard = ({ r }: { r: MoneyRanking }) => (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => navigate(`/rankings/${r.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{r.name}</CardTitle>
            <CardDescription className="text-xs">
              {r.is_creator ? 'Creado por ti' : `Creado por ${r.creator_name}`}
              {' · '}{format(new Date(r.created_at), 'd MMM yyyy', { locale: es })}
            </CardDescription>
          </div>
          {r.is_creator && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              <Crown className="h-3 w-3 mr-1" />
              Tuyo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {r.member_count} {r.member_count === 1 ? 'miembro' : 'miembros'}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground py-3 px-4 shadow-lg">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary/80" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <GreenBookLogo />
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-accent" />
            <span className="font-semibold text-sm text-accent">Rankings</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary/80">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowProfileDialog(true)}>
                <User className="h-4 w-4 mr-2" /> Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="w-full" size="lg">
              <Plus className="h-4 w-4 mr-2" /> Crear nuevo ranking
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo ranking</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="ranking-name">Nombre del ranking</Label>
                <Input
                  id="ranking-name"
                  placeholder="Ej: Ranking Semanal, Los Cracks..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Después de crearlo puedes agregar jugadores buscando por nombre.
              </p>
              <Button className="w-full" disabled={!formName.trim() || creating} onClick={handleCreate}>
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Crear ranking
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="mine">
            <TabsList className="w-full">
              <TabsTrigger value="mine" className="flex-1">Mis Rankings</TabsTrigger>
              <TabsTrigger value="global" className="flex-1">Global</TabsTrigger>
            </TabsList>
            <TabsContent value="mine" className="space-y-3 mt-3">
              {visibleRankings.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No tienes rankings todavía</p>
                </div>
              ) : visibleRankings.map(r => <RankingCard key={r.id} r={r} />)}
            </TabsContent>
            <TabsContent value="global" className="space-y-3 mt-3">
              {loadingGlobalHcp ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : displayGlobalHcpEntries.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Award className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Sin datos de hándicap disponibles</p>
                  <p className="text-xs text-muted-foreground">Agrega amigos para ver el ranking global</p>
                </div>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      <span className="inline-flex items-center mb-2">
                        <Award className="h-4 w-4 inline mr-1" />
                        Ranking de Hándicap · Amigos
                      </span>
                      <HandicapRankingHeader sortKey={globalSortKey} onSortChange={setGlobalSortKey} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {displayGlobalHcpEntries.map((entry, idx) => (
                      <React.Fragment key={entry.profile_id}>
                        {idx > 0 && <Separator className="my-1" />}
                        <div className="flex items-center gap-2 py-1">
                          <PositionBadge rank={entry.rank ?? idx + 1} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate leading-tight">
                              {toTitleCase(entry.display_name)}
                              {entry.profile_id === profile?.id && (
                                <span className="text-xs text-muted-foreground ml-1">(tú)</span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground leading-tight">
                              {entry.rounds_played} {entry.rounds_played === 1 ? 'ronda' : 'rondas'}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1 w-12 justify-center">
                              <TrendIcon trend={entry.handicap_trend} />
                              <span className="text-sm font-semibold">{entry.current_handicap.toFixed(1)}</span>
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-center">
                              {entry.avg_gross_score ?? '—'}
                            </span>
                            <span className="text-xs text-muted-foreground w-10 text-center">
                              {entry.best_gross_score ?? '—'}
                            </span>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </CardContent>
                </Card>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Ranking basado en todos tus amigos · HCP actual, promedio y mejor de últimas 20 rondas
              </p>
            </TabsContent>
          </Tabs>
        )}

        <ProfileDialog open={showProfileDialog} onOpenChange={setShowProfileDialog} />
      </div>
    </div>
  );
};

export default MoneyRankings;
