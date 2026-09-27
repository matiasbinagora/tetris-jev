# Jev Response Metadata (Task 4.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task after approval. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `POST /api/jev/decision` to return the server-selected canonical candidate, all returned per-candidate probabilities, and valid usage metadata from TypeSafe.

**Architecture:** Keep response parsing and mapping pure in `src/server/jev-decision.ts`. Pass the already validated request snapshot and untrusted upstream JSON into a mapper; accept only a known candidate ID and a complete probability map keyed by the validated IDs. Keep the route responsible for HTTP and for returning a generic upstream error when the answer cannot be mapped. Retain the existing `choice` string for compatibility and add `selectedCandidate`, `probabilities`, and optional `usage` fields.

**Current upstream contract:** TypeSafe's official System One response documents `answers.placement` with `type: 'choice'`, a selected `choice`, and a `probabilities` map keyed by the choice criteria; its top-level `usage` contains `input_tokens` and `output_tokens`. The current official response schema documents no latency or cost fields. This task will not estimate latency or cost; it will expose only valid metrics actually returned. If usage is absent or malformed, omit that optional metadata while preserving an otherwise valid legal choice.

**Tech Stack:** Next.js 16 App Router Route Handler, Node.js runtime, TypeScript, Vitest, existing Tetris engine.

**Spec:** `openspec/changes/play-tetris-against-jev/specs/jev-decisions/spec.md`, `openspec/changes/play-tetris-against-jev/specs/split-screen-interface/spec.md`, `openspec/changes/play-tetris-against-jev/design.md`, task 4.2 in `openspec/changes/play-tetris-against-jev/tasks.md`.

## Global Constraints

- Preserve the OpenSpec contract: return the selected legal candidate and returned probabilities; do not invent reasoning or metrics.
- Keep all upstream response handling on the server. Do not expose the API key, raw upstream response, raw error body, or exception text.
- Reuse only candidates recomputed by the shared engine after the request validation from task 4.1. Never return client-provided candidate simulations or metrics.
- Keep the `choice` property as the selected candidate ID. Add the canonical `selectedCandidate` from the server-computed candidate list for later client work.
- Require a `choice` answer with an ID in the canonical candidate set and a complete per-candidate probability map with finite numbers in `[0, 1]`. Preserve the returned numbers without normalization or rounding.
- Map `usage.input_tokens` and `usage.output_tokens` only when both are nonnegative integers; omit `usage` if missing or malformed. Do not calculate latency or cost because the current official schema does not return them.
- Keep tasks 4.3 (deadline/pause/retry), 4.4 (local key setup), and the UI tasks out of scope.
- Preserve `agents-cli@0.1.0` and `node_modules/agents-cli/catalog/agents/global-orchestrator.md`; this task adds no dependency.
- Keep product documentation and code comments in English. Update `README.md` to 9/19 after implementation.

## Review Focus

- A valid TypeSafe `choice` answer maps to the exact server-computed candidate selected by its ID; test a candidate with distinctive simulated board effects and assert those canonical effects are returned.
- Probabilities are preserved without rounding or normalization and map to every submitted candidate ID; test fractional values and reject missing, additional, non-numeric, non-finite, and out-of-range entries.
- Missing or malformed optional usage metrics are omitted without fabricating values; valid input/output token counts are mapped from the documented snake_case names to the client response.
- A missing, non-choice, malformed, or unknown choice response returns a generic 502 and does not expose credentials or upstream details; verify no client key or raw body appears in the response.
- The existing 4.1 contract remains intact: request validation still precedes the upstream call, one call is made, `choice` remains a string ID, and server-only credential handling is unchanged.

---

### Task 1: Map TypeSafe's answer to a safe application response

**Files:**
- Modify: `src/server/jev-decision.ts` to add response/usage interfaces and a pure mapper from unknown TypeSafe JSON to a result based only on the validated candidate snapshot.
- Modify: `src/server/jev-decision.test.ts` for valid mapping, canonical selected-candidate mapping, exact probability preservation, optional/malformed usage, and malformed answer coverage.
- Modify: `app/api/jev/decision/route.ts` to use the mapper and return the expanded success shape; retain the generic 502 response when required decision data is malformed or the choice is unknown.
- Modify: `app/api/jev/decision/route.test.ts` for route serialization, mapped usage/probabilities, and safe failures.
- Modify: `README.md` with task 4.2 progress and response contract.
- Modify: `openspec/changes/play-tetris-against-jev/tasks.md` to mark only task 4.2 complete after verification.

**Proposed success response:**

```json
{
  "choice": "<candidate-id>",
  "selectedCandidate": {
    "id": "<candidate-id>",
    "lockedPiece": { "type": "T", "rotation": 0, "x": 3, "y": 20 },
    "board": [],
    "linesCleared": 0,
    "topOut": false,
    "metrics": {
      "columnHeights": [],
      "aggregateHeight": 0,
      "holes": 0,
      "bumpiness": 0
    }
  },
  "probabilities": { "<candidate-id>": 0.123 },
  "usage": { "inputTokens": 120, "outputTokens": 12 }
}
```

`usage` is omitted if the response does not contain a valid token-usage object. `selectedCandidate` is copied from the recomputed canonical engine candidate. The example's empty board/metrics arrays are illustrative placeholders; implementation and tests must use actual engine values.

**Mapper contract:**

```ts
export interface JevTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface JevDecisionResult {
  choice: string;
  selectedCandidate: LandingCandidate;
  probabilities: Record<string, number>;
  usage?: JevTokenUsage;
}

export function mapJevDecisionResponse(
  validated: ValidatedJevDecision,
  value: unknown,
): JevDecisionResult | null;
```

Validate that the root and `answers.placement` are plain objects; require `placement.type === 'choice'`, a non-empty `choice` in the validated candidate map, and exactly one probability value per candidate ID. Reject extra/omitted probability keys and values that are not finite numbers between 0 and 1. Return probability values unchanged. Map `usage` only when both documented token counts are nonnegative integers; otherwise omit it. Ignore undocumented upstream fields, including any latency/cost fields, and do not measure local request duration.

**Implementation steps:**

- [x] Read the documented TypeSafe response schema and verify `ChoiceAnswer.probabilities` and `Usage` field names against the official API reference and official SDK types.
- [x] Write pure mapper tests first. Cover an exact candidate choice and probability map; verify the selected candidate equals the canonical engine simulation; preserve non-integer fractional probabilities exactly; map valid usage; omit absent and malformed usage; reject an invalid choice type, unknown choice ID, missing answer, incomplete/extra probability keys, non-number, `NaN`/infinity, and values outside `[0, 1]`.
- [x] Run focused tests and confirm assertion-level RED before implementing the mapper.
- [x] Implement the pure mapper. Keep the candidate list and selected candidate sourced only from the `ValidatedJevDecision`; never forward the upstream object itself.
- [x] Update the route to call the mapper after one successful upstream JSON response. Return its result as JSON, or `{ "error": "jev_upstream_failed" }` with status 502 if required choice/probability data cannot be mapped. Keep 4.1 input/key/upstream protections unchanged.
- [x] Add route tests for the extended success payload, valid token usage mapping, missing/malformed optional metadata omission, malformed answer/probability errors, unknown choice, and key/upstream detail absence.
- [x] Update `README.md` current status to 9/19 and document the chosen `choice`, canonical `selectedCandidate`, exact probability mapping, and optional returned token usage. Continue to defer `.env.local` setup instructions to task 4.4.
- [x] Mark only task 4.2 complete in the OpenSpec task list after final verification.

**Verification:**

```sh
npm test -- src/server/jev-decision.test.ts app/api/jev/decision/route.test.ts
npm run lint
npm run typecheck
npm test
npm run build
openspec validate play-tetris-against-jev --strict --no-interactive
openspec instructions apply --change play-tetris-against-jev --json
rg -c '^\s*- \[x\]' openspec/changes/play-tetris-against-jev/tasks.md
git diff --check
```

Expected: focused and full tests pass, lint/typecheck/build pass, OpenSpec is valid and reports 9 of 19 tasks complete, the task checkbox count is `9`, and `git diff --check` passes.

**Commit and PR:**

```sh
git add src/server/jev-decision.ts src/server/jev-decision.test.ts app/api/jev/decision/route.ts app/api/jev/decision/route.test.ts README.md openspec/changes/play-tetris-against-jev/tasks.md
git commit -m "feat: map Jev decision metadata"
```

Push `feature/task-4-2-jev-response-metadata` and create a separate PR against `main`. Keep the worktree for review and do not merge it; the user merges manually.

## Research references

- [Official TypeSafe OpenAPI reference](https://api.typesafe.ai/openapi.json): `ChoiceAnswer` defines a selected ID and probabilities keyed by choice ID; `Usage` defines `input_tokens` and `output_tokens`; the current response schema does not define latency or cost.
- [Official TypeSafe JavaScript SDK response types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts): `ChoiceResponse`, `Usage`, and `SystemOneResult` mirror the documented response contract.
- [TypeSafe API documentation](https://api.typesafe.ai/docs): official bearer authentication and System One API.
