# Jev Decision Route (Task 4.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a same-origin Node.js Route Handler that validates a submitted Jev board and complete legal-candidate set, makes exactly one typed Jev `choice` request, and returns only a selected candidate ID.

**Architecture:** Keep request validation and typed upstream-payload construction in a small pure module at `src/server/jev-decision.ts`; keep HTTP, environment access, and the single upstream `fetch` in `app/api/jev/decision/route.ts`. The route recomputes the legal landing candidates with the existing game engine and accepts only the exact candidate set and landing poses derived from the submitted board and piece. Use the official TypeSafe System One endpoint with the user's TypeSafe API key stored as `JEV_API_KEY` and the Web `fetch` API, so this task adds no package dependency.

**Tech Stack:** Next.js 16 App Router Route Handler, Node.js runtime, TypeScript, Vitest, existing Tetris engine.

**Spec:** `openspec/changes/play-tetris-against-jev/specs/jev-decisions/spec.md`, `openspec/changes/play-tetris-against-jev/design.md` (Next.js App Router with a same-origin Jev route), and task 4.1 in `openspec/changes/play-tetris-against-jev/tasks.md`.

## Global Constraints

- Use TypeScript and the Next.js App Router; this route SHALL use the Node.js runtime.
- The browser SHALL call a same-origin server route for Jev decisions.
- The route SHALL read `JEV_API_KEY` only on the server; never use a `NEXT_PUBLIC_` variable, return or log the key, or embed it in browser-visible assets or responses.
- Validate board dimensions and cells, the piece type and position, the candidate count, and every submitted candidate before making one Jev call.
- The submitted choice SHALL contain no more than 255 candidates, and only a returned identifier from the validated candidate set may be accepted.
- Keep match state in the browser. The route remains stateless and does not add accounts, storage, multiplayer, or garbage attacks.
- Do not substitute a heuristic or another model. Jev delays, deadlines, pending states, and retry behavior belong to task 4.3.
- Preserve `agents-cli@0.1.0` and `node_modules/agents-cli/catalog/agents/global-orchestrator.md` if dependencies change; this plan adds no dependency.
- Keep product docs and code comments in English; update `README.md` as task 4.1 is completed.

## Review Focus

- A board with the wrong row or column count, or a cell other than `null` or a standard tetromino, is rejected before any upstream call; test malformed dimensions and cell values.
- A piece with an unknown type, invalid rotation, non-integer coordinates, or a collision with the submitted board is rejected before any upstream call; test each invalid class.
- A candidate list with a duplicate, omitted, unknown, or modified landing is rejected before any upstream call; test duplicates, omission, and a forged landing pose.
- A request with zero candidates, more than 255 candidates, malformed JSON, or a body over the request-size limit fails safely before the Jev call; test count limits and malformed/oversized input.
- A Jev non-success response, malformed answer, or choice ID outside the validated set returns a generic error without echoing the API key or upstream body; test each failure with a sentinel key.

---

### Task 1: Implement the secure Jev decision endpoint

**Files:**
- Create: `src/server/jev-decision.ts` for request types, runtime validation, legal-candidate verification, and typed choice-payload construction.
- Create: `src/server/jev-decision.test.ts` for pure validation and request-construction cases.
- Create: `app/api/jev/decision/route.ts` for the Node.js POST handler, server key access, one upstream request, and safe HTTP responses.
- Create: `app/api/jev/decision/route.test.ts` for route success, key configuration, upstream failures, and secret-leak checks.
- Modify: `README.md` for current status, 8/19 progress, and the implemented route contract.
- Modify: `openspec/changes/play-tetris-against-jev/tasks.md` to mark only task 4.1 complete after verification.

**Interfaces:**
- Consumes: `Board`, `Cell`, `PIECE_TYPES`, `ActivePiece`, `LandingCandidate`, `isValidPosition`, and `enumerateLegalLandingCandidates` from `src/game/engine.ts`.
- Produces:

```ts
export interface SubmittedLanding {
  id: string;
  lockedPiece: ActivePiece;
}

export interface JevDecisionRequest {
  board: Board;
  piece: ActivePiece;
  candidates: SubmittedLanding[];
}

// POST /api/jev/decision success body for this task:
// { "choice": "<validated candidate id>" }
```

- Compare submitted candidates as a unique complete set against `enumerateLegalLandingCandidates(board, piece)`, including exact `lockedPiece` values. Reject duplicates, omissions, unknown IDs, and modified poses. Construct candidate criteria on the server from its recomputed candidates; do not trust client-supplied descriptions, simulations, or metrics.
- Set `export const runtime = 'nodejs'` in the Route Handler. The route accepts JSON with `board`, `piece`, and `candidates`, reads `process.env.JEV_API_KEY` inside `POST`, and makes exactly one `fetch` to `https://api.typesafe.ai/v1/systemone` for a valid request. Use a typed request containing one `choice` question named `placement`, with one criteria key per validated candidate ID and `model: 'jev-latest'`.
- Treat non-JSON input, invalid board/piece/candidates, and empty or oversized candidate lists as safe 4xx responses before network access. Limit the encoded request body to 64 KiB; return 413 when exceeded. Return a generic 503 configuration error when the key is absent. Return a generic 502 for an upstream non-2xx response, unreadable/malformed choice answer, or a chosen ID not in the verified candidate map. Do not include the key, Authorization header, upstream response body, or exception text in responses or logs.
- Keep the response intentionally minimal for this task: return only the verified `choice` ID. Task 4.2 will add selected candidate mapping, probabilities, and safe usage/latency metadata.

- [x] **Step 1: Install lockfile dependencies and verify the pinned agent CLI**

Run: `npm ci`

Expected: dependencies install without changing the lockfile or the approved `agents-cli` source.

Run: `node -p "require('./node_modules/agents-cli/package.json').version"`

Expected: `0.1.0`.

Run: `test -f node_modules/agents-cli/catalog/agents/global-orchestrator.md`

Expected: exit code 0.

- [x] **Step 2: Write failing pure-validation and route tests**

In `src/server/jev-decision.test.ts`, create a valid request fixture from `createEmptyBoard()`, `createSpawnPiece('T')`, and the full output of `enumerateLegalLandingCandidates(board, piece)`. Write assertions that the validator returns all and only server-recomputed candidates, and that typed choice criteria contain the stable candidate IDs with descriptions derived from the server's landing poses.

Add table-driven failing cases for wrong board row count, wrong row width, invalid cell value, unknown piece type, invalid rotation, non-integer coordinates, a piece overlapping an occupied cell, empty candidates, duplicate candidates, an omitted candidate, an unknown candidate ID, a changed landing pose, and more than 255 candidates.

In `app/api/jev/decision/route.test.ts`, write failing handler cases for:

```ts
it('makes one typed Jev choice call and returns only the validated choice id', async () => {
  // Use the valid shared fixture and stub global fetch at this external boundary.
  // Return { answers: { placement: { type: 'choice', choice: candidate.id } } }.
  // Assert status 200, response { choice: candidate.id }, one fetch call,
  // official TypeSafe endpoint, Bearer header, and one typed choice question.
});

it('rejects an invalid candidate set without calling Jev', async () => {
  // Alter one landing pose or candidate id; assert 400 and no fetch call.
});

it('returns a safe configuration error without a Jev call when the key is absent', async () => {
  // Clear JEV_API_KEY; assert 503 and no fetch call.
});

it('returns a generic upstream error without echoing upstream details or the key', async () => {
  // Set a sentinel JEV_API_KEY, return a failing response that contains the
  // sentinel in its body, and assert generic 502 JSON contains no sentinel.
});
```

Also test malformed JSON, a body larger than 64 KiB, an upstream non-2xx result, a malformed upstream choice, an unknown returned choice ID, and successful/error response serialization with a sentinel key absent.

- [x] **Step 3: Run the focused tests and confirm assertion-level RED**

Run: `npm test -- src/server/jev-decision.test.ts app/api/jev/decision/route.test.ts`

Expected: the tests fail because the validator and Route Handler have not been implemented. Fix any test import/setup errors until the failures reach the expected assertions.

- [x] **Step 4: Implement pure request validation and typed choice construction**

Implement runtime guards in `src/server/jev-decision.ts`. Validate exact board dimensions and every cell; require a standard piece type, rotation 0–3, and integer coordinates; then call `isValidPosition` to reject a piece that cannot occupy the board. Recompute the full candidate list with `enumerateLegalLandingCandidates` and verify the submitted list is non-empty, no larger than 255, unique, complete, and equal by ID and locked-piece pose. Return the validated snapshot or `null` instead of throwing on user input; the route maps invalid input to one generic response.

Build one TypeScript-typed upstream payload with `model: 'jev-latest'`, the submitted board and active piece as state, and `questions.placement = { type: 'choice', instructions, criteria }`. Each criteria value must describe only a recomputed legal placement, including tetromino type, origin, and rotation; do not accept client-provided prose.

- [x] **Step 5: Implement the Node.js Route Handler with a single upstream call**

Read the request body as a bounded UTF-8 stream, reject bodies larger than 64 KiB before parsing JSON, then validate. Check `JEV_API_KEY` only after the request is valid and immediately before the call. For valid input, issue one uncached JSON POST to `https://api.typesafe.ai/v1/systemone` with a Bearer authorization header and the typed choice payload. Parse the response as unknown data, require a `placement` answer of type `choice`, and accept its choice only when it is present in the recomputed candidate map.

Return `Response.json({ choice: candidateId })` on success. Return small generic JSON errors with 400 for invalid input, 413 for an oversized body, 503 when the key is missing, and 502 for upstream transport/status/shape/choice failures. Do not log errors or include exception text, response bodies, or credentials in a response.

- [x] **Step 6: Run focused tests, lint, and type-check**

Run: `npm test -- src/server/jev-decision.test.ts app/api/jev/decision/route.test.ts`

Expected: validation, single-call, safe-error, unknown-choice, and secret-absence tests pass.

Run: `npm run lint`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [x] **Step 7: Verify the secret is absent from client bundles**

Build with a fake sentinel key, never a real credential:

```sh
JEV_API_KEY=jev-route-client-bundle-sentinel npm run build
```

Search browser-visible output:

```sh
if rg -nF 'jev-route-client-bundle-sentinel' .next/static; then
  exit 1
else
  echo 'Sentinel absent from .next/static'
fi
```

Expected: build succeeds and the sentinel is absent from all files under `.next/static`.

- [x] **Step 8: Update README and complete OpenSpec task 4.1**

Update `README.md` current status to say the server-side Jev decision route is implemented while the response metadata mapping, shared pending/retry behavior, `.env.local` setup, and playable UI remain pending. Set progress to 8 of 19. Add a `Jev decision route` section describing the same-origin Node route, validated candidate set, one typed choice call, server-only credential boundary, and minimal returned choice ID. Do not document `.env.local` steps until task 4.4.

Change only task 4.1 from `[ ]` to `[x]` in `openspec/changes/play-tetris-against-jev/tasks.md` after the tests, bundle scan, lint, typecheck, and build pass.

Run:

```sh
npm test
npm run lint
npm run typecheck
openspec validate play-tetris-against-jev --strict --no-interactive
openspec instructions apply --change play-tetris-against-jev --json
rg -c '^\s*- \[x\]' openspec/changes/play-tetris-against-jev/tasks.md
git diff --check
```

Expected: all tests pass, lint/typecheck pass, strict OpenSpec validation is valid, apply instructions report 8/19 complete with task 4.1 done, checkbox count is `8`, and the diff check passes.

- [x] **Step 9: Commit the implementation and task record**

```sh
git add src/server/jev-decision.ts src/server/jev-decision.test.ts app/api/jev/decision/route.ts app/api/jev/decision/route.test.ts README.md openspec/changes/play-tetris-against-jev/tasks.md
git commit -m "feat: add secure Jev decision route"
```

After implementation, review the complete branch diff and final verification output, push `feature/task-4-1-jev-route`, update its draft PR from plan review to implementation summary, and mark the PR ready for review. Do not merge it; the user merges manually.

## Research references

- The [TypeSafe API reference](https://api.typesafe.ai/docs) documents Bearer authentication and `POST /v1/systemone`.
- The [TypeSafe SDK source](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/client.ts) confirms the official TypeSafe API base URL, default `jev-latest` model, and `/v1/systemone` request path.
- The [Next.js Route Handler reference](https://nextjs.org/docs/app/api-reference/file-conventions/route) documents POST handlers using Web `Request`/`Response` APIs and the route runtime configuration.
