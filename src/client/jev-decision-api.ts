import { parseJevDecisionResult, type JevDecisionResult } from '../game/jev-decision-contract';
import type { JevDecisionSnapshot } from '../game/jev-decision-session';

export type JevDecisionResponse =
  | { ok: true; result: JevDecisionResult }
  | { ok: false; error: 'jev_request_failed' };

export async function requestJevDecision(
  snapshot: JevDecisionSnapshot,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<JevDecisionResponse> {
  try {
    const response = await fetcher('/api/jev/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: snapshot.requestBody,
      cache: 'no-store',
      signal,
    });
    if (response.ok) {
      const result = parseJevDecisionResult(snapshot.candidates, await response.json());
      if (result) return { ok: true, result };
    }
  } catch {
    // Transport, abort, and parse failures share the same public contract.
  }
  return { ok: false, error: 'jev_request_failed' };
}
