import { describe, expect, it } from 'vitest';
import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  createEmptyBoard,
  PIECE_TYPES,
  type ActivePiece,
} from './engine';
import {
  advanceMatchRound,
  applySharedGravityTick,
  createMatchCore,
  type MatchCoreState,
} from './match';

function withBothPlayersLocked(state: MatchCoreState): MatchCoreState {
  return {
    ...state,
    human: { ...state.human, activePiece: null, lockedThisRound: true },
    jev: { ...state.jev, activePiece: null, lockedThisRound: true },
  };
}

describe('createMatchCore', () => {
  it('creates the same serializable opening and shared piece for the same seed', () => {
    const first = createMatchCore(123456);
    const second = createMatchCore(123456);

    expect(first).toEqual(second);
    expect(first.seed).toBe(123456);
    expect(first.bag).toHaveLength(7);
    expect([...first.bag].sort()).toEqual([...PIECE_TYPES].sort());
    expect(first.currentPiece).toBe(first.human.activePiece?.type);
    expect(first.currentPiece).toBe(first.jev.activePiece?.type);
    expect(first.human.board).not.toBe(first.jev.board);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('normalizes zero to a repeatable nonzero generator seed', () => {
    expect(createMatchCore(0)).toEqual(createMatchCore(0));
    expect(createMatchCore(0).seed).toBe(0x9e3779b9);
    expect(createMatchCore(0).randomState).not.toBe(0);
  });

  it('normalizes negative integers to unsigned 32-bit seeds', () => {
    expect(createMatchCore(-1).seed).toBe(0xffffffff);
  });

  it('rejects seeds that are not finite integers', () => {
    expect(() => createMatchCore(Number.NaN)).toThrow(RangeError);
    expect(() => createMatchCore(1.5)).toThrow(RangeError);
  });
});

describe('applySharedGravityTick', () => {
  it('moves both active pieces down one cell without changing the source state', () => {
    const initial = createMatchCore(123456);
    const ticked = applySharedGravityTick(initial);

    expect(ticked.human.activePiece?.y).toBe(initial.human.activePiece!.y + 1);
    expect(ticked.jev.activePiece?.y).toBe(initial.jev.activePiece!.y + 1);
    expect(initial.human.activePiece?.y).toBe(0);
    expect(initial.jev.activePiece?.y).toBe(0);
    expect(ticked).not.toBe(initial);
    expect(ticked.human.board).toBe(initial.human.board);
    expect(ticked.jev.board).toBe(initial.jev.board);
  });

  it('locks a board at the floor while the other active piece keeps moving', () => {
    const match = createMatchCore(123456);
    const floorPiece: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 20 };
    const initial = {
      ...match,
      human: { ...match.human, activePiece: floorPiece },
    };

    const ticked = applySharedGravityTick(initial);

    expect(ticked.human.activePiece).toBeNull();
    expect(ticked.human.lockedThisRound).toBe(true);
    expect(ticked.human.board).not.toBe(initial.human.board);
    expect(ticked.jev.activePiece?.y).toBe(initial.jev.activePiece!.y + 1);
    expect(initial.human.activePiece).toEqual(floorPiece);
  });

  it('keeps an already locked player unchanged on later shared ticks', () => {
    const match = createMatchCore(123456);
    const locked = applySharedGravityTick({
      ...match,
      human: {
        ...match.human,
        activePiece: { type: 'T', rotation: 0, x: 3, y: 20 },
      },
    });
    const nextTick = applySharedGravityTick(locked);

    expect(nextTick.human).toBe(locked.human);
    expect(nextTick.jev.activePiece?.y).toBe(locked.jev.activePiece!.y + 1);
  });

  it('propagates top-out for a hidden-row lock without affecting the other board', () => {
    const match = createMatchCore(123456);
    const board = createEmptyBoard().map((row) => [...row]);
    board[2][3] = 'I';
    board[2][4] = 'I';
    board[2][5] = 'I';
    const spawnPiece: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
    const initial = {
      ...match,
      human: {
        ...match.human,
        board,
        activePiece: spawnPiece,
      },
    };

    const ticked = applySharedGravityTick(initial);

    expect(ticked.human.lockedThisRound).toBe(true);
    expect(ticked.human.topOut).toBe(true);
    expect(ticked.human.board).not.toBe(initial.human.board);
    expect(ticked.jev.topOut).toBe(false);
    expect(ticked.jev.board).toBe(initial.jev.board);
    expect(ticked.jev.activePiece?.y).toBe(initial.jev.activePiece!.y + 1);
  });
});

describe('advanceMatchRound', () => {
  it('keeps the exact state until both players lock without topping out', () => {
    const locked = withBothPlayersLocked(createMatchCore(123456));
    const activePiece: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
    const humanStillPlaying = {
      ...locked,
      human: { ...locked.human, activePiece, lockedThisRound: false },
    };
    const humanTopOut = {
      ...locked,
      human: { ...locked.human, topOut: true },
    };

    expect(advanceMatchRound(humanStillPlaying)).toBe(humanStillPlaying);
    expect(advanceMatchRound(humanTopOut)).toBe(humanTopOut);
  });

  it('spawns the next shared piece only after both players lock', () => {
    const initial = withBothPlayersLocked(createMatchCore(123456));
    const advanced = advanceMatchRound(initial);

    expect(advanced).not.toBe(initial);
    expect(advanced.roundIndex).toBe(initial.roundIndex + 1);
    expect(advanced.currentPiece).toBe(initial.bag[initial.bagIndex]);
    expect(advanced.human.activePiece?.type).toBe(advanced.currentPiece);
    expect(advanced.jev.activePiece?.type).toBe(advanced.currentPiece);
    expect(advanced.human.lockedThisRound).toBe(false);
    expect(advanced.jev.lockedThisRound).toBe(false);
    expect(advanced.human.board).toBe(initial.human.board);
    expect(advanced.jev.board).toBe(initial.jev.board);
    expect(advanced.human.board).not.toBe(advanced.jev.board);
  });

  it('draws two consecutive complete seven-bags without gaps or duplicates', () => {
    let state = createMatchCore(987654321);
    const sequence = [state.currentPiece];

    for (let round = 1; round < 14; round += 1) {
      state = advanceMatchRound(withBothPlayersLocked(state));
      sequence.push(state.currentPiece);
    }

    expect([...sequence.slice(0, 7)].sort()).toEqual([...PIECE_TYPES].sort());
    expect([...sequence.slice(7, 14)].sort()).toEqual([...PIECE_TYPES].sort());
    expect(state.roundIndex).toBe(13);
  });

  it('preserves future draws when a bag-boundary state is restored from JSON', () => {
    let original = createMatchCore(987654321);
    for (let round = 0; round < 6; round += 1) {
      original = advanceMatchRound(withBothPlayersLocked(original));
    }
    const restored = JSON.parse(JSON.stringify(original)) as MatchCoreState;

    const originalNext = advanceMatchRound(withBothPlayersLocked(original));
    const restoredNext = advanceMatchRound(withBothPlayersLocked(restored));

    expect(restoredNext.currentPiece).toBe(originalNext.currentPiece);
    expect(restoredNext.randomState).toBe(originalNext.randomState);
    expect(restoredNext.bag).toEqual(originalNext.bag);
    expect(restoredNext.bagIndex).toBe(originalNext.bagIndex);
    expect(restoredNext).toEqual(originalNext);
  });

  it('keeps one player on top-out when only that board blocks the next spawn', () => {
    const match = createMatchCore(123456);
    const humanBoard = createEmptyBoard().map((row) => [...row]);
    for (let y = 0; y < HIDDEN_ROWS; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        humanBoard[y][x] = 'I';
      }
    }
    const locked = withBothPlayersLocked({
      ...match,
      human: { ...match.human, board: humanBoard },
    });

    const advanced = advanceMatchRound(locked);

    expect(advanced.human.topOut).toBe(true);
    expect(advanced.human.activePiece).toBeNull();
    expect(advanced.jev.topOut).toBe(false);
    expect(advanced.jev.activePiece?.type).toBe(advanced.currentPiece);
    expect(advanced.human.board).toBe(humanBoard);
    expect(advanced.jev.board).toBe(locked.jev.board);
  });
});
