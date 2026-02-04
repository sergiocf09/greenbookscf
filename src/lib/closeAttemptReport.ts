export type CloseStage =
  | 'validateInputs'
  | 'beginAttempt'
  | 'saveBetConfig'
  | 'writeScores'
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

export interface CloseAttemptReport {
  reportVersion: 1;
  attemptId?: string;
  roundId: string;
  currentRoundStatus: string;
  userId?: string | null;
  createdAt: string;

  playersCount: number;
  loggedPlayers: number;
  guestPlayers: number;
  invalidProfileIds: Array<{ playerId: string; name: string; profileId: string }>;

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
    reportVersion: 1,
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
