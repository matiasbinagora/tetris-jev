import { createMatchCore, type MatchCoreState } from './match';

export type MatchPhase = 'ready' | 'playing' | 'paused' | 'finished';
export type MatchPlayer = 'human' | 'jev';
export type MatchResult =
  | { kind: 'win'; winner: MatchPlayer }
  | { kind: 'draw' };

export interface MatchSessionState {
  core: MatchCoreState;
  phase: MatchPhase;
  result: MatchResult | null;
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
