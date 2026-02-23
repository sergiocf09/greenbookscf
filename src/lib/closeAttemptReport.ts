export type CloseStage =
  | 'validateInputs'
  | 'beginAttempt'
  | 'saveBetConfig'
  | 'writeScores'
  | 'canonicalNormalization'
  | 'preValidation'
  | 'overrideValidation'
  | 'finalizeRoundBets'
  | 'createSnapshot'
  | 'saveSnapshot'
  | 'rebuildFinancials'
  | 'saveHandicapHistory'
  | 'updateSliding'
  | 'setRoundClosed';

export type CloseStageResult =
  | { stage: CloseStage; ok: true; at: string }
  | { stage: CloseStage; ok: false; at: string; message: string; code?: string | number };

// ── Enriched logging types (Point 5) ──────────────────────────────────────────

export interface ClosePlayerSummary {
  id: string;
  name: string;
  isGuest: boolean;
  handicap: number;
  profileId?: string;
}

export interface CloseBalanceSummary {
  playerId: string;
  playerName: string;
  engineNet: number;   // Net from recalculated engine
  uiNet: number;       // Net from UI-provided results
  delta: number;        // engineNet - uiNet
}

export interface CloseOverrideSummary {
  playerAId: string;
  playerBId: string;
  betType: string;
  action: string;       // 'cancel' | 'restore' | etc.
  valid: boolean;       // Both IDs exist in round
}

export interface CloseAttemptReport {
  reportVersion: 2;
  attemptId?: string;
  roundId: string;
  currentRoundStatus: string;
  userId?: string | null;
  createdAt: string;

  playersCount: number;
  loggedPlayers: number;
  guestPlayers: number;
  invalidProfileIds: Array<{ playerId: string; name: string; profileId: string }>;

  // Enriched data (Point 5)
  playerSummaries?: ClosePlayerSummary[];
  balanceComparison?: CloseBalanceSummary[];
  overrideSummaries?: CloseOverrideSummary[];
  orphanedOverrides?: number;
  normalizedBets?: string[];  // List of bet types where guests were auto-added

  stages: CloseStageResult[];
  failedStage?: CloseStage;
  error?: {
    message: string;
    code?: string | number;
  };
}

export const newCloseAttemptReport = (params: {
  roundId: string;
  currentRoundStatus: string;
  userId?: string | null;
  playersCount: number;
  loggedPlayers: number;
  guestPlayers: number;
  invalidProfileIds: Array<{ playerId: string; name: string; profileId: string }>;
}): CloseAttemptReport => {
  return {
    reportVersion: 2,
    roundId: params.roundId,
    currentRoundStatus: params.currentRoundStatus,
    userId: params.userId ?? null,
    createdAt: new Date().toISOString(),
    playersCount: params.playersCount,
    loggedPlayers: params.loggedPlayers,
    guestPlayers: params.guestPlayers,
    invalidProfileIds: params.invalidProfileIds,
    stages: [],
  };
};

export const pushStageOk = (r: CloseAttemptReport, stage: CloseStage) => {
  r.stages.push({ stage, ok: true, at: new Date().toISOString() });
};

export const pushStageFail = (r: CloseAttemptReport, stage: CloseStage, err: unknown) => {
  const e = err as any;
  r.failedStage = stage;
  r.stages.push({
    stage,
    ok: false,
    at: new Date().toISOString(),
    message: String(e?.message ?? e ?? 'Error'),
    code: e?.code ?? e?.status ?? e?.statusCode,
  });
  r.error = {
    message: String(e?.message ?? e ?? 'Error'),
    code: e?.code ?? e?.status ?? e?.statusCode,
  };
};

export const formatCloseAttemptReport = (r: CloseAttemptReport) => JSON.stringify(r, null, 2);
