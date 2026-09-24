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

const ZERO_SEED_FALLBACK = 0x9e3779b9;
const UINT32_RANGE = 0x1_0000_0000;

export interface MatchPlayerState {
  board: Board;
  activePiece: ActivePiece | null;
  lockedThisRound: boolean;
  topOut: boolean;
}

export interface MatchCoreState {
  seed: number;
  randomState: number;
  bag: readonly PieceType[];
  bagIndex: number;
  roundIndex: number;
  currentPiece: PieceType;
  human: MatchPlayerState;
  jev: MatchPlayerState;
}

interface RandomDraw {
  value: number;
  state: number;
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new RangeError('Match seed must be a finite integer.');
  }

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
    if (draw.value < limit) {
      return { value: draw.value % bound, state: nextState };
    }
  }
}

function shuffleBag(seed: number): { bag: PieceType[]; randomState: number } {
  const bag = [...PIECE_TYPES];
  let randomState = seed;

  for (let index = bag.length - 1; index > 0; index -= 1) {
    const draw = randomBelow(randomState, index + 1);
    randomState = draw.state;
    [bag[index], bag[draw.value]] = [bag[draw.value], bag[index]];
  }

  return { bag, randomState };
}

function createPlayer(board: Board, type: PieceType): MatchPlayerState {
  const spawn = trySpawnPiece(board, type);
  if (spawn.kind === 'top-out') {
    return {
      board,
      activePiece: null,
      lockedThisRound: false,
      topOut: true,
    };
  }

  return {
    board,
    activePiece: spawn.piece,
    lockedThisRound: false,
    topOut: false,
  };
}

export function createMatchCore(seed: number): MatchCoreState {
  const normalizedSeed = normalizeSeed(seed);
  const { bag, randomState } = shuffleBag(normalizedSeed);
  const currentPiece = bag[0];

  return {
    seed: normalizedSeed,
    randomState,
    bag,
    bagIndex: 1,
    roundIndex: 0,
    currentPiece,
    human: createPlayer(createEmptyBoard(), currentPiece),
    jev: createPlayer(createEmptyBoard(), currentPiece),
  };
}

function tickMovingPlayer(player: MatchPlayerState): MatchPlayerState {
  if (player.activePiece === null || player.lockedThisRound) {
    return player;
  }

  const result = applyGravityTick(player.board, player.activePiece);
  if (result.kind === 'moved') {
    return { ...player, activePiece: result.piece };
  }

  return {
    ...player,
    board: result.result.board,
    activePiece: null,
    lockedThisRound: true,
    topOut: result.result.topOut,
  };
}

export function applySharedGravityTick(state: MatchCoreState): MatchCoreState {
  return {
    ...state,
    human: tickMovingPlayer(state.human),
    jev: tickMovingPlayer(state.jev),
  };
}

export function advanceMatchRound(state: MatchCoreState): MatchCoreState {
  if (
    !state.human.lockedThisRound ||
    !state.jev.lockedThisRound ||
    state.human.topOut ||
    state.jev.topOut
  ) {
    return state;
  }

  let bag = state.bag;
  let bagIndex: number;
  let randomState = state.randomState;
  let currentPiece: PieceType;

  if (state.bagIndex >= state.bag.length) {
    const nextBag = shuffleBag(randomState);
    bag = nextBag.bag;
    randomState = nextBag.randomState;
    currentPiece = bag[0];
    bagIndex = 1;
  } else {
    const nextPiece = state.bag[state.bagIndex];
    if (nextPiece === undefined) {
      return state;
    }

    currentPiece = nextPiece;
    bagIndex = state.bagIndex + 1;
  }

  return {
    ...state,
    randomState,
    bag,
    bagIndex,
    roundIndex: state.roundIndex + 1,
    currentPiece,
    human: createPlayer(state.human.board, currentPiece),
    jev: createPlayer(state.jev.board, currentPiece),
  };
}
