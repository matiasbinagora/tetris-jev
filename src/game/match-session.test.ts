import { describe, expect, it } from 'vitest';
import { BOARD_WIDTH, HIDDEN_ROWS, createEmptyBoard } from './engine';
import {
  createMatchCore,
  type MatchCoreState,
  type MatchPlayerState,
} from './match';
import {
  createMatchSession,
  pauseMatchSession,
  restartMatchSession,
  resumeMatchSession,
  startMatchSession,
  tickMatchSession,
  type MatchPlayer,
  type MatchSessionState,
} from './match-session';

function withBothLocked(core: MatchCoreState): MatchCoreState {
  return {
    ...core,
    human: { ...core.human, activePiece: null, lockedThisRound: true },
    jev: { ...core.jev, activePiece: null, lockedThisRound: true },
  };
}

function playing(core: MatchCoreState): MatchSessionState {
  return { core, phase: 'playing', result: null };
}

function withGravityBlock(
  core: MatchCoreState,
  blockedPlayer: MatchPlayer,
): MatchCoreState {
  const board = createEmptyBoard().map((row) => [...row]);
  board[2][3] = 'I';
  board[2][4] = 'I';
  board[2][5] = 'I';
  const activePiece = { type: 'T' as const, rotation: 0 as const, x: 3, y: 0 };
  const human: MatchPlayerState = {
    ...core.human,
    activePiece: { ...activePiece },
    ...(blockedPlayer === 'human' ? { board } : {}),
  };
  const jev: MatchPlayerState = {
    ...core.jev,
    activePiece: { ...activePiece },
    ...(blockedPlayer === 'jev' ? { board } : {}),
  };
  return { ...core, currentPiece: 'T', human, jev };
}

function withSpawnBlocked(
  core: MatchCoreState,
  blockedPlayer: MatchPlayer,
): MatchCoreState {
  const board = createEmptyBoard().map((row) => [...row]);
  for (let y = 0; y < HIDDEN_ROWS; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) board[y][x] = 'I';
  }
  const playerState: MatchPlayerState = { ...core[blockedPlayer], board };
  return blockedPlayer === 'human'
    ? { ...core, human: playerState }
    : { ...core, jev: playerState };
}

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
    expect(startMatchSession(finished)).toBe(finished);
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

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid restart seed %s',
    (seed) => {
      expect(() => restartMatchSession(seed)).toThrow(RangeError);
    },
  );
});

describe('tickMatchSession progression', () => {
  it('does nothing outside the playing phase', () => {
    const ready = createMatchSession(123);
    const paused: MatchSessionState = { ...ready, phase: 'paused' };
    const finished: MatchSessionState = {
      ...ready,
      phase: 'finished',
      result: { kind: 'win', winner: 'human' },
    };
    expect(tickMatchSession(ready)).toBe(ready);
    expect(tickMatchSession(paused)).toBe(paused);
    expect(tickMatchSession(finished)).toBe(finished);
  });

  it('advances once when both players have locked', () => {
    const core = withBothLocked(createMatchCore(123));
    const humanBoard = core.human.board;
    const jevBoard = core.jev.board;
    const humanBoardSnapshot = humanBoard.map((row) => [...row]);
    const jevBoardSnapshot = jevBoard.map((row) => [...row]);
    const ticked = tickMatchSession(playing(core));
    expect(ticked.phase).toBe('playing');
    expect(ticked.core.roundIndex).toBe(core.roundIndex + 1);
    expect(ticked.core.human.activePiece?.type).toBe(ticked.core.currentPiece);
    expect(ticked.core.jev.activePiece?.type).toBe(ticked.core.currentPiece);
    expect(ticked.core.human.lockedThisRound).toBe(false);
    expect(ticked.core.jev.lockedThisRound).toBe(false);
    expect(ticked.core.human.board).toBe(humanBoard);
    expect(ticked.core.jev.board).toBe(jevBoard);
    expect(humanBoard).toEqual(humanBoardSnapshot);
    expect(jevBoard).toEqual(jevBoardSnapshot);
  });

  it('clears a line on one board while retaining the other board cells', () => {
    const base = createMatchCore(123);
    const humanBoard = createEmptyBoard().map((row) => [...row]);
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (x < 3 || x > 6) humanBoard[21][x] = 'T';
    }
    const jevBoard = createEmptyBoard();
    const core: MatchCoreState = {
      ...base,
      currentPiece: 'I',
      human: {
        ...base.human,
        board: humanBoard,
        activePiece: { type: 'I', rotation: 0, x: 3, y: 20 },
      },
      jev: {
        ...base.jev,
        board: jevBoard,
        activePiece: { type: 'I', rotation: 0, x: 3, y: 20 },
      },
    };
    const sourceHumanBoard = humanBoard.map((row) => [...row]);
    const sourceJevBoard = jevBoard.map((row) => [...row]);
    const cleared = tickMatchSession(playing(core));
    expect(cleared.core.roundIndex).toBe(core.roundIndex + 1);
    expect(cleared.core.human.board[21].every((cell) => cell === null)).toBe(true);
    expect(cleared.core.jev.board[21].slice(3, 7)).toEqual(['I', 'I', 'I', 'I']);
    expect(humanBoard).toEqual(sourceHumanBoard);
    expect(jevBoard).toEqual(sourceJevBoard);
  });
});

describe('tickMatchSession gravity top-outs', () => {
  it.each([
    { blockedPlayer: 'human' as const, winner: 'jev' as const },
    { blockedPlayer: 'jev' as const, winner: 'human' as const },
  ])(
    'awards the surviving player when $blockedPlayer tops out',
    ({ blockedPlayer, winner }) => {
      const core = withGravityBlock(createMatchCore(123), blockedPlayer);
      const finished = tickMatchSession(playing(core));
      expect(finished.phase).toBe('finished');
      expect(finished.result).toEqual({ kind: 'win', winner });
      expect(finished.core[blockedPlayer].topOut).toBe(true);
      expect(finished.core.roundIndex).toBe(core.roundIndex);
      expect(tickMatchSession(finished)).toBe(finished);
    },
  );

  it('draws when both players top out during the same gravity tick', () => {
    const core = withGravityBlock(
      withGravityBlock(createMatchCore(123), 'human'),
      'jev',
    );
    const finished = tickMatchSession(playing(core));
    expect(finished.phase).toBe('finished');
    expect(finished.result).toEqual({ kind: 'draw' });
    expect(finished.core.human.topOut).toBe(true);
    expect(finished.core.jev.topOut).toBe(true);
    expect(finished.core.roundIndex).toBe(core.roundIndex);
    expect(tickMatchSession(finished)).toBe(finished);
  });
});

describe('tickMatchSession spawn top-outs', () => {
  it('awards the other player when one next-round spawn is blocked', () => {
    const core = withSpawnBlocked(
      withBothLocked(createMatchCore(123)),
      'human',
    );
    const finished = tickMatchSession(playing(core));
    expect(finished.phase).toBe('finished');
    expect(finished.core.roundIndex).toBe(core.roundIndex + 1);
    expect(finished.core.human.topOut).toBe(true);
    expect(finished.core.human.activePiece).toBeNull();
    expect(finished.core.jev.topOut).toBe(false);
    expect(finished.core.jev.activePiece?.type).toBe(finished.core.currentPiece);
    expect(finished.result).toEqual({ kind: 'win', winner: 'jev' });
    expect(tickMatchSession(finished)).toBe(finished);
  });

  it('draws when both next-round spawns are blocked', () => {
    const core = withSpawnBlocked(
      withSpawnBlocked(withBothLocked(createMatchCore(123)), 'human'),
      'jev',
    );
    const finished = tickMatchSession(playing(core));
    expect(finished.phase).toBe('finished');
    expect(finished.core.roundIndex).toBe(core.roundIndex + 1);
    expect(finished.core.human.topOut).toBe(true);
    expect(finished.core.jev.topOut).toBe(true);
    expect(finished.result).toEqual({ kind: 'draw' });
    expect(tickMatchSession(finished)).toBe(finished);
  });
});
