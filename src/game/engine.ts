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

export interface BoardMetrics {
  columnHeights: readonly number[];
  aggregateHeight: number;
  holes: number;
  bumpiness: number;
}

export interface ClearLinesResult {
  board: Board;
  linesCleared: number;
}

export interface LockedBoardResult extends ClearLinesResult {
  lockedPiece: ActivePiece;
  topOut: boolean;
  metrics: BoardMetrics;
}

export interface HardDropResult extends LockedBoardResult {
  dropDistance: number;
}

export interface LandingCandidate extends LockedBoardResult {
  id: string;
}

export type SpawnResult =
  | { kind: 'spawned'; piece: ActivePiece }
  | { kind: 'top-out'; piece: null };

export type GravityResult =
  | { kind: 'moved'; piece: ActivePiece }
  | { kind: 'locked'; result: LockedBoardResult };

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

export function trySpawnPiece(board: Board, type: PieceType): SpawnResult {
  assertBoardDimensions(board);
  if (!isPieceType(type)) {
    throw new RangeError(`Unknown tetromino type: ${String(type)}`);
  }

  const piece = createSpawnPiece(type);
  return isValidPosition(board, piece)
    ? { kind: 'spawned', piece }
    : { kind: 'top-out', piece: null };
}

export function softDropPiece(board: Board, piece: ActivePiece): ActivePiece {
  return tryMovePiece(board, piece, 0, 1);
}

export function applyGravityTick(board: Board, piece: ActivePiece): GravityResult {
  const movedPiece = tryMovePiece(board, piece, 0, 1);
  if (movedPiece !== piece) {
    return { kind: 'moved', piece: movedPiece };
  }

  return { kind: 'locked', result: lockPiece(board, piece) };
}

export function hardDropPiece(board: Board, piece: ActivePiece): HardDropResult {
  let landingPiece = piece;
  let dropDistance = 0;

  while (true) {
    const nextPiece = tryMovePiece(board, landingPiece, 0, 1);
    if (nextPiece === landingPiece) {
      break;
    }

    landingPiece = nextPiece;
    dropDistance += 1;
  }

  return { ...lockPiece(board, landingPiece), dropDistance };
}

export function lockPiece(board: Board, piece: ActivePiece): LockedBoardResult {
  assertBoardDimensions(board);
  if (!isValidPosition(board, piece)) {
    throw new RangeError('Cannot lock a piece at an invalid position.');
  }

  const pieceCells = getPieceCells(piece);
  const topOut = pieceCells.some(({ y }) => y < HIDDEN_ROWS);
  const lockedRows: Cell[][] = board.map((row) => [...row]);

  for (const { x, y } of pieceCells) {
    lockedRows[y][x] = piece.type;
  }

  const cleared = clearCompletedLines(lockedRows);
  return {
    ...cleared,
    lockedPiece: { ...piece },
    topOut,
    metrics: calculateBoardMetrics(cleared.board),
  };
}

export function clearCompletedLines(board: Board): ClearLinesResult {
  assertBoardDimensions(board);

  const remainingRows = board.filter((row) => !row.every((cell) => cell !== null));
  const linesCleared = BOARD_HEIGHT - remainingRows.length;
  const emptyRows = Array.from({ length: linesCleared }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );

  return {
    board: [...emptyRows, ...remainingRows.map((row) => [...row])],
    linesCleared,
  };
}

export function calculateBoardMetrics(board: Board): BoardMetrics {
  assertBoardDimensions(board);

  const columnHeights = Array.from({ length: BOARD_WIDTH }, (_, x) => {
    for (let y = HIDDEN_ROWS; y < BOARD_HEIGHT; y += 1) {
      if (board[y][x] !== null) {
        return BOARD_HEIGHT - y;
      }
    }

    return 0;
  });

  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    if (columnHeights[x] === 0) {
      continue;
    }

    const firstOccupiedY = BOARD_HEIGHT - columnHeights[x];
    for (let y = firstOccupiedY + 1; y < BOARD_HEIGHT; y += 1) {
      if (board[y][x] === null) {
        holes += 1;
      }
    }
  }

  const aggregateHeight = columnHeights.reduce((sum, height) => sum + height, 0);
  const bumpiness = columnHeights
    .slice(1)
    .reduce((sum, height, index) => sum + Math.abs(height - columnHeights[index]), 0);

  return { columnHeights, aggregateHeight, holes, bumpiness };
}

export function enumerateLegalLandingCandidates(
  board: Board,
  piece: ActivePiece,
): LandingCandidate[] {
  assertBoardDimensions(board);
  if (!isValidPosition(board, piece)) {
    return [];
  }

  const states = [{ ...piece }];
  const visited = new Set([getActivePoseKey(piece)]);
  const candidates = new Map<string, LandingCandidate>();

  for (let index = 0; index < states.length; index += 1) {
    const current = states[index];
    const down = tryMovePiece(board, current, 0, 1);

    if (down === current) {
      const footprint = getPlacementFootprint(current);
      if (!candidates.has(footprint)) {
        candidates.set(footprint, {
          ...lockPiece(board, current),
          id: `${current.type}:${footprint}`,
        });
      }
    }

    const nextStates = [
      tryMovePiece(board, current, -1, 0),
      tryMovePiece(board, current, 1, 0),
      down,
      tryRotatePiece(board, current, 'clockwise'),
      tryRotatePiece(board, current, 'counterclockwise'),
    ];

    for (const next of nextStates) {
      if (next === current) {
        continue;
      }

      const key = getActivePoseKey(next);
      if (!visited.has(key)) {
        visited.add(key);
        states.push(next);
      }
    }
  }

  return [...candidates.values()];
}

function getActivePoseKey(piece: ActivePiece): string {
  return `${piece.rotation}:${piece.x}:${piece.y}`;
}

function getPlacementFootprint(piece: ActivePiece): string {
  return getPieceCells(piece)
    .map(({ x, y }) => `${x},${y}`)
    .join(';');
}

function assertBoardDimensions(board: Board): void {
  if (!hasBoardDimensions(board)) {
    throw new RangeError(
      `Board must contain ${BOARD_HEIGHT} rows of ${BOARD_WIDTH} cells.`,
    );
  }
}
