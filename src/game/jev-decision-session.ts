import type { ActivePiece, Board } from './engine';
import { rankJevPlacements, type RankedLanding } from './jev-placement';
import { parseJevDecisionResult, type JevDecisionRequest, type JevDecisionResult } from './jev-decision-contract';
import { lockMatchSessionPlayer, resumeMatchSession, type MatchSessionState } from './match-session';
import { getPieceAtSequenceIndex } from './match';

export interface JevAttemptToken { decisionId: string; attempt: number }
export interface JevDecisionSnapshot {
  seed: number;
  sequenceIndex: number;
  board: Board;
  piece: ActivePiece;
  nextPiece: import('./engine').PieceType;
  candidates: RankedLanding[];
  requestBody: string;
}
export interface JevDecisionSession {
  session: MatchSessionState;
  snapshot: JevDecisionSnapshot;
  token: JevAttemptToken;
  status: 'pending' | 'retry-required' | 'ready-to-apply' | 'complete';
  result: JevDecisionResult | null;
}

function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

export function beginJevDecision(session: MatchSessionState, decisionId: string): JevDecisionSession | null {
  const { jev } = session.core;
  if (session.phase !== 'playing' || decisionId.length === 0 || jev.topOut ||
    jev.lockedThisRound || jev.activePiece === null) return null;
  const snapshotSession = structuredClone(session);
  const board = snapshotSession.core.jev.board;
  const piece = snapshotSession.core.jev.activePiece!;
  const sequenceIndex = snapshotSession.core.jev.sequenceIndex;
  const nextPiece = getPieceAtSequenceIndex(snapshotSession.core.seed, Math.min(sequenceIndex + 1, 10_000));
  const candidates = rankJevPlacements(board, piece, nextPiece);
  if (candidates.length === 0) return null;
  const request: JevDecisionRequest = {
    seed: snapshotSession.core.seed, sequenceIndex, board, piece, nextPiece,
    candidates: candidates.map(({ id, lockedPiece }) => ({ id, lockedPiece })),
  };
  return {
    session: freezeTree(snapshotSession),
    snapshot: freezeTree({ seed: request.seed, sequenceIndex, board, piece, nextPiece, candidates, requestBody: JSON.stringify(request) }),
    token: { decisionId, attempt: 1 }, status: 'pending', result: null,
  };
}

function isCurrentAttempt(state: JevDecisionSession, token: JevAttemptToken): boolean {
  return state.status === 'pending' && state.token.decisionId === token.decisionId &&
    state.token.attempt === token.attempt;
}

export function failJevDecision(state: JevDecisionSession, token: JevAttemptToken): JevDecisionSession {
  return isCurrentAttempt(state, token) ? { ...state, status: 'retry-required' } : state;
}

export function retryJevDecision(state: JevDecisionSession): JevDecisionSession {
  return state.status === 'retry-required'
    ? { ...state, status: 'pending', token: { ...state.token, attempt: state.token.attempt + 1 } }
    : state;
}

export function completeJevDecision(
  state: JevDecisionSession,
  token: JevAttemptToken,
  value: unknown,
  liveSession: MatchSessionState = state.session,
): JevDecisionSession {
  if (!isCurrentAttempt(state, token)) return state;
  const result = parseJevDecisionResult(state.snapshot.candidates, value);
  if (!result) return failJevDecision(state, token);
  const liveJev = liveSession.core.jev;
  const snapshotPiece = state.snapshot.piece;
  if (liveSession.phase === 'finished' || liveSession.core.seed !== state.snapshot.seed ||
    liveJev.sequenceIndex !== state.snapshot.sequenceIndex || liveJev.activePiece === null ||
    liveJev.activePiece.type !== snapshotPiece.type || liveJev.activePiece.rotation !== snapshotPiece.rotation ||
    liveJev.activePiece.x !== snapshotPiece.x || liveJev.activePiece.y !== snapshotPiece.y ||
    JSON.stringify(liveJev.board) !== JSON.stringify(state.snapshot.board)) return state;
  const rebased = { ...state, session: liveSession, result, status: 'ready-to-apply' as const };
  if (liveSession.phase === 'paused') {
    return rebased;
  }
  return applyJevResult(rebased);
}

function applyJevResult(state: JevDecisionSession): JevDecisionSession {
  if (state.status !== 'ready-to-apply' || state.result === null || state.session.phase !== 'playing') return state;
  const { board, topOut } = state.result.selectedCandidate;
  return {
    ...state,
    session: lockMatchSessionPlayer(state.session, 'jev', board, topOut),
    status: 'complete',
  };
}

/** Apply a response received during manual pause only after the user resumes. */
export function resumeCompletedJevDecision(state: JevDecisionSession): JevDecisionSession {
  if (state.status !== 'ready-to-apply' || state.session.phase !== 'paused') return state;
  return applyJevResult({ ...state, session: resumeMatchSession(state.session) });
}
