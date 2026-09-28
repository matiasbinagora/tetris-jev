# Jev Placement Strategy Implementation Plan

> **For agentic workers:** Use the `executing-plans` skill to implement this plan task by task. Each numbered OpenSpec task remains its own PR.

**Goal:** Make Jev choose among at most 12 server-validated Tetris placements ranked with computed outcomes and a known-next-piece lookahead, while Jev remains the final chooser.

**Architecture:** Add a deterministic seeded sequence lookup and a pure placement-ranking module. The client and server derive the same shortlist; the route validates the client snapshot, generates compact outcome-rich choice criteria, and maps Jev's returned labels and probabilities to canonical candidates. The interface labels probabilities as relative to that shortlist.

**Tech Stack:** TypeScript, Next.js 16 App Router Route Handler, Vitest, React.

**Spec:** `openspec/changes/play-tetris-against-jev/design.md`, task 7.1 and `specs/jev-decisions/spec.md`.

## Global Constraints

- Preserve `agents-cli@0.1.0` and `node_modules/agents-cli/catalog/agents/global-orchestrator.md`.
- Keep board transitions, sequence lookup, candidate ranking, and candidate validation deterministic and pure.
- Use the existing 10 by 20 visible board, two hidden spawn rows, seven-bag, and legal movement/SRS helpers.
- Send at most 12 shortlisted candidates, below Jev's 255-option limit.
- Jev makes the applied choice. Ranking may filter or order choices but may never choose a move or supply a fallback.
- Preserve returned probability values without normalization; label them as relative to the submitted shortlist.
- Keep `JEV_API_KEY` server-only and preserve the existing eight-second upstream deadline and retry identity.
- Add no application dependency for this task.

## Review Focus

- Sequence indexes at seed normalization and bag boundaries return the same items as the live seven-bag state.
- A current placement that tops out is omitted whenever any surviving placement exists; if all placements top out, the route still produces a valid shortlist.
- A line-clearing candidate remains eligible even when it is not the overall top score.
- The route rejects a forged sequence index, next piece, candidate ID, pose, or candidate ordering before calling TypeSafe.
- Jev probabilities map from short API labels to the correct canonical IDs with their original values and no extra keys.
- Retry serializes the same seed, sequence index, current/next piece, board, and shortlist byte-for-byte.
- Criterion descriptions remain compact and contain only server-computed board facts; no user-supplied score or prose reaches TypeSafe.

---

### Task 1: Pure seeded sequence lookup

**Files:**
- Modify: `src/game/match.ts`
- Test: `src/game/match.test.ts`

**Interfaces:**
- Produces: `getPieceAtSequenceIndex(seed: number, index: number): PieceType` and `MAX_SEQUENCE_INDEX = 10_000`.
- The function uses the existing seed normalization and Fisher–Yates seven-bag generator. Index zero is the first item in `createMatchCore(seed)`; indexes seven and later continue from the preceding bag's PRNG state.
- Reject non-integer or negative indexes and indexes above the maximum with `RangeError`. The route accepts current indexes through 9,999 so it can also validate the next piece.

- [x] **Step 1: Write the failing sequence lookup tests**

```ts
it('matches live seven-bag draws across bag boundaries', () => {
  const seed = 987654321;
  let state = createMatchCore(seed);
  const expected = [state.currentPiece];
  for (let index = 1; index < 21; index += 1) {
    state = advanceMatchRound(withBothPlayersLocked(state));
    expected.push(state.currentPiece);
  }

  expect(expected.map((_, index) => getPieceAtSequenceIndex(seed, index))).toEqual(expected);
});

it.each([-1, 1.5, Number.NaN, 10_001])('rejects invalid sequence index %s', (index) => {
  expect(() => getPieceAtSequenceIndex(123, index)).toThrow(RangeError);
});
```

- [x] **Step 2: Run only the new tests and confirm the missing API fails**

Run: `npm test -- src/game/match.test.ts`
Expected: FAIL because `getPieceAtSequenceIndex` is not exported.

- [x] **Step 3: Implement lookup by replaying deterministic bag shuffles**

```ts
export function getPieceAtSequenceIndex(seed: number, index: number): PieceType {
  if (!Number.isInteger(index) || index < 0 || index > MAX_SEQUENCE_INDEX) {
    throw new RangeError('Sequence index is outside the supported range.');
  }
  let randomState = normalizeSeed(seed);
  let bag: PieceType[] = [];
  const bagIndex = Math.floor(index / PIECE_TYPES.length);
  for (let currentBag = 0; currentBag <= bagIndex; currentBag += 1) {
    const shuffled = shuffleBag(randomState);
    bag = shuffled.bag;
    randomState = shuffled.randomState;
  }
  return bag[index % PIECE_TYPES.length];
}
```

Reuse `normalizeSeed` and `shuffleBag`; do not introduce another PRNG or mutate match state.

- [x] **Step 4: Run the focused suite**

Run: `npm test -- src/game/match.test.ts`
Expected: PASS, including existing sequence and serialization tests.

### Task 2: Pure ranking and deterministic shortlist

**Files:**
- Create: `src/game/jev-placement.ts`
- Create: `src/game/jev-placement.test.ts`
- Reuse: `src/game/engine.ts` and `src/game/match.ts`

**Interfaces:**
- Produces `rankJevPlacements(board: Board, piece: ActivePiece, nextPiece: PieceType): RankedLanding[]`.
- `RankedLanding extends LandingCandidate` with `score: number` and `followUp: { linesCleared: number; topOut: boolean; metrics: BoardMetrics }`.
- Return at most 12 candidates in deterministic descending score order, with candidate ID as the final tie-breaker.

- [x] **Step 1: Add tests for ranking invariants and useful line clears**

Build an I-piece line-clear fixture with the bottom visible row filled except for the four cells covered by the legal horizontal I landing. Assert the shortlist includes a candidate with `linesCleared === 1`. Also test that top-out candidates are excluded when a surviving candidate exists, all-top-out boards still return a shortlist, ranking is repeatable and capped at 12, the next piece affects follow-up metrics, and the input board is unchanged.

```ts
const first = rankJevPlacements(board, piece, 'I');
const second = rankJevPlacements(board, piece, 'I');
expect(first).toEqual(second);
expect(first.length).toBeLessThanOrEqual(12);
expect(first.some((candidate) => candidate.linesCleared === 1)).toBe(true);
expect(board).toEqual(before);
```

- [x] **Step 2: Run the new suite and confirm it fails for missing ranking code**

Run: `npm test -- src/game/jev-placement.test.ts`
Expected: FAIL because `rankJevPlacements` is not exported.

- [x] **Step 3: Implement one-step lookahead and scoring**

For each current landing, evaluate:

```ts
quality = 12 * linesCleared - 8 * holes - 0.5 * aggregateHeight - 0.4 * bumpiness;
candidateScore = currentQuality + 0.5 * bestNextPieceQuality;
```

For lookahead, spawn `nextPiece` on the canonical post-lock board, enumerate and simulate its legal landings, and choose the highest-quality surviving follow-up. Use `-1000` when the next spawn or all follow-up landings top out. Exclude current-piece top-outs when a surviving candidate exists. Keep the best candidate for each distinct current line-clear count, then fill the remaining slots by score until 12. If every current candidate tops out, rank those candidates by the same formula. Do not select or apply a candidate in this module.

- [x] **Step 4: Run engine and strategy suites**

Run: `npm test -- src/game/engine.test.ts src/game/match.test.ts src/game/jev-placement.test.ts`
Expected: PASS with existing engine behavior unchanged.

### Task 3: Canonical request validation and outcome-rich TypeSafe choice

**Files:**
- Modify: `src/game/jev-decision-contract.ts`
- Modify: `src/server/jev-decision.ts`
- Modify: `src/server/jev-decision.test.ts`
- Modify: `app/api/jev/decision/route.test.ts`

**Interfaces:**
- Request fields: `seed`, `sequenceIndex`, `board`, `piece`, `nextPiece`, and `candidates` containing the shortlisted `{ id, lockedPiece }` entries.
- The server derives current and next sequence pieces from `seed` and a `sequenceIndex` from 0 through 9,999, rebuilds the canonical shortlist using `rankJevPlacements`, and rejects any candidate list whose IDs, poses, or ordering differ.
- TypeSafe criteria use short labels `p0` through `p11`; the validated server object holds a bijection between labels and canonical landing IDs.

- [x] **Step 1: Convert route tests to the new valid request and write rejection cases**

Cover current and next piece mismatch, sequence-index boundaries, omitted/duplicate/reordered/forged shortlist options, modified poses, all-top-out shortlists, missing key, upstream failure, malformed choice labels, and secret absence. Assert invalid requests never call the mocked upstream fetcher.

- [x] **Step 2: Run route and server suites to confirm the new contract fails**

Run: `npm test -- src/server/jev-decision.test.ts app/api/jev/decision/route.test.ts`
Expected: FAIL because validation and payload mapping still require the full landing set and old request shape.

- [x] **Step 3: Implement server recomputation and compact criteria**

Use `getPieceAtSequenceIndex` to verify current and next pieces. Recompute the shortlist; never accept client scores or prose. Build each criterion from canonical pose, immediate lines cleared, resulting holes/height/bumpiness, and best-next-piece lines/outcomes. Send a compact board representation and piece labels in the state. Map returned `pN` choice/probability keys back to canonical IDs; reject missing, extra, unknown, non-finite, or out-of-range probabilities.

- [x] **Step 4: Run route, server, and contract suites**

Run: `npm test -- src/server/jev-decision.test.ts app/api/jev/decision/route.test.ts src/game/jev-decision-session.test.ts src/client/jev-decision-api.test.ts`
Expected: PASS; the existing key handling and eight-second deadline remain covered.

### Task 4: Client snapshot and conditional probability presentation

**Files:**
- Modify: `src/game/jev-decision-session.ts`
- Modify: `src/game/jev-decision-session.test.ts`
- Modify: `src/client/jev-decision-panel.tsx`
- Modify: `src/client/jev-decision-panel.test.tsx`
- Modify: `README.md`

**Interfaces:**
- `beginJevDecision` obtains the known next piece, ranks the candidate list, and serializes the sequence index and exact shortlist once for retry.
- `JevDecisionSnapshot.candidates` contains only the canonical shortlist as `RankedLanding[]`, including computed lookahead facts; the serialized request maps those to `{ id, lockedPiece }` only.
- The panel labels probabilities as `Among evaluated options` and shows the best-next-piece outcome with each candidate's immediate board effects.

- [x] **Step 1: Add coordinator tests for shortlist and byte-identical retry**

Assert the request includes the expected seed, sequence index, current piece, next piece, and no more than 12 `{ id, lockedPiece }` entries. Assert the captured snapshot retains ranked follow-up metrics for those same IDs. After a simulated failure, assert the retry body is byte-identical. Assert completion applies only the canonical selected shortlist candidate.

- [x] **Step 2: Run coordinator tests and confirm the snapshot is still full-set based**

Run: `npm test -- src/game/jev-decision-session.test.ts`
Expected: FAIL on expected next-piece/shortlist shape or retry body assertions.

- [x] **Step 3: Build snapshots from the pure shortlist and update the decision panel**

Preserve decision ID and attempt-token guards. Reuse the canonical shortlist produced by the pure ranking module. Update copy and computed facts; do not call the ranking score a Jev probability or explanation. Document the revised behavior and current rollout status in the README.

- [x] **Step 4: Run client coordinator and panel tests**

Run: `npm test -- src/game/jev-decision-session.test.ts src/client/jev-decision-panel.test.tsx src/client/jev-decision-api.test.ts`
Expected: PASS with exact returned probability values.

### Task 5: Full task verification and Preview decision

**Files:**
- Verify: task 7.1 files above
- Update: `openspec/changes/play-tetris-against-jev/tasks.md`

- [x] **Step 1: Run focused tests and full project verification**

Run in order: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `openspec validate play-tetris-against-jev --strict`.
Expected: each exits zero; `agents-cli@0.1.0` and its catalog file are still present.

- [ ] **Step 2: Deploy the branch to Preview and verify one real Jev decision**

Wait for the PR Preview deployment. Open it in a browser with the already configured Preview `JEV_API_KEY`, start a match, and confirm one Jev decision succeeds, the selected move is in the displayed shortlist, probabilities are labeled conditional, and calculated line/lookahead outcomes render. Confirm the key does not appear in browser-visible response/assets. Do not add or reveal key values.

- [ ] **Step 3: Mark only task 7.1 complete and create its PR**

Check task 7.1 only after the focused and full verification and Preview interaction succeed. Leave tasks 7.2, 7.3, and 7.4 unchecked. Commit the implementation and task status in the task-specific branch, push, and open a separate PR against `main`.
