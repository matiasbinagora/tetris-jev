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
  seed: number;
  board: Board;
  piece: ActivePiece;
  candidates: { id: string; lockedPiece: ActivePiece }[];
} {
  const board = createEmptyBoard();
  const piece: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
  const candidates = enumerateLegalLandingCandidates(board, piece);

  return {
    seed: 123,
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

function probabilitiesForRequest(body = createValidRequestBody()): Record<string, number> {
  return Object.fromEntries(
    enumerateLegalLandingCandidates(body.board, body.piece).map(
      (candidate, index) => [
        candidate.id,
        index === 0 ? 0.123456789 : 0.234567891,
      ],
    ),
  );
}

function choiceResponse(
  choice: string,
  options: {
    includeUsage?: boolean;
    probabilities?: Record<string, unknown>;
    usage?: unknown;
  } = {},
): Response {
  const requestBody = createValidRequestBody();
  const responseBody: Record<string, unknown> = {
    model: 'jev-latest',
    answers: {
      placement: {
        type: 'choice',
        choice,
        confidence: 0.93,
        probabilities: options.probabilities ?? probabilitiesForRequest(requestBody),
      },
    },
  };
  if (options.includeUsage !== false) {
    responseBody.usage = Object.hasOwn(options, 'usage')
      ? options.usage
      : { input_tokens: 120, output_tokens: 12 };
  }

  return new Response(
    JSON.stringify(responseBody),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('POST /api/jev/decision', () => {
  it.each(['headers', 'body'])('enforces the deadline while waiting for %s', async (stage) => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    upstreamFetch.mockImplementation((_url, init) => {
      signal = init?.signal;
      if (stage === 'headers') return new Promise(() => {});
      const response = new Response('{}', { status: 200 });
      vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
      return Promise.resolve(response);
    });
    let settled = false;
    const pending = POST(createJsonRequest(createValidRequestBody())).then((response) => {
      settled = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(7999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(signal?.aborted).toBe(true);
    const response = await pending;
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'jev_upstream_failed' });
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a streaming non-success response before clearing the deadline', async () => {
    vi.useFakeTimers();
    const aborted = vi.fn();
    upstreamFetch.mockImplementation((_url, init) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('private upstream error'));
          init?.signal?.addEventListener('abort', () => {
            aborted();
            controller.error(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        },
      });
      return Promise.resolve(new Response(body, { status: 503 }));
    });
    const response = await POST(createJsonRequest(createValidRequestBody()));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'jev_upstream_failed' });
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(upstreamFetch.mock.calls[0]![1]!.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it('clears its deadline after a successful response', async () => {
    vi.useFakeTimers();
    const body = createValidRequestBody();
    upstreamFetch.mockResolvedValueOnce(choiceResponse(body.candidates[0]!.id));
    expect((await POST(createJsonRequest(body))).status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
    const signal = upstreamFetch.mock.calls[0]![1]!.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(8000);
    expect(signal?.aborted).toBe(false);
  });

  it('rejects a missing seed without an upstream request', async () => {
    const body: Record<string, unknown> = createValidRequestBody();
    delete body.seed;
    upstreamFetch.mockResolvedValueOnce(choiceResponse(createValidRequestBody().candidates[0]!.id));
    expect((await POST(createJsonRequest(body))).status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    process.env.JEV_API_KEY = API_KEY_SENTINEL;
    upstreamFetch.mockReset();
    vi.stubGlobal('fetch', upstreamFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (previousApiKey === undefined) {
      delete process.env.JEV_API_KEY;
    } else {
      process.env.JEV_API_KEY = previousApiKey;
    }
  });

  it('maps one typed TypeSafe choice call to the canonical candidate, probabilities, and usage', async () => {
    const body = createValidRequestBody();
    const canonicalCandidates = enumerateLegalLandingCandidates(body.board, body.piece);
    const selectedCandidate = canonicalCandidates[3]!;
    upstreamFetch.mockResolvedValueOnce(choiceResponse(selectedCandidate.id));

    const response = await POST(createJsonRequest(body));
    const responseText = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(responseText)).toEqual({
      choice: selectedCandidate.id,
      selectedCandidate,
      probabilities: probabilitiesForRequest(body),
      usage: { inputTokens: 120, outputTokens: 12 },
    });
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

  it('maps valid zero usage and omits absent or malformed optional usage', async () => {
    const body = createValidRequestBody();
    const selectedId = body.candidates[0]!.id;
    const validCandidates = enumerateLegalLandingCandidates(body.board, body.piece);

    upstreamFetch.mockResolvedValueOnce(
      choiceResponse(selectedId, { includeUsage: false }),
    );
    const missingUsageResponse = await POST(createJsonRequest(body));
    const missingUsageBody = await missingUsageResponse.json();
    expect(missingUsageResponse.status).toBe(200);
    expect(missingUsageBody).not.toHaveProperty('usage');
    expect(missingUsageBody).not.toHaveProperty('latencyMs');
    expect(missingUsageBody).not.toHaveProperty('cost');

    upstreamFetch.mockResolvedValueOnce(
      choiceResponse(selectedId, {
        usage: { input_tokens: 4.5, output_tokens: 12 },
      }),
    );
    const fractionalInputResponse = await POST(createJsonRequest(body));
    const fractionalInputBody = await fractionalInputResponse.json();
    expect(fractionalInputResponse.status).toBe(200);
    expect(fractionalInputBody).not.toHaveProperty('usage');

    upstreamFetch.mockResolvedValueOnce(
      choiceResponse(selectedId, {
        usage: { input_tokens: 120, output_tokens: -1 },
      }),
    );
    const negativeOutputResponse = await POST(createJsonRequest(body));
    const negativeOutputBody = await negativeOutputResponse.json();
    expect(negativeOutputResponse.status).toBe(200);
    expect(negativeOutputBody).not.toHaveProperty('usage');
    expect(negativeOutputBody.selectedCandidate).toEqual(validCandidates[0]);

    upstreamFetch.mockResolvedValueOnce(
      choiceResponse(selectedId, {
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    );
    const zeroUsageResponse = await POST(createJsonRequest(body));
    const zeroUsageBody = await zeroUsageResponse.json();
    expect(zeroUsageResponse.status).toBe(200);
    expect(zeroUsageBody.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('rejects incomplete probabilities with a generic error and no upstream detail', async () => {
    const body = createValidRequestBody();
    upstreamFetch.mockResolvedValueOnce(
      choiceResponse(body.candidates[0]!.id, {
        probabilities: { forged: 0.5 },
      }),
    );
    const response = await POST(createJsonRequest(body));
    const responseText = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(responseText)).toEqual({ error: 'jev_upstream_failed' });
    expect(responseText).not.toContain(API_KEY_SENTINEL);
    expect(responseText).not.toContain('forged');
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
