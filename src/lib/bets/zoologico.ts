/**
 * Zoológico Bet Calculator — last-player-pays animal bets
 */
import { Player, BetConfig, ZooAnimalType, ZOO_ANIMALS, ZoologicoBetConfig } from '@/types/golf';
import { resolveConfigForGroup } from '../groupBetOverrides';
import { BetSummary, groupPlayersByGroup, resolveParticipantsForGroup } from './shared';

export interface ZoologicoAnimalResult {
  animalType: ZooAnimalType;
  emoji: string;
  label: string;
  labelPlural: string;
  totalOccurrences: number;
  events: Array<{
    playerId: string;
    playerName: string;
    playerInitials: string;
    holeNumber: number;
    count: number;
  }>;
  valuePerOccurrence: number;
  amountPerPlayer: number;
  loser: {
    playerId: string;
    name: string;
    initials: string;
    color: string;
    totalLoss: number;
  } | null;
  hasTie: boolean;
  tiedPlayers: Player[];
  tieHole: number | null;
}

const parseZooTieBreak = (value?: string | null): { hole: number | null; playerId: string | null } => {
  if (!value) return { hole: null, playerId: null };
  const parts = String(value).split(':');
  if (parts.length === 2) {
    const hole = Number(parts[0]);
    const playerId = parts[1];
    return { hole: Number.isFinite(hole) ? hole : null, playerId: playerId || null };
  }
  return { hole: null, playerId: String(value) };
};

export const calculateZoologicoAnimalResult = (
  animalType: ZooAnimalType,
  players: Player[],
  zoologicoConfig: ZoologicoBetConfig,
): ZoologicoAnimalResult | null => {
  if (!zoologicoConfig?.enabled) return null;
  if (!zoologicoConfig.enabledAnimals?.includes(animalType)) return null;

  const animalInfo = ZOO_ANIMALS[animalType];
  const valuePerOccurrence = zoologicoConfig.valuePerOccurrence || 10;
  const events = zoologicoConfig.events || [];

  const participantIds = zoologicoConfig.participantIds;
  const participantPlayerIds = new Set(
    participantIds && participantIds.length > 0
      ? (() => {
          const inList = players.filter(p => participantIds.includes(p.id));
          return inList.length > 0 ? inList.map(p => p.id) : players.map(p => p.id);
        })()
      : players.map(p => p.id)
  );

  const animalEvents = events.filter(e => e.animalType === animalType && participantPlayerIds.has(e.playerId));
  const mappedEvents = animalEvents.map(e => {
    const player = players.find(p => p.id === e.playerId);
    return { playerId: e.playerId, playerName: player?.name || 'Jugador', playerInitials: player?.initials || '?', holeNumber: e.holeNumber, count: e.count || 1 };
  }).sort((a, b) => a.holeNumber - b.holeNumber);

  const totalOccurrences = mappedEvents.reduce((sum, e) => sum + e.count, 0);
  const amountPerPlayer = totalOccurrences * valuePerOccurrence;

  let loser: ZoologicoAnimalResult['loser'] = null;
  let hasTie = false;
  let tiedPlayers: Player[] = [];
  let tieHole: number | null = null;

  if (animalEvents.length > 0) {
    const maxHole = Math.max(...animalEvents.map(e => e.holeNumber));
    const eventsOnLastHole = animalEvents.filter(e => e.holeNumber === maxHole);
    const playerCountsOnLastHole = new Map<string, number>();
    eventsOnLastHole.forEach(e => { const current = playerCountsOnLastHole.get(e.playerId) || 0; playerCountsOnLastHole.set(e.playerId, current + (e.count || 1)); });
    const maxCount = Math.max(...Array.from(playerCountsOnLastHole.values()));
    const playersWithMaxCount = Array.from(playerCountsOnLastHole.entries()).filter(([, count]) => count === maxCount).map(([playerId]) => playerId);
    const participantCount = participantPlayerIds.size;

    if (playersWithMaxCount.length > 1) {
      hasTie = true;
      tieHole = maxHole;
      tiedPlayers = playersWithMaxCount.map(pid => players.find(p => p.id === pid)).filter((p): p is Player => p !== undefined);
      const tieBreakers = zoologicoConfig.tieBreakers || {};
      const override = parseZooTieBreak(tieBreakers[animalType]);
      if (override.hole === maxHole && override.playerId && playersWithMaxCount.includes(override.playerId)) {
        const loserPlayer = players.find(p => p.id === override.playerId);
        if (loserPlayer) { hasTie = false; loser = { playerId: loserPlayer.id, name: loserPlayer.name, initials: loserPlayer.initials, color: loserPlayer.color, totalLoss: amountPerPlayer * (participantCount - 1) }; }
      }
    } else if (playersWithMaxCount.length === 1) {
      const loserPlayer = players.find(p => p.id === playersWithMaxCount[0]);
      if (loserPlayer) { loser = { playerId: loserPlayer.id, name: loserPlayer.name, initials: loserPlayer.initials, color: loserPlayer.color, totalLoss: amountPerPlayer * (participantCount - 1) }; }
    }
  }

  return { animalType, emoji: animalInfo.emoji, label: animalInfo.label, labelPlural: animalInfo.labelPlural, totalOccurrences, events: mappedEvents, valuePerOccurrence, amountPerPlayer, loser, hasTie, tiedPlayers, tieHole };
};

export const calculateZoologicoBets = (
  players: Player[],
  config: BetConfig,
): BetSummary[] => {
  if (!config.zoologico?.enabled || players.length < 2) return [];
  const allSummaries: BetSummary[] = [];
  const enabledAnimals = config.zoologico.enabledAnimals || ['camello', 'pez', 'gorila'];
  const playersByGroup = groupPlayersByGroup(players);

  playersByGroup.forEach(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    const participatingPlayers = resolveParticipantsForGroup(players, resolved.zoologico.participantIds, groupPlayers);
    if (participatingPlayers.length < 2) return;

    enabledAnimals.forEach(animalType => {
      const result = calculateZoologicoAnimalResult(animalType, groupPlayers, config.zoologico);
      if (!result || !result.loser || result.totalOccurrences === 0) return;
      groupPlayers.forEach(player => {
        if (player.id === result.loser!.playerId) return;
        allSummaries.push({ playerId: player.id, vsPlayer: result.loser!.playerId, betType: `Zoológico ${result.label}`, amount: result.amountPerPlayer, segment: 'total', description: `${result.emoji} ${result.totalOccurrences} incidencias` });
        allSummaries.push({ playerId: result.loser!.playerId, vsPlayer: player.id, betType: `Zoológico ${result.label}`, amount: -result.amountPerPlayer, segment: 'total', description: `${result.emoji} ${result.totalOccurrences} incidencias` });
      });
    });
  });

  return allSummaries;
};
