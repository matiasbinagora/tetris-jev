import { describe, expect, it } from 'vitest';
import { PIECE_TYPES } from './engine';
import { createMatchCore } from './match';

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
