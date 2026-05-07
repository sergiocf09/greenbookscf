import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Share2, Sliders, Play, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CourseSelect } from '@/components/setup/CourseSelect';
import { PlayerSetup } from '@/components/setup/PlayerSetup';
import { Player, PlayerGroup, PlayerScore, GolfCourse } from '@/types/golf';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { devError } from '@/lib/logger';

type DialogName =
  | 'profile' | 'history' | 'balances' | 'handicap' | 'handicapHistory'
  | 'scorecard' | 'share' | 'addPlayer' | 'leaderboard' | 'linkLeaderboard'
  | 'handicapMatrix' | 'closeAttempt' | 'closeConfirm' | 'pendingRound'
  | 'friends' | 'addFromFriends' | 'onboarding' | 'help' | 'profileMenuHelp'
  | 'roundShare';

type AppView = 'setup' | 'betsetup' | 'scoring' | 'scorecard'
             | 'bets' | 'handicaps' | 'leaderboards' | 'rankings' | 'stats';

interface SetupViewProps {
  players: Player[];
  playerGroups: PlayerGroup[];
  course: GolfCourse | null;
  selectedCourseId: string | null;
  teeColor: 'blue' | 'white' | 'yellow' | 'red';
  startingHole: 1 | 10;
  roundHoles?: 9 | 18;
  roundState: {
    id: string | null;
    groupId: string | null;
    organizerProfileId: string | null;
    status: string;
    date: Date;
  };
  profile: {
    id: string;
    display_name: string;
    initials: string;
    avatar_color: string;
  } | null;
  isRoundStarted: boolean;
  isLoading: boolean;
  canCreateRound: boolean;
  canStartScoring: boolean;
  enableCourseCatalog: boolean;
  roundPlayerIds: Map<string, string>;

  // Handlers
  onCourseChange: (id: string | null) => void;
  onTeeColorChange: (c: 'blue' | 'white' | 'yellow' | 'red') => void;
  onStartingHoleChange: (h: 1 | 10) => void;
  onRoundHolesChange: (h: 9 | 18) => void;
  onPlayersChange: (players: Player[]) => void;
  onAddGroup: () => Promise<void> | void;
  onGroupPlayersChange: (groupId: string, players: Player[]) => Promise<void> | void;
  onAddFromFriendsClick: (groupId: string | null) => void;
  onOpenDialog: (name: DialogName) => void;
  onSetView: (v: AppView) => void;
  onCreateRound: () => Promise<void> | void;
  onStartRound: () => Promise<void> | void;
  onContinueRound: () => void;
  setRoundDate: (date: Date) => void;

  // Group deletion side effects
  setScores: (fn: (prev: Map<string, PlayerScore[]>) => Map<string, PlayerScore[]>) => void;
  setRoundPlayerIds: (fn: (prev: Map<string, string>) => Map<string, string>) => void;
  setPlayerGroups: (fn: (prev: PlayerGroup[]) => PlayerGroup[]) => void;
}

export function SetupView(props: SetupViewProps) {
  const {
    players, playerGroups, selectedCourseId, teeColor, startingHole,
    roundHoles,
    roundState, profile, isRoundStarted, isLoading,
    canCreateRound, canStartScoring, enableCourseCatalog,
    onCourseChange, onTeeColorChange, onStartingHoleChange, onRoundHolesChange,
    onPlayersChange, onAddGroup, onGroupPlayersChange,
    onAddFromFriendsClick, onOpenDialog, onSetView,
    onCreateRound, onStartRound, onContinueRound, setRoundDate,
    setScores, setRoundPlayerIds, setPlayerGroups,
  } = props;

  return (
    <>
      {/* Date Picker */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
        <span className="text-sm font-medium">Fecha de la Ronda</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal",
                !roundState.date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(roundState.date, "d 'de' MMMM, yyyy", { locale: es })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={roundState.date}
              onSelect={(date) => date && setRoundDate(date)}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      <CourseSelect
        selectedCourseId={selectedCourseId}
        onChange={onCourseChange}
        teeColor={teeColor}
        onTeeColorChange={onTeeColorChange}
        startingHole={startingHole}
        onStartingHoleChange={onStartingHoleChange}
        enabled={enableCourseCatalog}
      />

      {/* Round length selector — 9 vs 18 holes */}
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Hoyos a jugar</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={(roundHoles ?? 18) === 18 ? 'default' : 'outline'}
              size="sm"
              className="h-8"
              onClick={() => onRoundHolesChange(18)}
              disabled={isRoundStarted}
            >
              18 hoyos
            </Button>
            <Button
              type="button"
              variant={(roundHoles ?? 18) === 9 ? 'default' : 'outline'}
              size="sm"
              className="h-8"
              onClick={() => onRoundHolesChange(9)}
              disabled={isRoundStarted}
            >
              9 hoyos
            </Button>
          </div>
        </div>
        {(roundHoles ?? 18) === 9 && (
          <p className="text-[11px] text-muted-foreground">
            Las apuestas computan solo el primer nine. Back 9 y Total 18 quedan deshabilitados.
          </p>
        )}
      </div>
      <PlayerSetup
        players={players}
        onChange={onPlayersChange}
        maxPlayers={6}
        showAddGroupButton={true}
        onAddGroupClick={onAddGroup}
        courseId={selectedCourseId}
        defaultTeeColor={teeColor}
        onAddFromFriendsClick={() => onAddFromFriendsClick(null)}
        organizerProfileId={roundState.organizerProfileId}
        roundId={roundState.id}
      />

      {/* Additional Groups */}
      {playerGroups.map((group) => (
        <div key={group.id} className="space-y-2">
          <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
            <span className="text-sm font-medium">{group.name}</span>
            {profile?.id === roundState.organizerProfileId && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                  >
                    Eliminar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar {group.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se eliminarán todos los jugadores y scores de este grupo. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        if (roundState.id) {
                          try {
                            const { error: rpErr } = await supabase
                              .from('round_players')
                              .delete()
                              .eq('group_id', group.id);
                            if (rpErr) throw rpErr;
                            const { error: rgErr } = await supabase
                              .from('round_groups')
                              .delete()
                              .eq('id', group.id);
                            if (rgErr) throw rgErr;
                          } catch (err: unknown) {
                            devError('Error deleting group from DB:', err);
                            toast.error('Error al eliminar grupo');
                            return;
                          }
                        }
                        const groupPlayerIds = new Set(group.players.map(p => p.id));
                        setScores(prev => {
                          const next = new Map(prev);
                          groupPlayerIds.forEach(id => next.delete(id));
                          return next;
                        });
                        setRoundPlayerIds(prev => {
                          const next = new Map(prev);
                          groupPlayerIds.forEach(id => {
                            next.delete(id);
                            const player = group.players.find(p => p.id === id);
                            if (player?.profileId) next.delete(player.profileId);
                          });
                          return next;
                        });
                        setPlayerGroups(prev => prev.filter(g => g.id !== group.id));
                        toast.success(`${group.name} eliminado`);
                      }}
                    >
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <PlayerSetup
            players={group.players}
            onChange={(newPlayers) => {
              void onGroupPlayersChange(group.id, newPlayers);
            }}
            maxPlayers={6}
            courseId={selectedCourseId}
            defaultTeeColor={teeColor}
            onAddFromFriendsClick={() => onAddFromFriendsClick(group.id)}
            organizerProfileId={roundState.organizerProfileId}
            roundId={roundState.id}
          />
        </div>
      ))}

      {/* Share Options Button - show after round is created */}
      {roundState.id && (
        <Button
          variant="outline"
          onClick={() => onOpenDialog('share')}
          className="w-full"
        >
          <Share2 className="h-4 w-4 mr-2" />
          Invitar Jugadores (Link, QR, Código)
        </Button>
      )}

      {/* Handicap Definition Button - show when 2+ players */}
      {players.length >= 2 && roundState.id && (
        <Button
          variant="outline"
          onClick={() => onSetView('handicaps')}
          className="w-full"
        >
          <Sliders className="h-4 w-4 mr-2" />
          Definir Hándicaps entre Jugadores
        </Button>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        {!roundState.id && (
          <Button
            onClick={() => void onCreateRound()}
            disabled={!canCreateRound || isLoading}
            className="w-full"
            variant="outline"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Crear Ronda y Obtener Link, QR & Código
          </Button>
        )}

        {!isRoundStarted ? (
          <Button
            onClick={() => void onStartRound()}
            disabled={!canStartScoring || isLoading}
            className="w-full"
          >
            <Play className="h-4 w-4 mr-2" />
            Iniciar Ronda
          </Button>
        ) : (
          <>
            <Button
              onClick={onContinueRound}
              className="w-full"
            >
              <Play className="h-4 w-4 mr-2" />
              Continuar Ronda
            </Button>
            <Button
              variant="outline"
              disabled
              className="w-full opacity-50"
            >
              <Lock className="h-4 w-4 mr-2" />
              Ronda Iniciada
            </Button>
          </>
        )}
      </div>
    </>
  );
}
