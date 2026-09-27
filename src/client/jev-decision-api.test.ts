import { describe, expect, it, vi } from 'vitest';
import { requestJevDecision } from './jev-decision-api';
import { beginJevDecision, completeJevDecision, failJevDecision, retryJevDecision } from '../game/jev-decision-session';
import { createMatchSession, startMatchSession, tickMatchSession } from '../game/match-session';

function begin() { return beginJevDecision(startMatchSession(createMatchSession(123)), 'client-1')!; }
function answer() {
  const flow = begin();
  return {
    choice: flow.snapshot.candidates[0].id,
    selectedCandidate: { board: 'forged' },
    probabilities: Object.fromEntries(flow.snapshot.candidates.map(({ id }) => [id, 0.123456789])),
    usage: { inputTokens: 4, outputTokens: 0 },
  };
}

describe('same-origin Jev adapter', () => {
  it('posts once per explicit attempt and preserves byte-identical seed snapshots on retry', async () => {
    const initial = begin();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'upstream detail' }, { status: 502 }))
      .mockResolvedValueOnce(Response.json(answer()));
    const signal = new AbortController().signal;
    const failed = await requestJevDecision(initial.snapshot, fetcher, signal);
    expect(failed).toEqual({ ok: false, error: 'jev_request_failed' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const retry = retryJevDecision(failJevDecision(initial, initial.token));
    const success = await requestJevDecision(retry.snapshot, fetcher, signal);
    expect(success.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const request = fetcher.mock.calls[0];
    expect(request[0]).toBe('/api/jev/decision');
    expect(request[1]).toMatchObject({ method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, signal });
    expect(request[1]?.body).toBe(retry.snapshot.requestBody);
    expect(fetcher.mock.calls[1][1]?.body).toBe(request[1]?.body);
    expect(JSON.parse(request[1]!.body as string).seed).toBe(123);
    expect(tickMatchSession(retry.session)).toBe(retry.session);
    if (!success.ok) throw new Error('Expected success');
    expect(success.result.selectedCandidate).toBe(retry.snapshot.candidates[0]);
    expect(success.result.usage).toEqual({ inputTokens: 4, outputTokens: 0 });
    expect(success.result.probabilities[success.result.choice]).toBe(0.123456789);
    expect(completeJevDecision(retry, retry.token, success.result).session.phase).toBe('playing');
  });

  it('leaves a pending match frozen until a response arrives', async () => {
    const flow = begin();
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>(() => new Promise((done) => { resolve = done; }));
    const pending = requestJevDecision(flow.snapshot, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(tickMatchSession(flow.session)).toBe(flow.session);
    resolve(Response.json(answer()));
    expect((await pending).ok).toBe(true);
  });

  it.each(['reject', 'abort', 'http', 'json', 'choice', 'probabilities', 'null', 'array'])('returns a generic failure for %s without retry', async (kind) => {
    const fetcher = vi.fn<typeof fetch>();
    const response = answer();
    if (kind === 'reject' || kind === 'abort') fetcher.mockRejectedValue(new Error('secret details'));
    else if (kind === 'http') fetcher.mockResolvedValue(new Response('private upstream', { status: 500 }));
    else if (kind === 'json') fetcher.mockResolvedValue(new Response('not json'));
    else {
      if (kind === 'choice') response.choice = 'unknown';
      if (kind === 'probabilities') response.probabilities[response.choice] = 1.1;
      fetcher.mockResolvedValue(Response.json(kind === 'null' ? null : kind === 'array' ? [] : response));
    }
    expect(await requestJevDecision(begin().snapshot, fetcher)).toEqual({ ok: false, error: 'jev_request_failed' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, {}, { inputTokens: -1, outputTokens: 2 }, { inputTokens: 1.5, outputTokens: 2 }, { inputTokens: 1, outputTokens: Number.MAX_SAFE_INTEGER + 1 }])('omits invalid optional usage %j', async (usage) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...answer(), usage }));
    const response = await requestJevDecision(begin().snapshot, fetcher);
    expect(response.ok).toBe(true);
    if (response.ok) expect(response.result).not.toHaveProperty('usage');
  });
});
