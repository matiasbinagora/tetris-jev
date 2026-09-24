import { describe, expect, it } from 'vitest';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  HIDDEN_ROWS,
  PIECE_TYPES,
  SPAWN_X,
  SPAWN_Y,
  VISIBLE_BOARD_HEIGHT,
  createEmptyBoard,
  createSpawnPiece,
  getPieceCells,
  isValidPosition,
  tryMovePiece,
  tryRotatePiece,
  type ActivePiece,
  type Board,
  type Cell,
  type PieceType,
  type Rotation,
} from './engine';

const EXPECTED_ORIENTATIONS: Readonly<Record<PieceType, readonly string[][]>> = {
  I: [
    ['....', '####', '....', '....'],
    ['..#.', '..#.', '..#.', '..#.'],
    ['....', '....', '####', '....'],
    ['.#..', '.#..', '.#..', '.#..'],
  ],
  O: [
    ['....', '.##.', '.##.', '....'],
    ['....', '.##.', '.##.', '....'],
    ['....', '.##.', '.##.', '....'],
    ['....', '.##.', '.##.', '....'],
  ],
  T: [
    ['.#.', '###', '...'],
    ['.#.', '.##', '.#.'],
    ['...', '###', '.#.'],
    ['.#.', '##.', '.#.'],
  ],
  S: [
    ['.##', '##.', '...'],
    ['.#.', '.##', '..#'],
    ['...', '.##', '##.'],
    ['#..', '##.', '.#.'],
  ],
  Z: [
    ['##.', '.##', '...'],
    ['..#', '.##', '.#.'],
    ['...', '##.', '.##'],
    ['.#.', '##.', '#..'],
  ],
  J: [
    ['#..', '###', '...'],
    ['.##', '.#.', '.#.'],
    ['...', '###', '..#'],
    ['.#.', '.#.', '##.'],
  ],
  L: [
    ['..#', '###', '...'],
    ['.#.', '.#.', '.##'],
    ['...', '###', '#..'],
    ['##.', '.#.', '.#.'],
  ],
};

const ROTATIONS = [0, 1, 2, 3] as const satisfies readonly Rotation[];

function localCells(matrix: readonly string[]): string[] {
  return matrix.flatMap((row, y) =>
    [...row].flatMap((cell, x) => (cell === '#' ? [`${x},${y}`] : [])),
  );
}

function rotateMatrixClockwise(matrix: readonly string[]): string[] {
  const size = matrix.length;
  const rotated = Array.from({ length: size }, () => Array<string>(size).fill('.'));

  matrix.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      rotated[x][size - 1 - y] = cell;
    });
  });

  return rotated.map((row) => row.join(''));
}

function cellKeys(cells: readonly { x: number; y: number }[]): string[] {
  return cells.map(({ x, y }) => `${x},${y}`);
}

function mutableEmptyBoard(): Cell[][] {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );
}

function getBounds(piece: ActivePiece): {
  minX: number;
  maxX: number;
  maxY: number;
} {
  const cells = getPieceCells({ ...piece, x: 0, y: 0 });
  return {
    minX: Math.min(...cells.map(({ x }) => x)),
    maxX: Math.max(...cells.map(({ x }) => x)),
    maxY: Math.max(...cells.map(({ y }) => y)),
  };
}

describe('board dimensions and spawn', () => {
  it('stores two hidden rows above the 20 visible rows', () => {
    const board = createEmptyBoard();

    expect(BOARD_WIDTH).toBe(10);
    expect(VISIBLE_BOARD_HEIGHT).toBe(20);
    expect(HIDDEN_ROWS).toBe(2);
    expect(BOARD_HEIGHT).toBe(22);
    expect(board).toHaveLength(BOARD_HEIGHT);
    expect(board.every((row) => row.length === BOARD_WIDTH)).toBe(true);
    expect(board.flat().every((cell) => cell === null)).toBe(true);
  });

  it('uses the same centered spawn origin and spawn orientation for all pieces', () => {
    const board = createEmptyBoard();

    for (const type of PIECE_TYPES) {
      const piece = createSpawnPiece(type);

      expect(piece).toEqual({ type, rotation: 0, x: SPAWN_X, y: SPAWN_Y });
      expect(isValidPosition(board, piece)).toBe(true);
      expect(getPieceCells(piece)).toHaveLength(4);
    }
  });
});

describe('tetromino orientations', () => {
  for (const type of PIECE_TYPES) {
    it(`${type} orientations are geometrically consistent rotations`, () => {
      for (const rotation of ROTATIONS) {
        const nextRotation = (rotation + 1) % 4;

        expect(
          rotateMatrixClockwise(EXPECTED_ORIENTATIONS[type][rotation]),
        ).toEqual(EXPECTED_ORIENTATIONS[type][nextRotation]);
      }
    });

    for (const rotation of ROTATIONS) {
      it(`${type} orientation ${rotation} has its documented four cells`, () => {
        const piece: ActivePiece = { type, rotation, x: 0, y: 0 };

        expect(cellKeys(getPieceCells(piece))).toEqual(
          localCells(EXPECTED_ORIENTATIONS[type][rotation]),
        );
      });
    }
  }
});

describe('movement and collision', () => {
  it('rejects wall and floor moves for every piece orientation', () => {
    const board = createEmptyBoard();

    for (const type of PIECE_TYPES) {
      for (const rotation of ROTATIONS) {
        const originPiece: ActivePiece = { type, rotation, x: 0, y: 0 };
        const { minX, maxX, maxY } = getBounds(originPiece);
        const leftWallPiece = {
          ...originPiece,
          x: -minX,
          y: 5,
        };
        const rightWallPiece = {
          ...originPiece,
          x: BOARD_WIDTH - 1 - maxX,
          y: 5,
        };
        const floorPiece = {
          ...originPiece,
          x: SPAWN_X,
          y: BOARD_HEIGHT - 1 - maxY,
        };

        expect(isValidPosition(board, leftWallPiece)).toBe(true);
        expect(tryMovePiece(board, leftWallPiece, -1, 0)).toBe(leftWallPiece);
        expect(isValidPosition(board, rightWallPiece)).toBe(true);
        expect(tryMovePiece(board, rightWallPiece, 1, 0)).toBe(rightWallPiece);
        expect(isValidPosition(board, floorPiece)).toBe(true);
        expect(tryMovePiece(board, floorPiece, 0, 1)).toBe(floorPiece);
      }
    }
  });

  it('allows a move when every destination cell is clear', () => {
    const board = createEmptyBoard();
    const piece = createSpawnPiece('T');

    expect(tryMovePiece(board, piece, 1, 0)).toEqual({ ...piece, x: 4 });
  });

  it('does not move into a settled cell or mutate the board', () => {
    const rows = mutableEmptyBoard();
    rows[1][6] = 'I';
    const board: Board = rows;
    const piece = createSpawnPiece('T');

    expect(tryMovePiece(board, piece, 1, 0)).toBe(piece);
    expect(board[1][6]).toBe('I');
  });

  it('rejects boards that do not include all hidden and visible rows', () => {
    const shortBoard = createEmptyBoard().slice(HIDDEN_ROWS);

    expect(isValidPosition(shortBoard, createSpawnPiece('I'))).toBe(false);
  });
});

describe('SRS rotation', () => {
  it('uses the first available JLSTZ wall kick in its documented order', () => {
    const rows = mutableEmptyBoard();
    rows[7][1] = 'I';
    const board: Board = rows;
    const piece: ActivePiece = { type: 'T', rotation: 0, x: 0, y: 5 };

    expect(isValidPosition(board, piece)).toBe(true);
    expect(tryRotatePiece(board, piece, 'clockwise')).toEqual({
      type: 'T',
      rotation: 1,
      x: -1,
      y: 5,
    });
  });

  it('uses the I-piece kick table to rotate away from the left wall', () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: 'I', rotation: 1, x: -2, y: 4 };

    expect(isValidPosition(board, piece)).toBe(true);
    expect(tryRotatePiece(board, piece, 'clockwise')).toEqual({
      type: 'I',
      rotation: 2,
      x: 0,
      y: 4,
    });
  });

  it('uses a later upward kick to rotate beside the floor', () => {
    const rows = mutableEmptyBoard();
    rows[20][4] = 'J';
    rows[19][6] = 'J';
    rows[21][6] = 'J';
    const board: Board = rows;
    const piece: ActivePiece = { type: 'T', rotation: 1, x: 4, y: 19 };

    expect(isValidPosition(board, piece)).toBe(true);
    expect(tryRotatePiece(board, piece, 'counterclockwise')).toEqual({
      type: 'T',
      rotation: 0,
      x: 4,
      y: 17,
    });
  });

  it('leaves a piece unchanged when every rotation kick is blocked', () => {
    const rows = mutableEmptyBoard();
    rows.forEach((row, y) => {
      row.forEach((_, x) => {
        rows[y][x] = 'I';
      });
    });

    const piece: ActivePiece = { type: 'T', rotation: 0, x: 4, y: 6 };
    for (const { x, y } of getPieceCells(piece)) {
      rows[y][x] = null;
    }

    const board: Board = rows;
    expect(isValidPosition(board, piece)).toBe(true);
    expect(tryRotatePiece(board, piece, 'clockwise')).toBe(piece);
  });

  it('rotates O in place without changing its four occupied cells', () => {
    const board = createEmptyBoard();
    const piece = createSpawnPiece('O');
    const rotated = tryRotatePiece(board, piece, 'clockwise');

    expect(rotated.rotation).toBe(1);
    expect(cellKeys(getPieceCells(rotated))).toEqual(cellKeys(getPieceCells(piece)));
  });

  it('cycles clockwise and counterclockwise without moving on an empty board', () => {
    const board = createEmptyBoard();

    for (const type of PIECE_TYPES) {
      const initial = createSpawnPiece(type);
      const clockwise = tryRotatePiece(board, initial, 'clockwise');
      const counterclockwise = tryRotatePiece(board, initial, 'counterclockwise');

      expect(clockwise.rotation).toBe(1);
      expect(clockwise.x).toBe(initial.x);
      expect(clockwise.y).toBe(initial.y);
      expect(counterclockwise.rotation).toBe(3);
      expect(counterclockwise.x).toBe(initial.x);
      expect(counterclockwise.y).toBe(initial.y);
    }
  });
});
