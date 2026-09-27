import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyBoard,
  enumerateLegalLandingCandidates,
  type ActivePiece,
  type Board,
} from '../../../../src/game/engine';
import { POST } from './route';

const API_KEY_SENTINEL = 'typesafe-route-secret-sentinel';
const previousApiKey = process.env.JEV_API_KEY;
const upstreamFetch = vi.fn<typeof fetch>();

function createValidRequestBody(): {
  board: Board;
  piece: ActivePiece;
  candidates: { id: string; lockedPiece: ActivePiece }[];
} {
  const board = createEmptyBoard();
  const piece: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
  const candidates = enumerateLegalLandingCandidates(board, piece);

  return {
    board,
    piece,
    candidates: candidates.map(({ id, lockedPiece }) => ({ id, lockedPiece })),
  };
}

function createJsonRequest(value: unknown): Request {
  return new Request('http://localhost/api/jev/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

function choiceResponse(choice: string): Response {
  const requestBody = createValidRequestBody();
  return new Response(
    JSON.stringify({
      model: 'jev-latest',
      answers: {
        placement: {
          type: 'choice',
          choice,
          confidence: 0.93,
          probabilities: Object.fromEntries(
            requestBody.candidates.map((candidate, index) => [
              candidate.id,
              index === 0 ? 1 : 0,
            ]),
          ),
        },
      },
      usage: { input_tokens: 120, output_tokens: 12 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('POST /api/jev/decision', () => {
  beforeEach(() => {
    process.env.JEV_API_KEY = API_KEY_SENTINEL;
    upstreamFetch.mockReset();
    vi.stubGlobal('fetch', upstreamFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousApiKey === undefined) {
      delete process.env.JEV_API_KEY;
    } else {
      process.env.JEV_API_KEY = previousApiKey;
    }
  });

  it('makes one typed TypeSafe choice call and returns only the validated choice ID', async () => {
    const body = createValidRequestBody();
    const selectedCandidate = body.candidates[0];
    upstreamFetch.mockResolvedValueOnce(choiceResponse(selectedCandidate.id));

    const response = await POST(createJsonRequest(body));
    const responseText = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(responseText)).toEqual({ choice: selectedCandidate.id });
    expect(responseText).not.toContain(API_KEY_SENTINEL);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);

    const [url, init] = upstreamFetch.mock.calls[0]!;
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${API_KEY_SENTINEL}`,
      'Content-Type': 'application/json',
    });
    expect(init?.cache).toBe('no-store');

    const payload = JSON.parse(String(init?.body)) as {
      model: string;
      state: { board: Board; piece: ActivePiece };
      questions: Record<
        string,
        { type: string; instructions: string; criteria: Record<string, string> }
      >;
    };
    expect(payload.model).toBe('jev-latest');
    expect(payload.state).toEqual({ board: body.board, piece: body.piece });
    expect(Object.keys(payload.questions)).toEqual(['placement']);
    expect(payload.questions.placement.type).toBe('choice');
    expect(Object.keys(payload.questions.placement.criteria)).toEqual(
      body.candidates.map(({ id }) => id),
    );
  });

  it('rejects an invalid candidate set without calling TypeSafe', async () => {
    const body = createValidRequestBody();
    const response = await POST(
      createJsonRequest({ ...body, candidates: body.candidates.slice(1) }),
    );

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects a same-length duplicate candidate set without calling TypeSafe', async () => {
    const body = createValidRequestBody();
    const candidates = [...body.candidates];
    candidates[candidates.length - 1] = { ...candidates[0] };
    const response = await POST(createJsonRequest({ ...body, candidates }));

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('returns a safe configuration error without a call when JEV_API_KEY is absent', async () => {
    delete process.env.JEV_API_KEY;
    const response = await POST(createJsonRequest(createValidRequestBody()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'jev_not_configured' });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON before calling TypeSafe', async () => {
    const response = await POST(
      new Request('http://localhost/api/jev/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json',
      }),
    );

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects an oversized JSON body before calling TypeSafe', async () => {
    const response = await POST(
      new Request('http://localhost/api/jev/decision', {
        method: 'POST',
        body: 'x'.repeat(64 * 1024 + 1),
      }),
    );

    expect(response.status).toBe(413);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('returns a generic error for an upstream non-success without echoing key or body', async () => {
    upstreamFetch.mockResolvedValueOnce(
      new Response(`upstream detail contains ${API_KEY_SENTINEL}`, {
        status: 401,
      }),
    );
    const response = await POST(createJsonRequest(createValidRequestBody()));
    const responseText = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(responseText)).toEqual({ error: 'jev_upstream_failed' });
    expect(responseText).not.toContain(API_KEY_SENTINEL);
    expect(responseText).not.toContain('upstream detail');
  });

  it('returns a generic error for upstream transport failure', async () => {
    upstreamFetch.mockRejectedValueOnce(
      new Error(`transport failure contains ${API_KEY_SENTINEL}`),
    );
    const response = await POST(createJsonRequest(createValidRequestBody()));
    const responseText = await response.text();

    expect(response.status).toBe(502);
    expect(responseText).not.toContain(API_KEY_SENTINEL);
    expect(responseText).not.toContain('transport failure');
  });

  it('returns a generic error for malformed upstream JSON', async () => {
    upstreamFetch.mockResolvedValueOnce(new Response('{ bad json', { status: 200 }));
    const response = await POST(createJsonRequest(createValidRequestBody()));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'jev_upstream_failed' });
  });

  it('returns a generic error when TypeSafe returns a non-choice answer', async () => {
    upstreamFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: { placement: { type: 'noul', noul: 0.5 } },
          usage: { input_tokens: 4, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const response = await POST(createJsonRequest(createValidRequestBody()));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'jev_upstream_failed' });
  });

  it('rejects a TypeSafe choice ID that was not submitted', async () => {
    upstreamFetch.mockResolvedValueOnce(choiceResponse('not-a-legal-candidate'));
    const response = await POST(createJsonRequest(createValidRequestBody()));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'jev_upstream_failed' });
  });
});
