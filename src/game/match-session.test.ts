import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from './engine';
import { getPieceAtSequenceIndex } from './match';
import {
  createMatchSession, lockMatchSessionPlayer, pauseMatchSession, restartMatchSession,
  resumeMatchSession, startMatchSession, tickMatchSession,
} from './match-session';

const playing = (seed = 123) => startMatchSession(createMatchSession(seed));

describe('independent match lifecycle', () => {
  it('starts with matching sequence pieces and independent player cursors', () => {
    const session = createMatchSession(123);
    expect(session.phase).toBe('ready');
    expect(session.core.human.activePiece?.type).toBe(session.core.jev.activePiece?.type);
    expect(session.core.human.sequenceIndex).toBe(0);
    expect(session.core.jev.sequenceIndex).toBe(0);
    expect(JSON.parse(JSON.stringify(session))).toEqual(session);
  });

  it('pauses/resumes and restarts without changing deterministic state unexpectedly', () => {
    const original = playing();
    const paused = pauseMatchSession(original);
    const resumed = resumeMatchSession(paused);
    expect(paused.phase).toBe('paused');
    expect(resumed.core).toBe(original.core);
    const restarted = restartMatchSession(456);
    expect(restarted.core.seed).toBe(456);
    expect(restarted.core.human.survivedPieces).toBe(0);
    expect(restarted.core.jev.survivedPieces).toBe(0);
  });

  it('ticks human gravity only while Jev is deciding', () => {
    const before = playing();
    const ticked = tickMatchSession(before);
    expect(ticked.core.human.activePiece?.y).toBe(before.core.human.activePiece!.y + 1);
    expect(ticked.core.jev).toBe(before.core.jev);
  });

  it('advances only the player who locks, while both draw from the same sequence', () => {
    const before = playing();
    const after = lockMatchSessionPlayer(before, 'jev', createEmptyBoard(), false);
    expect(after.core.jev.sequenceIndex).toBe(1);
    expect(after.core.jev.activePiece?.type).toBe(getPieceAtSequenceIndex(123, 1));
    expect(after.core.jev.survivedPieces).toBe(1);
    expect(after.core.human.sequenceIndex).toBe(0);
    expect(after.core.human.activePiece).toEqual(before.core.human.activePiece);
  });

  it('ends once the surviving player exceeds the topped-out player’s survived-piece count', () => {
    let session = playing();
    session = lockMatchSessionPlayer(session, 'human', session.core.human.board, true);
    expect(session.phase).toBe('playing');
    session = lockMatchSessionPlayer(session, 'jev', createEmptyBoard(), false);
    expect(session.phase).toBe('finished');
    expect(session.result).toEqual({ kind: 'win', winner: 'jev' });
  });

  it('draws when both boards top out with equal survived-piece counts', () => {
    let session = playing();
    session = lockMatchSessionPlayer(session, 'human', session.core.human.board, true);
    session = lockMatchSessionPlayer(session, 'jev', session.core.jev.board, true);
    expect(session.phase).toBe('finished');
    expect(session.result).toEqual({ kind: 'draw' });
  });

  it('awards a player with a greater survived-piece count when both top out', () => {
    let session = playing();
    session = lockMatchSessionPlayer(session, 'jev', createEmptyBoard(), false);
    session = lockMatchSessionPlayer(session, 'human', session.core.human.board, true);
    session = lockMatchSessionPlayer(session, 'jev', session.core.jev.board, true);
    expect(session.result).toEqual({ kind: 'win', winner: 'jev' });
  });

  it('ignores actions after the match finishes', () => {
    let session = playing();
    session = lockMatchSessionPlayer(session, 'human', session.core.human.board, true);
    session = lockMatchSessionPlayer(session, 'jev', session.core.jev.board, true);
    expect(tickMatchSession(session)).toBe(session);
  });
});
