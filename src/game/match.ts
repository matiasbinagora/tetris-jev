import {
  applyGravityTick,
  createEmptyBoard,
  PIECE_TYPES,
  trySpawnPiece,
  type ActivePiece,
  type Board,
  type PieceType,
} from './engine';

export const MATCH_GRAVITY_INTERVAL_MS = 700 as const;
export const JEV_DECISION_CADENCE_MS = 350 as const;
export const MAX_SEQUENCE_INDEX = 10_000 as const;

const ZERO_SEED_FALLBACK = 0x9e3779b9;
const UINT32_RANGE = 0x1_0000_0000;

export interface MatchPlayerState {
  board: Board;
  activePiece: ActivePiece | null;
  /** Index in the shared seeded sequence for this player's current piece. */
  sequenceIndex: number;
  /** Number of pieces this player has locked without topping out. */
  survivedPieces: number;
  lockedThisRound: boolean;
  topOut: boolean;
}

export interface MatchCoreState {
  seed: number;
  /** Retained as serializable seven-bag generator state for existing snapshots. */
  randomState: number;
  bag: readonly PieceType[];
  bagIndex: number;
  /** Highest player sequence index reached; presentation uses per-player cursors. */
  roundIndex: number;
  /** Initial piece alias retained for compatibility with older snapshots. */
  currentPiece: PieceType;
  human: MatchPlayerState;
  jev: MatchPlayerState;
}

interface RandomDraw { value: number; state: number }

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) throw new RangeError('Match seed must be a finite integer.');
  return (seed >>> 0) || ZERO_SEED_FALLBACK;
}

function nextRandom(state: number): RandomDraw {
  let nextState = state >>> 0;
  nextState ^= nextState << 13;
  nextState ^= nextState >>> 17;
  nextState ^= nextState << 5;
  nextState >>>= 0;
  return { value: nextState, state: nextState };
}

function randomBelow(state: number, bound: number): RandomDraw {
  const limit = Math.floor(UINT32_RANGE / bound) * bound;
  let nextState = state;
  while (true) {
    const draw = nextRandom(nextState);
    nextState = draw.state;
    if (draw.value < limit) return { value: draw.value % bound, state: nextState };
  }
}

function shuffleBag(seed: number): { bag: PieceType[]; randomState: number } {
  const bag = [...PIECE_TYPES];
  let randomState = seed;
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const draw = randomBelow(randomState, index + 1);
    randomState = draw.state;
    [bag[index], bag[draw.value]] = [bag[draw.value]!, bag[index]!];
  }
  return { bag, randomState };
}

function createPlayer(board: Board, type: PieceType, sequenceIndex = 0, survivedPieces = 0): MatchPlayerState {
  const spawn = trySpawnPiece(board, type);
  return spawn.kind === 'top-out'
    ? { board, activePiece: null, sequenceIndex, survivedPieces, lockedThisRound: false, topOut: true }
    : { board, activePiece: spawn.piece, sequenceIndex, survivedPieces, lockedThisRound: false, topOut: false };
}

export function createMatchCore(seed: number): MatchCoreState {
  const normalizedSeed = normalizeSeed(seed);
  const { bag, randomState } = shuffleBag(normalizedSeed);
  const currentPiece = bag[0]!;
  return {
    seed: normalizedSeed, randomState, bag, bagIndex: 1, roundIndex: 0, currentPiece,
    human: createPlayer(createEmptyBoard(), currentPiece),
    jev: createPlayer(createEmptyBoard(), currentPiece),
  };
}

/** Return the deterministic seven-bag item at a zero-based sequence index. */
export function getPieceAtSequenceIndex(seed: number, index: number): PieceType {
  if (!Number.isInteger(index) || index < 0 || index > MAX_SEQUENCE_INDEX) {
    throw new RangeError(`Sequence index must be an integer from 0 to ${MAX_SEQUENCE_INDEX}.`);
  }
  let randomState = normalizeSeed(seed);
  let bag: PieceType[] = [];
  const targetBag = Math.floor(index / PIECE_TYPES.length);
  for (let bagIndex = 0; bagIndex <= targetBag; bagIndex += 1) {
    const shuffled = shuffleBag(randomState);
    bag = shuffled.bag;
    randomState = shuffled.randomState;
  }
  return bag[index % PIECE_TYPES.length]!;
}

export function getPlayerPiece(core: MatchCoreState, player: MatchPlayerState): PieceType {
  return getPieceAtSequenceIndex(core.seed, player.sequenceIndex);
}

export function peekNextPlayerPiece(core: MatchCoreState, player: MatchPlayerState): PieceType {
  return getPieceAtSequenceIndex(core.seed, Math.min(player.sequenceIndex + 1, MAX_SEQUENCE_INDEX));
}

/** Legacy preview of the next item after the initial shared piece. */
export function peekNextPiece(state: MatchCoreState): PieceType {
  return getPieceAtSequenceIndex(state.seed, 1);
}

export function lockMatchPlayer(
  core: MatchCoreState,
  playerName: 'human' | 'jev',
  board: Board,
  topOut: boolean,
): MatchCoreState {
  const player = core[playerName];
  const nextIndex = Math.min(player.sequenceIndex + 1, MAX_SEQUENCE_INDEX);
  const spawn = topOut ? null : trySpawnPiece(board, getPieceAtSequenceIndex(core.seed, nextIndex));
  const nextPlayer: MatchPlayerState = topOut || spawn?.kind === 'top-out'
    ? { ...player, board, activePiece: null, sequenceIndex: nextIndex, survivedPieces: player.survivedPieces, lockedThisRound: true, topOut: true }
    : { board, activePiece: spawn!.piece, sequenceIndex: nextIndex, survivedPieces: player.survivedPieces + 1, lockedThisRound: false, topOut: false };
  return {
    ...core,
    roundIndex: Math.max(core.roundIndex, nextIndex),
    [playerName]: nextPlayer,
  };
}

function tickPlayer(core: MatchCoreState, name: 'human' | 'jev'): MatchCoreState {
  const player = core[name];
  if (player.activePiece === null || player.topOut) return core;
  const result = applyGravityTick(player.board, player.activePiece);
  if (result.kind === 'moved') {
    return { ...core, [name]: { ...player, activePiece: result.piece } };
  }
  return lockMatchPlayer(core, name, result.result.board, result.result.topOut);
}

/** One human gravity step; Jev moves only when its decision request resolves. */
export function applyHumanGravityTick(core: MatchCoreState): MatchCoreState {
  return tickPlayer(core, 'human');
}

/** Compatibility helper: applies gravity only to the human-controlled board. */
export function applySharedGravityTick(core: MatchCoreState): MatchCoreState {
  return applyHumanGravityTick(core);
}
