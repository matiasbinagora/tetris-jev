export const BOARD_WIDTH = 10;
export const VISIBLE_BOARD_HEIGHT = 20;
export const HIDDEN_ROWS = 2;
export const BOARD_HEIGHT = VISIBLE_BOARD_HEIGHT + HIDDEN_ROWS;
export const SPAWN_X = 3;
export const SPAWN_Y = 0;

export const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;

export type PieceType = (typeof PIECE_TYPES)[number];
export type Rotation = 0 | 1 | 2 | 3;
export type RotationDirection = 'clockwise' | 'counterclockwise';
export type Cell = PieceType | null;
export type Board = ReadonlyArray<ReadonlyArray<Cell>>;

export interface Position {
  x: number;
  y: number;
}

export interface ActivePiece extends Position {
  type: PieceType;
  rotation: Rotation;
}

type Orientation = readonly string[];
type PieceOrientations = readonly [
  Orientation,
  Orientation,
  Orientation,
  Orientation,
];
type KickOffset = readonly [x: number, y: number];

const ORIENTATIONS: Readonly<Record<PieceType, PieceOrientations>> = {
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

// SRS state numbers: 0 (spawn), 1 (right), 2 (reverse), and 3 (left).
// Offsets are ordered test positions in board coordinates, where positive y points down.
const JLSTZ_KICKS: Readonly<Record<string, readonly KickOffset[]>> = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS: Readonly<Record<string, readonly KickOffset[]>> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

const O_KICKS: readonly KickOffset[] = [[0, 0]];

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );
}

export function createSpawnPiece(type: PieceType): ActivePiece {
  return {
    type,
    rotation: 0,
    x: SPAWN_X,
    y: SPAWN_Y,
  };
}

export function getPieceCells(piece: ActivePiece): Position[] {
  if (!isPieceType(piece.type) || !isRotation(piece.rotation)) {
    return [];
  }

  const orientation = ORIENTATIONS[piece.type][piece.rotation];
  const cells: Position[] = [];

  orientation.forEach((row, y) => {
    [...row].forEach((value, x) => {
      if (value === '#') {
        cells.push({ x: piece.x + x, y: piece.y + y });
      }
    });
  });

  return cells;
}

export function isValidPosition(board: Board, piece: ActivePiece): boolean {
  if (
    !hasBoardDimensions(board) ||
    !isPieceType(piece.type) ||
    !isRotation(piece.rotation) ||
    !Number.isInteger(piece.x) ||
    !Number.isInteger(piece.y)
  ) {
    return false;
  }

  const cells = getPieceCells(piece);
  if (cells.length !== 4) {
    return false;
  }

  return cells.every(
    ({ x, y }) =>
      x >= 0 &&
      x < BOARD_WIDTH &&
      y >= 0 &&
      y < BOARD_HEIGHT &&
      board[y][x] === null,
  );
}

export function tryMovePiece(
  board: Board,
  piece: ActivePiece,
  dx: number,
  dy: number,
): ActivePiece {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
    return piece;
  }

  const movedPiece = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return isValidPosition(board, movedPiece) ? movedPiece : piece;
}

export function tryRotatePiece(
  board: Board,
  piece: ActivePiece,
  direction: RotationDirection,
): ActivePiece {
  if (
    !isPieceType(piece.type) ||
    !isRotation(piece.rotation) ||
    (direction !== 'clockwise' && direction !== 'counterclockwise')
  ) {
    return piece;
  }

  const delta = direction === 'clockwise' ? 1 : -1;
  const nextRotation = (((piece.rotation + delta + 4) % 4) as Rotation);
  const transition = `${piece.rotation}>${nextRotation}`;
  const kickTests = getKickTests(piece.type, transition);

  for (const [dx, dy] of kickTests) {
    const rotatedPiece: ActivePiece = {
      ...piece,
      rotation: nextRotation,
      x: piece.x + dx,
      y: piece.y + dy,
    };

    if (isValidPosition(board, rotatedPiece)) {
      return rotatedPiece;
    }
  }

  return piece;
}

function getKickTests(
  type: PieceType,
  transition: string,
): readonly KickOffset[] {
  if (type === 'O') {
    return O_KICKS;
  }

  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[transition] ?? O_KICKS;
}

function hasBoardDimensions(board: Board): boolean {
  return (
    board.length === BOARD_HEIGHT &&
    board.every((row) => row.length === BOARD_WIDTH)
  );
}

function isPieceType(value: unknown): value is PieceType {
  return PIECE_TYPES.includes(value as PieceType);
}

function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
