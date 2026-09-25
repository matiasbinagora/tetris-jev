import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PIECE_TYPES,
  enumerateLegalLandingCandidates,
  isValidPosition,
  type ActivePiece,
  type Board,
  type LandingCandidate,
  type PieceType,
  type Rotation,
} from '../game/engine';

export interface SubmittedLanding {
  id: string;
  lockedPiece: ActivePiece;
}

export interface JevDecisionRequest {
  board: Board;
  piece: ActivePiece;
  candidates: SubmittedLanding[];
}

export interface ValidatedJevDecision {
  board: Board;
  piece: ActivePiece;
  candidates: LandingCandidate[];
}

export interface JevChoicePayload {
  model: 'jev-latest';
  state: { board: Board; piece: ActivePiece };
  questions: {
    placement: {
      type: 'choice';
      instructions: string;
      criteria: Record<string, string>;
    };
  };
}

const MAX_CANDIDATES = 255;

/** Validates untrusted route input and replaces submitted candidates with canonical engine results. */
export function validateJevDecisionRequest(
  value: unknown,
): ValidatedJevDecision | null {
  if (!isRecord(value) || !isBoard(value.board) || !isActivePiece(value.piece)) {
    return null;
  }

  const board = value.board;
  const piece = value.piece;
  if (!isValidPosition(board, piece) || !Array.isArray(value.candidates)) {
    return null;
  }

  const submitted = value.candidates as unknown[];
  if (
    submitted.length === 0 ||
    submitted.length > MAX_CANDIDATES ||
    submitted.some((candidate) => !isSubmittedLanding(candidate))
  ) {
    return null;
  }

  const candidates = enumerateLegalLandingCandidates(board, piece);
  if (
    candidates.length === 0 ||
    candidates.length > MAX_CANDIDATES ||
    submitted.length !== candidates.length
  ) {
    return null;
  }

  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const submittedIds = new Set<string>();

  for (const candidate of submitted as SubmittedLanding[]) {
    if (submittedIds.has(candidate.id)) {
      return null;
    }
    submittedIds.add(candidate.id);

    const canonical = candidatesById.get(candidate.id);
    if (!canonical || !samePiecePose(candidate.lockedPiece, canonical.lockedPiece)) {
      return null;
    }
  }

  if (submittedIds.size !== candidatesById.size) {
    return null;
  }

  return { board, piece, candidates };
}

/** Builds TypeSafe's choice criteria from canonical engine candidates only. */
export function buildJevChoicePayload(
  validated: ValidatedJevDecision,
): JevChoicePayload {
  return {
    model: 'jev-latest',
    state: { board: validated.board, piece: validated.piece },
    questions: {
      placement: {
        type: 'choice',
        instructions:
          'Choose the legal landing placement that best continues the game. Select exactly one listed candidate ID.',
        criteria: Object.fromEntries(
          validated.candidates.map(({ id, lockedPiece }) => [
            id,
            `${lockedPiece.type} piece at origin x=${lockedPiece.x}, y=${lockedPiece.y} with rotation ${lockedPiece.rotation}`,
          ]),
        ),
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoard(value: unknown): value is Board {
  return (
    Array.isArray(value) &&
    value.length === BOARD_HEIGHT &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === BOARD_WIDTH &&
        row.every(
          (cell) => cell === null || PIECE_TYPES.includes(cell as PieceType),
        ),
    )
  );
}

function isActivePiece(value: unknown): value is ActivePiece {
  return (
    isRecord(value) &&
    PIECE_TYPES.includes(value.type as PieceType) &&
    isRotation(value.rotation) &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y)
  );
}

function isSubmittedLanding(value: unknown): value is SubmittedLanding {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isActivePiece(value.lockedPiece)
  );
}

function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function samePiecePose(left: ActivePiece, right: ActivePiece): boolean {
  return (
    left.type === right.type &&
    left.rotation === right.rotation &&
    left.x === right.x &&
    left.y === right.y
  );
}
