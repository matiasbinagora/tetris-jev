import { describe, expect, it } from 'vitest';
import { BOARD_WIDTH, HIDDEN_ROWS, createEmptyBoard, PIECE_TYPES } from './engine';
import { applyHumanGravityTick, createMatchCore, getPieceAtSequenceIndex, lockMatchPlayer } from './match';

describe('deterministic shared sequence', () => {
  it('draws the same initial piece for both boards', () => {
    const core = createMatchCore(123);
    expect(core.human.activePiece?.type).toBe(core.jev.activePiece?.type);
    expect(core.human.sequenceIndex).toBe(0);
    expect(core.jev.sequenceIndex).toBe(0);
  });

  it('contains each piece once in every seven-bag and is repeatable', () => {
    const first = Array.from({ length: 14 }, (_, index) => getPieceAtSequenceIndex(123, index));
    const second = Array.from({ length: 14 }, (_, index) => getPieceAtSequenceIndex(123, index));
    expect(first).toEqual(second);
    expect([...first.slice(0, 7)].sort()).toEqual([...PIECE_TYPES].sort());
    expect([...first.slice(7, 14)].sort()).toEqual([...PIECE_TYPES].sort());
  });

  it('uses the shared seed when players advance at different speeds', () => {
    let core = createMatchCore(123);
    const untouchedHuman = core.human;
    core = lockMatchPlayer(core, 'jev', createEmptyBoard(), false);
    expect(core.jev.activePiece?.type).toBe(getPieceAtSequenceIndex(123, 1));
    expect(core.human).toBe(untouchedHuman);
    core = lockMatchPlayer(core, 'human', createEmptyBoard(), false);
    expect(core.human.activePiece?.type).toBe(core.jev.activePiece?.type);
  });

  it('advances only human gravity and preserves Jev state', () => {
    const before = createMatchCore(123);
    const after = applyHumanGravityTick(before);
    expect(after.human.activePiece?.y).toBe(before.human.activePiece!.y + 1);
    expect(after.jev).toBe(before.jev);
  });

  it('does not count a piece when its next spawn is blocked', () => {
    const core = createMatchCore(123);
    const blockedSpawn = createEmptyBoard().map((row) => [...row]);
    for (let y = 0; y < HIDDEN_ROWS; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) blockedSpawn[y]![x] = 'T';
    }
    const next = lockMatchPlayer(core, 'human', blockedSpawn, false);
    expect(next.human.topOut).toBe(true);
    expect(next.human.survivedPieces).toBe(0);
  });

  it('rejects invalid sequence indexes', () => {
    for (const index of [-1, 1.5, 10_001]) {
      expect(() => getPieceAtSequenceIndex(123, index)).toThrow(RangeError);
    }
  });
});
