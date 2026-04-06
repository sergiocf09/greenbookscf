import React, { createContext, useContext, useState, useCallback } from 'react';
import { Player, PlayerScore, BetConfig, PlayerGroup } from '@/types/golf';
import { defaultBetConfig } from '@/components/setup/bets/defaultBetConfig';

export interface RoundContextType {
  players: Player[];
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  selectedCourseId: string | null;
  setSelectedCourseId: React.Dispatch<React.SetStateAction<string | null>>;
  betConfig: BetConfig;
  setBetConfig: React.Dispatch<React.SetStateAction<BetConfig>>;
  currentHole: number;
  setCurrentHole: React.Dispatch<React.SetStateAction<number>>;
  scores: Map<string, PlayerScore[]>;
  setScores: React.Dispatch<React.SetStateAction<Map<string, PlayerScore[]>>>;
  confirmedHoles: Set<number>;
  setConfirmedHoles: React.Dispatch<React.SetStateAction<Set<number>>>;
  currentBetSummaries: any[];
  setCurrentBetSummaries: React.Dispatch<React.SetStateAction<any[]>>;
  teeColor: 'blue' | 'white' | 'yellow' | 'red';
  setTeeColor: React.Dispatch<React.SetStateAction<'blue' | 'white' | 'yellow' | 'red'>>;
  startingHole: 1 | 10;
  setStartingHole: React.Dispatch<React.SetStateAction<1 | 10>>;
  playerGroups: PlayerGroup[];
  setPlayerGroups: React.Dispatch<React.SetStateAction<PlayerGroup[]>>;
  quickScorePlayer: Player | null;
  setQuickScorePlayer: React.Dispatch<React.SetStateAction<Player | null>>;
  resetRoundState: () => void;
}

const RoundContext = createContext<RoundContextType | undefined>(undefined);

export const RoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [betConfig, setBetConfig] = useState<BetConfig>(defaultBetConfig);
  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<Map<string, PlayerScore[]>>(new Map());
  const [confirmedHoles, setConfirmedHoles] = useState<Set<number>>(new Set());
  const [currentBetSummaries, setCurrentBetSummaries] = useState<any[]>([]);
  const [teeColor, setTeeColor] = useState<'blue' | 'white' | 'yellow' | 'red'>('white');
  const [startingHole, setStartingHole] = useState<1 | 10>(1);
  const [playerGroups, setPlayerGroups] = useState<PlayerGroup[]>([]);
  const [quickScorePlayer, setQuickScorePlayer] = useState<Player | null>(null);

  const resetRoundState = useCallback(() => {
    setPlayers([]);
    setSelectedCourseId(null);
    setBetConfig(defaultBetConfig);
    setCurrentHole(1);
    setScores(new Map());
    setConfirmedHoles(new Set());
    setCurrentBetSummaries([]);
    setTeeColor('white');
    setStartingHole(1);
    setPlayerGroups([]);
    setQuickScorePlayer(null);
  }, []);

  return (
    <RoundContext.Provider value={{
      players, setPlayers,
      selectedCourseId, setSelectedCourseId,
      betConfig, setBetConfig,
      currentHole, setCurrentHole,
      scores, setScores,
      confirmedHoles, setConfirmedHoles,
      currentBetSummaries, setCurrentBetSummaries,
      teeColor, setTeeColor,
      startingHole, setStartingHole,
      playerGroups, setPlayerGroups,
      quickScorePlayer, setQuickScorePlayer,
      resetRoundState,
    }}>
      {children}
    </RoundContext.Provider>
  );
};

export const useRound = () => {
  const ctx = useContext(RoundContext);
  if (!ctx) throw new Error('useRound must be used within RoundProvider');
  return ctx;
};
