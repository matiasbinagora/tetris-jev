import { applyHumanGravityTick, createMatchCore, lockMatchPlayer, type MatchCoreState } from './match';
import type { Board } from './engine';

export type MatchPhase = 'ready' | 'playing' | 'paused' | 'finished';
export type MatchPlayer = 'human' | 'jev';
export type MatchResult = { kind: 'win'; winner: MatchPlayer } | { kind: 'draw' };

export interface MatchSessionState {
  core: MatchCoreState;
  phase: MatchPhase;
  result: MatchResult | null;
}

function resultForTopOut(core: MatchCoreState): MatchResult | null {
  const { human, jev } = core;
  if (human.topOut && jev.topOut) {
    if (human.survivedPieces === jev.survivedPieces) return { kind: 'draw' };
    return { kind: 'win', winner: human.survivedPieces > jev.survivedPieces ? 'human' : 'jev' };
  }
  if (human.topOut && jev.survivedPieces > human.survivedPieces) return { kind: 'win', winner: 'jev' };
  if (jev.topOut && human.survivedPieces > jev.survivedPieces) return { kind: 'win', winner: 'human' };
  return null;
}

export function createMatchSession(seed: number): MatchSessionState {
  return { core: createMatchCore(seed), phase: 'ready', result: null };
}

export function startMatchSession(state: MatchSessionState): MatchSessionState {
  return state.phase === 'ready' ? { ...state, phase: 'playing' } : state;
}

export function pauseMatchSession(state: MatchSessionState): MatchSessionState {
  return state.phase === 'playing' ? { ...state, phase: 'paused' } : state;
}

export function resumeMatchSession(state: MatchSessionState): MatchSessionState {
  return state.phase === 'paused' ? { ...state, phase: 'playing' } : state;
}

export function restartMatchSession(freshSeed: number): MatchSessionState {
  return { core: createMatchCore(freshSeed), phase: 'playing', result: null };
}

export function resolveMatchSession(state: MatchSessionState): MatchSessionState {
  if (state.phase !== 'playing') return state;
  const result = resultForTopOut(state.core);
  return result === null ? state : { ...state, phase: 'finished', result };
}

export function lockMatchSessionPlayer(
  state: MatchSessionState,
  player: MatchPlayer,
  board: Board,
  topOut: boolean,
): MatchSessionState {
  if (state.phase !== 'playing' || state.core[player].topOut) return state;
  return resolveMatchSession({ ...state, core: lockMatchPlayer(state.core, player, board, topOut) });
}

export function tickMatchSession(state: MatchSessionState): MatchSessionState {
  if (state.phase !== 'playing') return state;
  return resolveMatchSession({ ...state, core: applyHumanGravityTick(state.core) });
}

/** Kept as the shared lifecycle entry point; only the human has a gravity clock. */
export function settleMatchSession(state: MatchSessionState): MatchSessionState {
  return resolveMatchSession(state);
}
