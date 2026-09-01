import { GolfCourse, HoleInfo } from '@/types/golf';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Settings,
  Trophy,
  Users,
  LogOut,
  User,
  Play,
  History,
  Calculator,
  Hash,
  DollarSign,
  RefreshCw,
  TrendingDown,
  HelpCircle,
  Sun,
  Moon,
  BarChart2,
  ScrollText,
  ClipboardList,
  Swords,
} from 'lucide-react';

import GreenBookLogo from '@/components/GreenBookLogo';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { RoundHolesBadge } from '@/components/RoundHolesBadge';
import { FriendsLiveHeaderBadge } from '@/components/friends/FriendsLiveHeaderBadge';
import { supabase } from '@/integrations/supabase/client';
import { devError } from '@/lib/logger';
import { formatPlayerName } from '@/lib/playerInput';

export type AppView =
  | 'setup'
  | 'betsetup'
  | 'scoring'
  | 'scorecard'
  | 'bets'
  | 'handicaps'
  | 'leaderboards'
  | 'rankings'
  | 'stats';

interface AppHeaderProps {
  // View state
  view: AppView;
  course: GolfCourse | null;
  currentHole: number;
  currentHoleInfo: HoleInfo | null;
  holePar: number;
  holeStrokeIndex: number;
  holeYards: number | null | undefined;
  roundHoles?: 9 | 18;

  // Auth / profile
  user: {
    id: string;
    is_anonymous?: boolean;
  } | null;
  profile: {
    id: string;
    display_name: string;
    initials: string;
    avatar_color: string;
    current_handicap?: number;
  } | null;

  // UI state
  theme: string | undefined;
  profileMenuOpen: boolean;

  // Round context
  pendingRounds: Array<{
    roundId: string;
    status: string;
    date: Date;
    courseName?: string;
  }>;
  isRoundStarted: boolean;
  roundState: {
    id: string | null;
    organizerProfileId: string | null;
    status: string;
  };
  linkedLeaderboards: Array<{
    id: string;
    name: string;
    code: string;
    competition_type: string;
  }>;
  attestationCount: number;
  onOpenAttestation: () => void;

  // Audit log
  isRoundAdmin: boolean;
  onOpenAuditLog: () => void;
  crossInvitationsCount: number;
  onOpenCrossInvitations: () => void;
  onCrossInvite?: (profileId: string, name: string, initials: string, color: string, courseName: string, holesPlayed: number) => void;


  // Handlers
  onSetView: (v: AppView) => void;
  onSetTheme: (t: string) => void;
  onSetProfileMenuOpen: (v: boolean) => void;
  onOpenDialog: (name: string) => void;
  onNavigate: (path: string, opts?: { state?: unknown; replace?: boolean }) => void;
  onSignOut: () => Promise<void> | void;
  onSetLeaderboardDetailId: (id: string | null) => void;
  onSetLeaderboardDetailType: (t: 'standard' | 'teams_cup') => void;
  onSetRankingDetailId: (id: string | null) => void;
}

export function AppHeader(props: AppHeaderProps) {
  const {
    view,
    course,
    currentHole,
    currentHoleInfo,
    holePar,
    holeStrokeIndex,
    holeYards,
    roundHoles,
    user,
    profile,
    theme,
    profileMenuOpen,
    pendingRounds,
    attestationCount,
    onOpenAttestation,
    isRoundAdmin,
    onOpenAuditLog,
    crossInvitationsCount,
    onOpenCrossInvitations,
    onCrossInvite,
    roundState,


    onSetView,
    onSetTheme,
    onSetProfileMenuOpen,
    onOpenDialog,
    onNavigate,
    onSignOut,
  } = props;

  const handleHardCacheCleanup = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    } finally {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('cache-cleanup', Date.now().toString());
      window.location.replace(nextUrl.toString());
    }
  };

  return (
    <header className="bg-primary text-primary-foreground py-3 px-4 shadow-lg">
      <div className="max-w-md mx-auto flex items-center">
        {/* Left: Logo */}
        <div className="flex items-center flex-shrink-0">
          <GreenBookLogo height={72} variant="header" />
        </div>

        {/* Center: Hole Info or Live Badge */}
        <div className="flex-1 flex justify-center">
          {view !== 'setup' && course && currentHoleInfo ? (
            <div className="text-center">
              <p className="text-xl font-bold text-primary-foreground">Hoyo {currentHole}</p>
              <p className="text-sm font-bold text-primary-foreground/90">
                Par {holePar} • SI {holeStrokeIndex}
                {holeYards && <span> • {holeYards} yds</span>}
              </p>
              <div className="flex items-center justify-center gap-1.5">
                <p className="text-xs text-primary-foreground/70 truncate">{course.name}</p>
                <RoundHolesBadge holes={roundHoles} onPrimary />
              </div>
            </div>
          ) : view === 'setup' ? (
            <FriendsLiveHeaderBadge onCrossInvite={onCrossInvite} />
          ) : view === 'leaderboards' || view === 'rankings' || view === 'stats' ? (
            <Badge variant="secondary" className="bg-primary-foreground/15 text-primary-foreground border-0 text-sm px-3 py-1">
              {view === 'leaderboards' ? 'Leaderboards' : view === 'rankings' ? 'Rankings' : 'Estadísticas'}
            </Badge>
          ) : null}
        </div>

        {/* Right: Attestation + Friends + Help/Refresh + Profile Menu */}
        <div className="flex items-center flex-shrink-0 gap-1">
          {/* Attestation badge — only when there are pending attestations */}
          {attestationCount > 0 && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-primary-foreground hover:bg-primary-foreground/10"
                onClick={onOpenAttestation}
                aria-label="Scores Attestation"
                title="Scores Attestation"
              >
                <ScrollText className="h-5 w-5" />
              </Button>
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center pointer-events-none">
                {attestationCount > 9 ? '9+' : attestationCount}
              </span>
            </div>
          )}
          {crossInvitationsCount > 0 && (
            <div className="relative">
              <Button variant="ghost" size="icon"
                className="rounded-full text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8"
                onClick={onOpenCrossInvitations} title="Invitaciones de cruce pendientes">
                <Swords className="h-5 w-5" />
              </Button>
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center pointer-events-none">
                {crossInvitationsCount > 9 ? '9+' : crossInvitationsCount}
              </span>
            </div>
          )}
          {/* Friends Button - only show in setup view */}
          {view === 'setup' && (
            <Button
              variant="ghost"
              className="rounded-full text-primary-foreground hover:bg-primary-foreground/10 h-auto w-auto px-2 py-1 flex flex-col items-center gap-0.5"
              onClick={() => onOpenDialog('friends')}
              title="Amigos"
            >
              <Users className="h-5 w-5" />
              <span className="text-[10px] leading-none font-medium">Amigos</span>
            </Button>
          )}
          {/* Help + Refresh stacked vertically */}
          <div className="flex flex-col items-center -space-y-1">
            {view !== 'leaderboards' && view !== 'rankings' && view !== 'stats' && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8"
                onClick={() => onOpenDialog('help')}
              >
                <HelpCircle className="h-7 w-7" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-primary-foreground hover:bg-primary-foreground/10 h-7 w-7"
              onClick={handleHardCacheCleanup}
              aria-label="Limpiar caché y recargar"
              title="Limpiar caché y recargar"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {user?.is_anonymous ? (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => onNavigate('/auth', { state: { returnTo: '/' } })}
            >
              <User className="h-5 w-5" />
            </Button>
          ) : (
            <div className="flex flex-col items-center -space-y-1">
            <DropdownMenu open={profileMenuOpen} onOpenChange={onSetProfileMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  {profile?.initials ? (
                    <div className="relative">
                      {/* Match header look & feel: green ring + subtle gold accent */}
                      <div className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-primary to-accent opacity-80" />
                      <div className="relative rounded-full bg-background p-0.5">
                        <PlayerAvatar
                          initials={profile.initials}
                          background={profile.avatar_color || '#3B82F6'}
                          size="md"
                          className="shadow-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onOpenDialog('profileMenuHelp')}>
                  <HelpCircle className="h-4 w-4 mr-2" />
                  ¿Qué hay en este menú?
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                  {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <p className="font-medium text-sm">{formatPlayerName(profile?.display_name || '')}</p>
                  <p className="text-xs text-muted-foreground">HCP: {profile?.current_handicap}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onOpenDialog('profile')}>
                  <Settings className="h-4 w-4 mr-2" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate('/join')}>
                  <Hash className="h-4 w-4 mr-2" />
                  Unirse con Código
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetView('leaderboards')}>
                  <Trophy className="h-4 w-4 mr-2" />
                  Leaderboards
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetView('rankings')}>
                  <TrendingDown className="h-4 w-4 mr-2" />
                  Rankings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenDialog('history')}>
                  <History className="h-4 w-4 mr-2" />
                  Historial de Rondas
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    // Best-effort repair: if the latest completed round has a snapshot but is missing
                    // persisted balances/ledger (e.g. a past partial close), rebuild from snapshot.
                    try {
                      const { data: latestCompleted, error } = await supabase
                        .from('rounds')
                        .select('id')
                        .eq('status', 'completed')
                        .order('updated_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                      if (!error && latestCompleted?.id) {
                        await supabase.rpc('rebuild_round_financials_from_snapshot', {
                          p_round_id: latestCompleted.id,
                        });
                      }
                    } catch (e) {
                      // Silent: if repair fails, we still open the dialog and let it load normally.
                      devError('Balances repair attempt failed:', e);
                    }

                    onOpenDialog('balances');
                  }}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Balances Históricos
                </DropdownMenuItem>
                {pendingRounds && pendingRounds.length > 0 && (
                  <DropdownMenuItem onClick={() => onOpenDialog('pendingRound')}>
                    <Play className="h-4 w-4 mr-2 text-destructive" />
                    <span>Rondas Pendientes</span>
                    <span className="ml-1 text-destructive font-semibold">({pendingRounds.length})</span>
                  </DropdownMenuItem>
                )}
                {crossInvitationsCount > 0 && (
                  <DropdownMenuItem onClick={() => { onSetProfileMenuOpen(false); onOpenCrossInvitations(); }}>
                    <Swords className="h-4 w-4 mr-2 text-primary" />
                    <span>Cruces Pendientes</span>
                    <span className="ml-1 text-primary font-semibold">({crossInvitationsCount})</span>
                  </DropdownMenuItem>
                )}
                {isRoundAdmin && roundState.id && roundState.status !== 'setup' && (
                  <DropdownMenuItem onClick={() => { onSetProfileMenuOpen(false); onOpenAuditLog(); }}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    <span>Bitácora de Ronda</span>
                  </DropdownMenuItem>
                )}

                {attestationCount > 0 && (
                  <DropdownMenuItem onClick={() => { onSetProfileMenuOpen(false); onOpenAttestation(); }}>
                    <ScrollText className="h-4 w-4 mr-2 text-destructive" />
                    <span>Scores Attestation</span>
                    <span className="ml-1 text-destructive font-semibold">({attestationCount})</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    onSetProfileMenuOpen(false);
                    onSetView('stats');
                  }}
                >
                  <BarChart2 className="h-4 w-4 mr-2" />
                  Estadísticas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenDialog('handicap')}>
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcular Handicap
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenDialog('handicapHistory')}>
                  <TrendingDown className="h-4 w-4 mr-2" />
                  Historial de Handicap
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSignOut()} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Cerrar Sesión
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] text-muted-foreground">
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:underline">
                    Términos
                  </a>
                  <span>·</span>
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline">
                    Privacidad
                  </a>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            {isRoundAdmin && roundState.id && roundState.status !== 'setup' && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-primary-foreground hover:bg-primary-foreground/10 h-7 w-7"
                onClick={onOpenAuditLog}
                aria-label="Bitácora de ronda"
                title="Bitácora de ronda"
              >
                <ClipboardList className="h-4 w-4" />
              </Button>
            )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
