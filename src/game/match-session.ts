import {
  advanceMatchRound,
  applySharedGravityTick,
  createMatchCore,
  type MatchCoreState,
} from './match';

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

function resultForTopOut(core: MatchCoreState): MatchResult | null {
  if (core.human.topOut && core.jev.topOut) return { kind: 'draw' };
  if (core.human.topOut) return { kind: 'win', winner: 'jev' };
  if (core.jev.topOut) return { kind: 'win', winner: 'human' };
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

export function tickMatchSession(state: MatchSessionState): MatchSessionState {
  if (state.phase !== 'playing') return state;

  const tickedCore = applySharedGravityTick(state.core);
  const result = resultForTopOut(tickedCore);
  if (result !== null) {
    return { ...state, core: tickedCore, phase: 'finished', result };
  }

  const bothLocked =
    tickedCore.human.lockedThisRound && tickedCore.jev.lockedThisRound;
  const nextCore = bothLocked ? advanceMatchRound(tickedCore) : tickedCore;
  const spawnResult = resultForTopOut(nextCore);
  if (spawnResult !== null) {
    return { ...state, core: nextCore, phase: 'finished', result: spawnResult };
  }

  return { ...state, core: nextCore, phase: 'playing', result: null };
}
