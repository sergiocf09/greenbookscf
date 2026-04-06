import React, { useMemo, useState } from 'react';
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
import { Plus, Loader2, Users, TrendingUp, Crown, Award } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { HandicapRankingHeader } from '@/components/handicap/HandicapRankingHeader';
import { sortHandicapRankingEntries, withLiveHandicapOverride, type HandicapRankingSortKey, type HandicapRankingSortDirection } from '@/lib/handicapRankingUtils';
import { HandicapRankingRows } from '@/components/handicap/HandicapRankingRows';

interface RankingsInlineViewProps {
  onNavigateToDetail: (rankingId: string) => void;
}

export const RankingsInlineView: React.FC<RankingsInlineViewProps> = ({ onNavigateToDetail }) => {
  const { profile } = useAuth();
  const { rankings, loading, createRanking } = useMoneyRankings();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
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
      onNavigateToDetail(result.id);
    }
  };

  const RankingCard = ({ r }: { r: MoneyRanking }) => (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => onNavigateToDetail(r.id)}
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
    <div className="space-y-4">
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
              <Label htmlFor="ranking-name-inline">Nombre del ranking</Label>
              <Input
                id="ranking-name-inline"
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
            {rankings.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No tienes rankings todavía</p>
              </div>
            ) : rankings.map(r => <RankingCard key={r.id} r={r} />)}
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
                <CardHeader className="pb-1 px-3">
                  <CardTitle className="text-sm text-center">
                    Scoring Ranking - Amigos</CardTitle>
                </CardHeader>
                <CardHeader className="pb-1 px-3 pt-0">
                  <CardTitle className="text-sm">
                    <HandicapRankingHeader sortKey={globalSortKey} sortDirection={globalSortDir} onSortChange={handleGlobalSort} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-3">
                  <HandicapRankingRows entries={displayGlobalHcpEntries} currentProfileId={profile?.id} />
                </CardContent>
              </Card>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Ranking basado en todos tus amigos · HCP actual, promedio y mejor de últimas 20 rondas
            </p>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
