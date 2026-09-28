import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PIECE_TYPES,
  isValidPosition,
  type ActivePiece,
  type Board,
  type PieceType,
  type Rotation,
} from '../game/engine';
import { getPieceAtSequenceIndex, MAX_SEQUENCE_INDEX } from '../game/match';
import { rankJevPlacements, type RankedLanding } from '../game/jev-placement';
import type { SubmittedLanding, JevDecisionResult, JevTokenUsage } from '../game/jev-decision-contract';
export type { SubmittedLanding, JevDecisionRequest, JevDecisionResult, JevTokenUsage } from '../game/jev-decision-contract';

export interface ValidatedJevDecision {
  seed: number;
  sequenceIndex: number;
  board: Board;
  piece: ActivePiece;
  nextPiece: PieceType;
  candidates: RankedLanding[];
}

export interface JevChoicePayload {
  model: 'jev-latest';
  state: {
    board: string[];
    legend: Record<string, string>;
    piece: ActivePiece;
    nextPiece: PieceType;
  };
  questions: {
    placement: {
      type: 'choice';
      instructions: string;
      criteria: Record<string, string>;
    };
  };
}

/** Rebuild and verify the exact deterministic shortlist before contacting Jev. */
export function validateJevDecisionRequest(value: unknown): ValidatedJevDecision | null {
  if (!isRecord(value) || !Number.isInteger(value.seed) || (value.seed as number) < 0 || (value.seed as number) > 0xffff_ffff ||
    !Number.isInteger(value.sequenceIndex) || (value.sequenceIndex as number) < 0 ||
    (value.sequenceIndex as number) >= MAX_SEQUENCE_INDEX || !isBoard(value.board) || !isActivePiece(value.piece) ||
    !PIECE_TYPES.includes(value.nextPiece as PieceType)) return null;

  const seed = value.seed as number;
  const sequenceIndex = value.sequenceIndex as number;
  const board = value.board;
  const piece = copyPiece(value.piece);
  const nextPiece = value.nextPiece as PieceType;
  if (!isValidPosition(board, piece) || piece.type !== getPieceAtSequenceIndex(seed, sequenceIndex) ||
    nextPiece !== getPieceAtSequenceIndex(seed, sequenceIndex + 1) || !Array.isArray(value.candidates)) return null;

  const candidates = rankJevPlacements(board, piece, nextPiece);
  const submitted = value.candidates as unknown[];
  if (candidates.length === 0 || submitted.length !== candidates.length ||
    submitted.some((entry, index) => !isSubmittedLanding(entry) ||
      entry.id !== candidates[index]!.id || !samePiecePose(entry.lockedPiece, candidates[index]!.lockedPiece))) return null;

  return { seed, sequenceIndex, board, piece, nextPiece, candidates };
}

/** Keeps TypeSafe's choice keys compact and all outcome facts server-derived. */
export function buildJevChoicePayload(validated: ValidatedJevDecision): JevChoicePayload {
  return {
    model: 'jev-latest',
    state: {
      board: validated.board.slice(2).map((row) => row.map((cell) => cell ?? '.').join('')),
      legend: { '.': 'empty', I: 'I piece', J: 'J piece', L: 'L piece', O: 'O piece', S: 'S piece', T: 'T piece', Z: 'Z piece' },
      piece: validated.piece,
      nextPiece: validated.nextPiece,
    },
    questions: {
      placement: {
        type: 'choice',
        instructions: 'Choose the best placement from this evaluated shortlist. Consider immediate and next-piece board outcomes. Select exactly one listed option.',
        criteria: Object.fromEntries(validated.candidates.map((candidate, index) => [
          `p${index}`, describeLanding(candidate),
        ])),
      },
    },
  };
}

function describeLanding(candidate: RankedLanding): string {
  const { lockedPiece, linesCleared, metrics, followUp } = candidate;
  return `${lockedPiece.type} piece at x=${lockedPiece.x}, y=${lockedPiece.y}, rotation ${lockedPiece.rotation * 90}°. ` +
    `Immediate lines cleared: ${linesCleared}; holes: ${metrics.holes}; aggregate height: ${metrics.aggregateHeight}; bumpiness: ${metrics.bumpiness}. ` +
    `Next-piece lines cleared: ${followUp.linesCleared}; top-out: ${followUp.topOut}; holes: ${followUp.metrics.holes}; ` +
    `aggregate height: ${followUp.metrics.aggregateHeight}; bumpiness: ${followUp.metrics.bumpiness}.`;
}

export function mapJevDecisionResponse(validated: ValidatedJevDecision, value: unknown): JevDecisionResult | null {
  if (!isRecord(value) || !isRecord(value.answers)) return null;
  const placement = value.answers.placement;
  if (!isRecord(placement) || placement.type !== 'choice' || typeof placement.choice !== 'string' ||
    !isRecord(placement.probabilities)) return null;

  const selectedIndex = parseOptionIndex(placement.choice, validated.candidates.length);
  if (selectedIndex === null) return null;
  const keys = Object.keys(placement.probabilities);
  if (keys.length !== validated.candidates.length || keys.some((key) => parseOptionIndex(key, validated.candidates.length) === null)) return null;

  const probabilities: Record<string, number> = {};
  for (let index = 0; index < validated.candidates.length; index += 1) {
    const key = `p${index}`;
    const probability = placement.probabilities[key];
    if (!Object.hasOwn(placement.probabilities, key) || typeof probability !== 'number' ||
      !Number.isFinite(probability) || probability < 0 || probability > 1) return null;
    probabilities[validated.candidates[index]!.id] = probability;
  }

  const selectedCandidate = validated.candidates[selectedIndex]!;
  const usage = readJevTokenUsage(value.usage);
  return { choice: selectedCandidate.id, selectedCandidate, probabilities, ...(usage ? { usage } : {}) };
}

function parseOptionIndex(value: string, count: number): number | null {
  const match = /^p(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index < count ? index : null;
}

function readJevTokenUsage(value: unknown): JevTokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const inputTokens = value.input_tokens;
  const outputTokens = value.output_tokens;
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number' || !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) || inputTokens < 0 || outputTokens < 0) return undefined;
  return { inputTokens, outputTokens };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoard(value: unknown): value is Board {
  return Array.isArray(value) && value.length === BOARD_HEIGHT && value.every((row) =>
    Array.isArray(row) && row.length === BOARD_WIDTH && row.every((cell) => cell === null || PIECE_TYPES.includes(cell as PieceType)));
}

function isActivePiece(value: unknown): value is ActivePiece {
  return isRecord(value) && PIECE_TYPES.includes(value.type as PieceType) && isRotation(value.rotation) &&
    Number.isInteger(value.x) && Number.isInteger(value.y);
}

function copyPiece(piece: ActivePiece): ActivePiece {
  return { type: piece.type, rotation: piece.rotation, x: piece.x, y: piece.y };
}

function isSubmittedLanding(value: unknown): value is SubmittedLanding {
  return isRecord(value) && typeof value.id === 'string' && isActivePiece(value.lockedPiece);
}

function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function samePiecePose(left: ActivePiece, right: ActivePiece): boolean {
  return left.type === right.type && left.rotation === right.rotation && left.x === right.x && left.y === right.y;
}
