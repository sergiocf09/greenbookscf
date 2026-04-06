import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMoneyRankings } from '@/hooks/useMoneyRankings';
import type { MoneyRanking } from '@/hooks/useMoneyRankings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, ArrowLeft, Loader2, Users, TrendingUp, Crown, LogOut, User } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import GreenBookLogo from '@/components/GreenBookLogo';
import { ProfileDialog } from '@/components/ProfileDialog';

const MoneyRankings = () => {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { rankings, loading, createRanking } = useMoneyRankings();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [formName, setFormName] = useState('');
  const [creating, setCreating] = useState(false);

  const myRankings = rankings.filter(r => r.is_creator);
  const participating = rankings.filter(r => r.is_member && !r.is_creator);

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
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{r.name}</CardTitle>
            <CardDescription className="text-xs">
              {r.is_creator ? 'Creado por ti' : `Creado por ${r.creator_name}`}
              {' · '}{format(new Date(r.created_at), "d MMM yyyy", { locale: es })}
            </CardDescription>
          </div>
          {r.is_creator && (
            <Badge variant="secondary" className="text-[10px]">
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
      {/* Header - matching app's green/gold theme */}
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
        {/* Crear ranking */}
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

        {/* Listado */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="mine">
            <TabsList className="w-full">
              <TabsTrigger value="mine" className="flex-1">Mis Rankings ({myRankings.length})</TabsTrigger>
              <TabsTrigger value="participating" className="flex-1">Participo ({participating.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="mine" className="space-y-3 mt-3">
              {myRankings.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No has creado ningún ranking</p>
                </div>
              ) : myRankings.map(r => <RankingCard key={r.id} r={r} />)}
            </TabsContent>
            <TabsContent value="participating" className="space-y-3 mt-3">
              {participating.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No participas en ningún ranking</p>
                  <p className="text-xs text-muted-foreground mt-1">Pide al organizador que te agregue</p>
                </div>
              ) : participating.map(r => <RankingCard key={r.id} r={r} />)}
            </TabsContent>
          </Tabs>
        )}

        <ProfileDialog open={showProfileDialog} onOpenChange={setShowProfileDialog} />
      </div>
    </div>
  );
};

export default MoneyRankings;
