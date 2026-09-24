import { describe, expect, it } from 'vitest';
import { createEmptyBoard, PIECE_TYPES, type ActivePiece } from './engine';
import { applySharedGravityTick, createMatchCore } from './match';

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
