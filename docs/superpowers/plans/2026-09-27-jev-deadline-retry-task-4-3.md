# Jev Deadline and Retry (Task 4.3) Implementation Plan

> **For agentic workers:** Use `executing-plans` in the previously selected Native mode. The user approved the design and requested final review and continuation. Execute this plan in the existing PR #11.

**Goal:** Enforce the eight-second upstream deadline and supply a pure paused-decision coordinator with exact-snapshot retry and a same-origin client adapter.

**Architecture:** Keep HTTP timing in the route and network I/O in a small client adapter. Keep the decision snapshot, retry transitions, and application of canonical candidates pure. Share request/result types across the browser/server boundary and reuse match settlement without applying an extra gravity tick.

**Tech Stack:** TypeScript, Next.js Node Route Handler, native fetch/AbortController, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-jev-deadline-retry-task-4-3-design.md`; OpenSpec `play-tetris-against-jev` proposal, design, `jev-decisions`, `synchronized-match`, and task 4.3.

## Global Constraints

- Both boards and gravity remain paused while a decision is pending or failed; retry preserves the seed, board, piece, and complete legal candidate set.
- Each attempt makes one upstream call, with no automatic retries or alternate decision maker.
- Require an unsigned 32-bit seed in the same-origin POST and omit it from the TypeSafe payload.
- Keep `JEV_API_KEY` server-only and errors generic.
- Preserve canonical board simulations and probabilities without fabricated metrics.
- Preserve `agents-cli@0.1.0`; keep documentation in English and update the README.
- UI rendering and browser clock/keyboard integration remain tasks 5.1–5.4. Do not mark those tasks complete.

## Review Focus

- A response stalls after headers: the same eight-second deadline must terminate body reading and abort upstream, with timer cleanup on every exit.
- A prior retry or prior decision completes late: a caller-supplied decision ID plus attempt number must guard success and failure, including restarts with the same seed.
- Applying Jev's result must not tick or otherwise move the human piece; it must resolve immediate top-out and the round barrier without extra gravity.
- A caller mutates its source session after capture: the captured request and canonical candidates must remain detached; retries must send byte-identical JSON.
- A malformed/unknown response or duplicate completion must never apply a board; complete probabilities are validated, supplied board simulations are ignored, and completion is applied once.

## Task 1: Implement the decision deadline and retry lifecycle

**Files and responsibilities:**

- Create `src/game/jev-decision-contract.ts`: shared request/result types and pure application-response parser based on captured canonical candidates.
- Modify `src/server/jev-decision.ts`: re-export shared types; require and retain the seed, while preserving the TypeSafe input and upstream response mapper.
- Modify `app/api/jev/decision/route.ts`: race the complete fetch/body operation against 8,000 ms, abort on deadline, clear the timer in `finally`.
- Modify `src/game/match-session.ts`: extract `settleMatchSession(state)` from the gravity transition so placement settlement can reuse outcome/barrier logic without moving a piece.
- Create `src/game/jev-decision-session.ts`: pure begin, failure, retry and completion transitions plus snapshot serialization.
- Create `src/client/jev-decision-api.ts`: one same-origin POST per invocation, safe result/error union, abort support for future view cleanup.
- Add corresponding coordinator and client tests; extend existing server and route tests.
- Update `README.md`, the task design, OpenSpec design, and the task checkbox after verification.

**Interfaces:**

```ts
type JevAttemptToken = { decisionId: string; attempt: number };
type JevDecisionStatus = 'pending' | 'retry-required' | 'complete';
interface JevDecisionSnapshot {
  seed: number;
  board: Board;
  piece: ActivePiece;
  candidates: LandingCandidate[];
  requestBody: string;
}
interface JevDecisionSession {
  session: MatchSessionState;
  snapshot: JevDecisionSnapshot;
  token: JevAttemptToken;
  status: JevDecisionStatus;
  result: JevDecisionResult | null;
}
// The host supplies a distinct decisionId for every new decision, including restart.
beginJevDecision(session: MatchSessionState, decisionId: string): JevDecisionSession | null;
failJevDecision(state: JevDecisionSession, token: JevAttemptToken): JevDecisionSession;
retryJevDecision(state: JevDecisionSession): JevDecisionSession;
completeJevDecision(state: JevDecisionSession, token: JevAttemptToken, value: unknown): JevDecisionSession;
settleMatchSession(state: MatchSessionState): MatchSessionState;
parseJevDecisionResult(candidates: LandingCandidate[], value: unknown): JevDecisionResult | null;
requestJevDecision(snapshot: JevDecisionSnapshot, fetcher?: typeof fetch, signal?: AbortSignal): Promise<
  { ok: true; result: JevDecisionResult } | { ok: false; error: 'jev_request_failed' }
>;
```

- [x] Read the installed Next.js Route Handler documentation; install locked dependencies and verify the pinned agent tooling.
- [x] Extend seed fixtures and write server deadline/seed tests first. Reject absent, string, fractional, negative, nonfinite, and overflowing seeds; accept 0 and 0xffffffff. Assert no seed enters the upstream payload. With fake timers, capture the fetch signal and defer either headers or body completion:

```ts
let settled = false;
const pending = POST(createJsonRequest(createValidRequestBody()))
  .then((response) => { settled = true; return response; });
await vi.advanceTimersByTimeAsync(7999);
expect(settled).toBe(false);
await vi.advanceTimersByTimeAsync(1);
expect((await pending).status).toBe(502);
expect(signal.aborted).toBe(true);
expect(vi.getTimerCount()).toBe(0);
```

- [x] Run focused route/server tests and observe failures caused by the missing validation/deadline.
- [x] Add shared types, seed validation and the route deadline. Race one async fetch-plus-JSON operation against a timeout that aborts and resolves to invalid data; map only the winning response; clear the timer even when fetch throws. Run route/server tests to green.
- [x] Write coordinator tests before implementation. Use real engine candidates, paused lifecycle ticks, and a captured request string:

```ts
const flow = beginJevDecision(startMatchSession(createMatchSession(123)), 'match-1-round-0')!;
const failed = failJevDecision(flow, flow.token);
const retry = retryJevDecision(failed);
expect(tickMatchSession(retry.session)).toBe(retry.session);
expect(retry.snapshot).toBe(flow.snapshot);
expect(retry.snapshot.requestBody).toBe(flow.snapshot.requestBody);
expect(retry.session).toBe(flow.session);
expect(completeJevDecision(retry, flow.token, validResult)).toBe(retry);
```

Cover source mutation isolation; invalid begin states; stale success and failure across attempts and decision IDs; duplicate retry/completion; unknown choice and malformed probability map; canonical placement despite forged response board; unchanged human piece; both-locked progression; lock and spawn top-outs; JSON serialization. Minimal typed shells may be used to reach assertion-level RED for new exports.
- [x] Observe coordinator failures, then implement detached capture with `structuredClone`, fixed serialized POST body, token guards, and valid response parsing. Extract settlement from `tickMatchSession`; completion calls settlement with Jev locked and phase playing without a gravity tick. Run coordinator plus existing match tests to green.
- [x] Write client adapter tests using deferred responses and real coordinator snapshots. Invoke an initial failed POST and an explicit retry and assert both recorded bodies are identical including seed. Cover non-2xx, rejected fetch, invalid JSON, invalid decision, abort signal forwarding, and valid canonical result. No invocation may perform more than one fetch.
- [x] Observe adapter failures, implement one `fetch('/api/jev/decision', { method: 'POST', headers, body: snapshot.requestBody, signal, cache: 'no-store' })`, parse the JSON through the shared parser, and return the generic failure union on any unusable result. Run client tests to green.
- [x] Update the README with the request contract, pure coordinator integration, unique decision IDs, timeout and retry semantics. Record UI wiring as pending, and mark only OpenSpec 4.3 complete after the checks below.
- [x] Run full verification and commit the implementation:

```sh
npm test
npm run lint
npm run typecheck
npm run build
openspec validate play-tetris-against-jev --strict --no-interactive
git diff --check
git add src app README.md openspec docs/superpowers
git commit -m "feat: pause and retry Jev decisions with an eight-second deadline"
```

Expected: all tests/checks pass, OpenSpec reports 10/19 complete, and the worktree contains only the planned task changes.

- [ ] Request one independent whole-branch review. Fix material findings, update PR #11 with implementation and validation evidence, and mark it ready for the user's manual merge.
