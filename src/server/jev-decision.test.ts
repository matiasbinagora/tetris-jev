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
  mapJevDecisionResponse,
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

function createValidTypeSafeResponse(
  candidates: LandingCandidate[],
  choice = candidates[0]!.id,
): Record<string, unknown> {
  return {
    answers: {
      placement: {
        type: 'choice',
        choice,
        probabilities: Object.fromEntries(
          candidates.map((candidate, index) => [
            candidate.id,
            index === 0 ? 0.123456789 : 0.234567891,
          ]),
        ),
      },
    },
    usage: { input_tokens: 120, output_tokens: 12 },
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
    const candidates = [...request.candidates];
    candidates[candidates.length - 1] = { ...candidates[0] };

    expect(
      validateJevDecisionRequest({
        ...request,
        candidates,
      }),
    ).toBeNull();
  });

  it('strips unrecognized active-piece fields before returning the validated snapshot', () => {
    const { request } = createValidRequest();
    const piece = {
      ...request.piece,
      description: 'client-controlled prose',
      metrics: { holes: -999 },
    };

    const validated = validateJevDecisionRequest({ ...request, piece });

    expect(validated?.piece).toEqual(request.piece);
    expect(buildJevChoicePayload(validated!).state.piece).toEqual(request.piece);
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

describe('mapJevDecisionResponse', () => {
  it('maps the choice to the canonical candidate and preserves returned probabilities and usage', () => {
    const { request, candidates } = createValidRequest();
    const validated = validateJevDecisionRequest(request)!;
    const selected = candidates[3]!;
    const upstream = createValidTypeSafeResponse(candidates, selected.id);

    const mapped = mapJevDecisionResponse(validated, upstream);

    expect(mapped).toEqual({
      choice: selected.id,
      selectedCandidate: selected,
      probabilities: (
        upstream.answers as {
          placement: { probabilities: Record<string, number> };
        }
      ).placement.probabilities,
      usage: { inputTokens: 120, outputTokens: 12 },
    });
    expect(mapped?.probabilities[candidates[0]!.id]).toBe(0.123456789);
  });

  it('omits absent and malformed optional usage metadata', () => {
    const { request, candidates } = createValidRequest();
    const validated = validateJevDecisionRequest(request)!;
    const missingUsage = createValidTypeSafeResponse(candidates);
    delete missingUsage.usage;
    const malformedUsage = {
      ...createValidTypeSafeResponse(candidates),
      usage: { input_tokens: 1.5, output_tokens: -2 },
    };

    expect(mapJevDecisionResponse(validated, missingUsage)).not.toHaveProperty(
      'usage',
    );
    expect(mapJevDecisionResponse(validated, malformedUsage)).not.toHaveProperty(
      'usage',
    );
  });

  it.each([
    ['missing answers', () => ({})],
    [
      'non-choice answer',
      (response: Record<string, unknown>) => ({
        ...response,
        answers: { placement: { type: 'noul', noul: 0.9 } },
      }),
    ],
    [
      'unknown choice ID',
      (response: Record<string, unknown>) => ({
        ...response,
        answers: {
          placement: {
            ...(
              response.answers as {
                placement: Record<string, unknown>;
              }
            ).placement,
            choice: 'unknown-candidate',
          },
        },
      }),
    ],
    [
      'incomplete probabilities',
      (response: Record<string, unknown>) => {
        const answers = response.answers as {
          placement: Record<string, unknown>;
        };
        const probabilities = {
          ...(answers.placement.probabilities as Record<string, number>),
        };
        delete probabilities[Object.keys(probabilities)[0]!];
        return {
          ...response,
          answers: { placement: { ...answers.placement, probabilities } },
        };
      },
    ],
    [
      'additional probability key',
      (response: Record<string, unknown>) => {
        const answers = response.answers as {
          placement: Record<string, unknown>;
        };
        return {
          ...response,
          answers: {
            placement: {
              ...answers.placement,
              probabilities: {
                ...(answers.placement.probabilities as Record<string, number>),
                forged: 0.5,
              },
            },
          },
        };
      },
    ],
    [
      'non-numeric probability',
      (response: Record<string, unknown>) => {
        const answers = response.answers as {
          placement: Record<string, unknown>;
        };
        const probabilities = {
          ...(answers.placement.probabilities as Record<string, number>),
          [Object.keys(
            answers.placement.probabilities as Record<string, number>,
          )[0]!]: '0.5',
        };
        return {
          ...response,
          answers: { placement: { ...answers.placement, probabilities } },
        };
      },
    ],
    [
      'non-finite probability',
      (response: Record<string, unknown>) => {
        const answers = response.answers as {
          placement: Record<string, unknown>;
        };
        const probabilities = {
          ...(answers.placement.probabilities as Record<string, number>),
          [Object.keys(
            answers.placement.probabilities as Record<string, number>,
          )[0]!]: Number.NaN,
        };
        return {
          ...response,
          answers: { placement: { ...answers.placement, probabilities } },
        };
      },
    ],
    [
      'negative probability',
      (response: Record<string, unknown>) => {
        const answers = response.answers as {
          placement: Record<string, unknown>;
        };
        const probabilities = {
          ...(answers.placement.probabilities as Record<string, number>),
          [Object.keys(
            answers.placement.probabilities as Record<string, number>,
          )[0]!]: -0.01,
        };
        return {
          ...response,
          answers: { placement: { ...answers.placement, probabilities } },
        };
      },
    ],
    [
      'probability greater than one',
      (response: Record<string, unknown>) => {
        const answers = response.answers as {
          placement: Record<string, unknown>;
        };
        const probabilities = {
          ...(answers.placement.probabilities as Record<string, number>),
          [Object.keys(
            answers.placement.probabilities as Record<string, number>,
          )[0]!]: 1.01,
        };
        return {
          ...response,
          answers: { placement: { ...answers.placement, probabilities } },
        };
      },
    ],
  ])('rejects %s', (_caseName, mutate) => {
    const { request, candidates } = createValidRequest();
    const validated = validateJevDecisionRequest(request)!;
    const upstream = mutate(createValidTypeSafeResponse(candidates));

    expect(mapJevDecisionResponse(validated, upstream)).toBeNull();
  });
});
