import { describe, expect, it } from 'vitest';
import {
  createEmptyBoard,
  enumerateLegalLandingCandidates,
  type ActivePiece,
  type Cell,
  type LandingCandidate,
} from '../game/engine';
import {
  buildJevChoicePayload,
  validateJevDecisionRequest,
  type JevDecisionRequest,
} from './jev-decision';

function createValidRequest(): {
  request: JevDecisionRequest;
  candidates: LandingCandidate[];
} {
  const board = createEmptyBoard();
  const piece: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
  const candidates = enumerateLegalLandingCandidates(board, piece);

  return {
    request: {
      board,
      piece,
      candidates: candidates.map(({ id, lockedPiece }) => ({ id, lockedPiece })),
    },
    candidates,
  };
}

describe('validateJevDecisionRequest', () => {
  it('accepts the complete server-generated legal candidate set', () => {
    const { request, candidates } = createValidRequest();

    const validated = validateJevDecisionRequest(request);

    expect(validated).not.toBeNull();
    expect(validated?.candidates).toEqual(candidates);
  });

  it('rejects a board with an incorrect row count', () => {
    const { request } = createValidRequest();

    expect(
      validateJevDecisionRequest({ ...request, board: request.board.slice(1) }),
    ).toBeNull();
  });

  it('rejects a board with an incorrect row width', () => {
    const { request } = createValidRequest();
    const board = request.board.map((row, index) =>
      index === 0 ? row.slice(1) : row,
    );

    expect(validateJevDecisionRequest({ ...request, board })).toBeNull();
  });

  it('rejects a board cell that is not empty or a tetromino', () => {
    const { request } = createValidRequest();
    const board = request.board.map((row) => [...row]);
    board[21][0] = 'Q' as unknown as Cell;

    expect(validateJevDecisionRequest({ ...request, board })).toBeNull();
  });

  it('rejects an unknown active piece type', () => {
    const { request } = createValidRequest();

    expect(
      validateJevDecisionRequest({
        ...request,
        piece: { ...request.piece, type: 'Q' },
      }),
    ).toBeNull();
  });

  it('rejects an invalid rotation', () => {
    const { request } = createValidRequest();

    expect(
      validateJevDecisionRequest({
        ...request,
        piece: { ...request.piece, rotation: 4 },
      }),
    ).toBeNull();
  });

  it('rejects non-integer piece coordinates', () => {
    const { request } = createValidRequest();

    expect(
      validateJevDecisionRequest({
        ...request,
        piece: { ...request.piece, x: 3.5 },
      }),
    ).toBeNull();
  });

  it('rejects a piece that overlaps a settled board cell', () => {
    const { request } = createValidRequest();
    const board = request.board.map((row) => [...row]);
    board[0][4] = 'I';

    expect(validateJevDecisionRequest({ ...request, board })).toBeNull();
  });

  it('rejects an empty candidate list', () => {
    const { request } = createValidRequest();

    expect(
      validateJevDecisionRequest({ ...request, candidates: [] }),
    ).toBeNull();
  });

  it('rejects duplicate candidate IDs', () => {
    const { request } = createValidRequest();
    const first = request.candidates[0];

    expect(
      validateJevDecisionRequest({
        ...request,
        candidates: [...request.candidates, first],
      }),
    ).toBeNull();
  });

  it('rejects a candidate list that omits a legal landing', () => {
    const { request } = createValidRequest();

    expect(
      validateJevDecisionRequest({
        ...request,
        candidates: request.candidates.slice(1),
      }),
    ).toBeNull();
  });

  it('rejects an unknown candidate ID', () => {
    const { request } = createValidRequest();
    const candidates = request.candidates.map((candidate, index) =>
      index === 0 ? { ...candidate, id: 'forged-candidate' } : candidate,
    );

    expect(validateJevDecisionRequest({ ...request, candidates })).toBeNull();
  });

  it('rejects a candidate whose landing pose was modified', () => {
    const { request } = createValidRequest();
    const candidates = request.candidates.map((candidate, index) =>
      index === 0
        ? {
            ...candidate,
            lockedPiece: { ...candidate.lockedPiece, x: candidate.lockedPiece.x + 1 },
          }
        : candidate,
    );

    expect(validateJevDecisionRequest({ ...request, candidates })).toBeNull();
  });

  it('rejects more than 255 submitted candidates', () => {
    const { request } = createValidRequest();
    const overLimit = Array.from({ length: 256 }, (_, index) => ({
      ...request.candidates[index % request.candidates.length],
      id: `candidate-${index}`,
    }));

    expect(
      validateJevDecisionRequest({ ...request, candidates: overLimit }),
    ).toBeNull();
  });
});

describe('buildJevChoicePayload', () => {
  it('builds a typed choice from validated placements without client prose', () => {
    const { request, candidates } = createValidRequest();
    const validated = validateJevDecisionRequest(request);
    const landing = candidates.find(
      ({ lockedPiece }) =>
        lockedPiece.type === 'T' &&
        lockedPiece.rotation === 0 &&
        lockedPiece.x === 3 &&
        lockedPiece.y === 20,
    );

    expect(validated).not.toBeNull();
    expect(landing).toBeDefined();
    const payload = buildJevChoicePayload(validated!);

    expect(payload.model).toBe('jev-latest');
    expect(payload.state).toEqual({ board: request.board, piece: request.piece });
    expect(payload.questions.placement.type).toBe('choice');
    expect(Object.keys(payload.questions.placement.criteria)).toEqual(
      candidates.map(({ id }) => id),
    );
    expect(payload.questions.placement.criteria[landing!.id]).toBe(
      'T piece at origin x=3, y=20 with rotation 0',
    );
    expect(
      Object.values(payload.questions.placement.criteria).some((value) =>
        value.includes('client'),
      ),
    ).toBe(false);
  });
});
