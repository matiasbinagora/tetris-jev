import type { ActivePiece, Board } from './engine';
import { rankJevPlacements, type RankedLanding } from './jev-placement';
import { parseJevDecisionResult, type JevDecisionRequest, type JevDecisionResult } from './jev-decision-contract';
import { pauseMatchSession, settleMatchSession, type MatchSessionState } from './match-session';
import { peekNextPiece } from './match';

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
  status: 'pending' | 'retry-required' | 'complete';
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
  const { human, jev } = session.core;
  if (session.phase !== 'playing' || decisionId.length === 0 || human.topOut || jev.topOut ||
    jev.lockedThisRound || jev.activePiece === null) return null;
  const paused = pauseMatchSession(structuredClone(session));
  const board = paused.core.jev.board;
  const piece = paused.core.jev.activePiece!;
  const sequenceIndex = paused.core.roundIndex;
  const nextPiece = peekNextPiece(paused.core);
  const candidates = rankJevPlacements(board, piece, nextPiece);
  if (candidates.length === 0) return null;
  const request: JevDecisionRequest = {
    seed: paused.core.seed, sequenceIndex, board, piece, nextPiece,
    candidates: candidates.map(({ id, lockedPiece }) => ({ id, lockedPiece })),
  };
  return {
    session: freezeTree(paused),
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

export function completeJevDecision(state: JevDecisionSession, token: JevAttemptToken, value: unknown): JevDecisionSession {
  if (!isCurrentAttempt(state, token)) return state;
  const result = parseJevDecisionResult(state.snapshot.candidates, value);
  if (!result) return failJevDecision(state, token);
  const { board, topOut } = result.selectedCandidate;
  const session = settleMatchSession({
    ...state.session, phase: 'playing',
    core: {
      ...state.session.core,
      jev: { board, topOut, activePiece: null, lockedThisRound: true },
    },
  });
  return { ...state, session, result, status: 'complete' };
}
