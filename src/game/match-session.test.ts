import { describe, expect, it } from 'vitest';
import { createMatchCore } from './match';
import {
  createMatchSession,
  pauseMatchSession,
  restartMatchSession,
  resumeMatchSession,
  startMatchSession,
  type MatchSessionState,
} from './match-session';

describe('match session controls', () => {
  it('creates a ready session with a seeded core and no result', () => {
    const session = createMatchSession(123);
    expect(session.phase).toBe('ready');
    expect(session.result).toBeNull();
    expect(session.core).toEqual(createMatchCore(123));
    expect(JSON.parse(JSON.stringify(session))).toEqual(session);
  });

  it('starts without replacing the core', () => {
    const ready = createMatchSession(123);
    const playing = startMatchSession(ready);
    expect(playing.phase).toBe('playing');
    expect(playing.core).toBe(ready.core);
  });

  it('pauses and resumes without changing the core or serialized state', () => {
    const playing = startMatchSession(createMatchSession(123));
    const paused = pauseMatchSession(playing);
    const resumed = resumeMatchSession(paused);
    expect(paused.phase).toBe('paused');
    expect(resumed.phase).toBe('playing');
    expect(resumed.core).toBe(playing.core);
    expect(JSON.parse(JSON.stringify(resumed.core))).toEqual(playing.core);
  });

  it('returns the same session for controls invalid in the current phase', () => {
    const ready = createMatchSession(123);
    const playing = startMatchSession(ready);
    const paused = pauseMatchSession(playing);
    const finished: MatchSessionState = {
      ...playing,
      phase: 'finished',
      result: { kind: 'win', winner: 'human' },
    };

    expect(pauseMatchSession(ready)).toBe(ready);
    expect(pauseMatchSession(paused)).toBe(paused);
    expect(pauseMatchSession(finished)).toBe(finished);
    expect(resumeMatchSession(ready)).toBe(ready);
    expect(resumeMatchSession(playing)).toBe(playing);
    expect(startMatchSession(playing)).toBe(playing);
    expect(startMatchSession(paused)).toBe(paused);
    expect(resumeMatchSession(finished)).toBe(finished);
  });

  it('restarts immediately with a clean core made from the supplied seed', () => {
    const restarted = restartMatchSession(456);
    expect(restarted.phase).toBe('playing');
    expect(restarted.result).toBeNull();
    expect(restarted.core).toEqual(createMatchCore(456));
    expect(restarted.core.roundIndex).toBe(0);
    expect(restarted.core.human.board).not.toBe(restarted.core.jev.board);
    expect(restarted.core.human.activePiece?.type).toBe(restarted.core.currentPiece);
    expect(restarted.core.jev.activePiece?.type).toBe(restarted.core.currentPiece);
  });

  it('rejects an invalid restart seed', () => {
    expect(() => restartMatchSession(1.5)).toThrow(RangeError);
  });
});
