import { describe, expect, it } from 'vitest';
import {
  BOARD_HEIGHT,
  createEmptyBoard,
  enumerateLegalLandingCandidates,
  type ActivePiece,
  type Board,
  type Cell,
} from './engine';
import { rankJevPlacements } from './jev-placement';

function lineClearBoard(): Cell[][] {
  const board = createEmptyBoard().map((row) => [...row]);
  board[BOARD_HEIGHT - 1].fill('T');
  for (let x = 3; x < 7; x += 1) board[BOARD_HEIGHT - 1][x] = null;
  return board;
}

function outerTowersBoard(): Cell[][] {
  const board = createEmptyBoard().map((row) => [...row]);
  for (let y = 2; y < BOARD_HEIGHT; y += 1) {
    for (const x of [0, 1, 2, 7, 8, 9]) board[y][x] = 'J';
  }
  return board;
}

const spawnT = (): ActivePiece => ({ type: 'T', rotation: 0, x: 3, y: 0 });

describe('rankJevPlacements', () => {
  it('retains a legal placement that clears a line', () => {
    const board = lineClearBoard();
    const piece: ActivePiece = { type: 'I', rotation: 0, x: 3, y: 0 };
    const before: Board = board.map((row) => [...row]);

    const ranked = rankJevPlacements(board, piece, 'O');

    expect(ranked.some((candidate) => candidate.linesCleared === 1)).toBe(true);
    expect(board).toEqual(before);
  });

  it('excludes current top-out placements whenever a surviving option exists', () => {
    const board = outerTowersBoard();
    const exhaustive = enumerateLegalLandingCandidates(board, spawnT());
    expect(exhaustive.some((candidate) => candidate.topOut)).toBe(true);
    expect(exhaustive.some((candidate) => !candidate.topOut)).toBe(true);

    const ranked = rankJevPlacements(board, spawnT(), 'I');

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((candidate) => !candidate.topOut)).toBe(true);
  });

  it('returns a bounded shortlist even when every legal landing tops out', () => {
    const board = createEmptyBoard().map((row) => [...row]);
    board[2].fill('Z');
    const exhaustive = enumerateLegalLandingCandidates(board, spawnT());
    expect(exhaustive.length).toBeGreaterThan(0);
    expect(exhaustive.every((candidate) => candidate.topOut)).toBe(true);

    const ranked = rankJevPlacements(board, spawnT(), 'I');

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.length).toBeLessThanOrEqual(12);
    expect(ranked.every((candidate) => candidate.topOut)).toBe(true);
  });

  it('returns the same top 12 in deterministic score and ID order', () => {
    const board = createEmptyBoard();
    const piece = spawnT();

    const first = rankJevPlacements(board, piece, 'I');
    const second = rankJevPlacements(board, piece, 'I');

    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    expect(first.map(({ score }) => score)).toEqual(
      [...first.map(({ score }) => score)].sort((a, b) => b - a),
    );
  });

  it('includes finite lookahead outcomes for the known next piece', () => {
    const ranked = rankJevPlacements(createEmptyBoard(), spawnT(), 'S');

    expect(ranked.every(({ followUp }) =>
      followUp !== null &&
      Number.isFinite(followUp.metrics.aggregateHeight) &&
      Number.isInteger(followUp.linesCleared),
    )).toBe(true);
  });

  it('changes lookahead outcomes when the known next piece changes', () => {
    const board = createEmptyBoard();
    const withI = rankJevPlacements(board, spawnT(), 'I');
    const withO = rankJevPlacements(board, spawnT(), 'O');

    expect(withI.map(({ id, followUp }) => [id, followUp.metrics.aggregateHeight]))
      .not.toEqual(withO.map(({ id, followUp }) => [id, followUp.metrics.aggregateHeight]));
  });
});
