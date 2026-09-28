# Jev Landing Animation and Decision History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Jev's choices visible as they land and keep recent decision facts available throughout a match.

**Architecture:** Keep the API response and selected board authoritative, but add a client presentation phase that delays locking until two 300 ms visual stages finish. Store at most five successful decision records in client match view state and render the most recent details plus expandable earlier entries.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Vitest, Testing Library, existing CSS Grid board renderer.

**Spec:** `openspec/changes/jev-landing-animation-and-decision-history/{design.md,specs/synchronized-match/spec.md,specs/split-screen-interface/spec.md}`

## Global Constraints

- A successful Jev choice lands in two visible stages of approximately 300 ms each; the exact validated board is applied after stage two.
- Respect `prefers-reduced-motion` by applying the selected landing immediately.
- Manual pause freezes the active Jev landing stage and preserves the accepted result until resume.
- The human keeps independent 700 ms gravity and controls while Jev decides or animates.
- Keep the five newest successful Jev decisions in newest-first order for the current match; keep the newest details visible and let users expand older records.
- Keep history visible during pending and retry-required decisions; clear it on new match.
- Apply only a candidate returned by Jev that matches the submitted canonical shortlist; never add a fallback decision maker.
- Show only returned probabilities and metrics, and label probabilities as preferences among evaluated options.
- Do not change the Jev API contract, add dependencies, or expose `JEV_API_KEY` to browser code.
- Preserve `agents-cli@0.1.0` and `node_modules/agents-cli/catalog/agents/global-orchestrator.md` when installing dependencies in a new worktree.

## Review Focus

- A valid Jev response received while manually paused stays unapplied until resume, then completes both landing stages before locking.
- Pausing between landing stages clears the active timer; no callback advances the stage or locks the board while paused.
- Restart or match finish during a landing invalidates its timer callback and prevents stale board changes.
- A top-out landing does not increment Jev's survived-piece count until the second stage applies the lock.
- A reduced-motion preference skips both delays and applies the exact selected board once.

---

### Task 1: Stage and animate Jev's selected landing

**Files:**
- Modify: `src/game/jev-decision-session.ts`
- Test: `src/game/jev-decision-session.test.ts`
- Modify: `src/client/match-app.tsx`
- Create: `src/client/match-app-landing.test.tsx`
- Modify: `src/client/board-view.tsx`
- Modify: `app/globals.css`

Before Step 1, if `node_modules` is absent in the implementation worktree, run `npm ci`; confirm `agents-cli@0.1.0` and `node_modules/agents-cli/catalog/agents/global-orchestrator.md` remain available. Copy and compare `.env` and `.env.local` from the project root without printing their contents.

**Interfaces:**
- `completeJevDecision(state, token, value, liveSession)` validates the API response and returns a `JevDecisionSession` with `status: 'animating'` without locking the board when the match is playing; a response received during manual pause remains `ready-to-apply`.
- `resumeCompletedJevDecision(state)` resumes the match and changes a held valid result to `animating` without locking it.
- `applyJevLanding(state)` accepts only an `animating` result in a playing match, locks `selectedCandidate.board` through `lockMatchSessionPlayer`, and returns `status: 'complete'`.
- `MatchApp` tracks `landingStage: 1 | 2 | null`; the stage timer lasts 300 ms and is keyed to the decision token and match ID.
- `BoardView` renders the active Jev piece's presentation pose while the settled board remains unchanged; the final stage uses `selectedCandidate.lockedPiece`.

- [ ] **Step 1: Write failing pure transition tests**

Add tests to `src/game/jev-decision-session.test.ts` proving that a valid response no longer locks immediately, and that only the landing completion action applies the selected board and increments survived pieces. Add pause/resume coverage for a response held while paused.

```ts
it('keeps Jev unchanged until the landing animation completes', () => {
  const flow = beginJevDecision(playing(), 'landing-1')!;
  const accepted = completeJevDecision(flow, flow.token, answer(flow));

  expect(accepted.status).toBe('animating');
  expect(accepted.session.core.jev.sequenceIndex).toBe(flow.snapshot.sequenceIndex);

  const landed = applyJevLanding(accepted);
  expect(landed.status).toBe('complete');
  expect(landed.session.core.jev.sequenceIndex).toBe(flow.snapshot.sequenceIndex + 1);
});
```

- [ ] **Step 2: Run the focused session test and observe the expected failure**

Run: `npm test -- src/game/jev-decision-session.test.ts`

Expected: FAIL because successful responses currently lock immediately and `applyJevLanding` does not exist.

- [ ] **Step 3: Add the explicit animating transition**

Extend the status union and keep the accepted result/session in the decision object until the client finishes the landing. Add the guarded completion function:

```ts
export function applyJevLanding(state: JevDecisionSession): JevDecisionSession {
  if (state.status !== 'animating' || state.result === null || state.session.phase !== 'playing') return state;
  return {
    ...state,
    session: lockMatchSessionPlayer(state.session, 'jev', state.result.selectedCandidate.board,
      state.result.selectedCandidate.topOut),
    status: 'complete',
  };
}
```

Ensure stale tokens and finished matches still cannot apply a result. Update resume handling so an accepted result held during pause becomes animating after resume.

- [ ] **Step 4: Run focused session tests and verify pause and stale-response cases**

Run: `npm test -- src/game/jev-decision-session.test.ts`

Expected: PASS, including existing retry, pause, stale-response, and top-out cases.

- [ ] **Step 5: Add UI tests for both stages, pause, reduced motion, and interruption**

Create `src/client/match-app-landing.test.tsx` with a deferred mocked Jev response. The local `mockJevDecisionRequest` helper returns the first submitted candidate with valid probabilities, following `src/client/match-app-keyboard.test.tsx`. Assert that the board remains unchanged before stage two, stage one and stage two render distinct poses, the lock occurs after the second 300 ms interval, and the human board continues to accept input. Add cases for manual pause/resume, `prefers-reduced-motion`, and restarting before a timer resolves. Restore real timers and unstub globals in `afterEach`.

```tsx
it('does not lock Jev until the second 300 ms landing stage finishes', async () => {
  const fetcher = mockJevDecisionRequest();
  vi.useFakeTimers();
  render(<MatchApp />);
  fireEvent.click(screen.getByRole('button', { name: /start match/i }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });

  const jevBoard = screen.getByRole('img', { name: /Jev Tetris board/i });
  expect(jevBoard.getAttribute('data-landing-stage')).toBe('1');
  await act(async () => { await vi.advanceTimersByTimeAsync(299); });
  expect(jevBoard.getAttribute('data-landing-stage')).toBe('1');
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(jevBoard.getAttribute('data-landing-stage')).toBe('2');
  expect(fetcher).toHaveBeenCalledOnce();
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(jevBoard.getAttribute('data-landing-stage')).toBeNull();
  expect(screen.getByText(/HUMAN 01 · JEV 02/)).not.toBeNull();
});
```

- [ ] **Step 6: Implement the staged board presentation in MatchApp and BoardView**

When a successful response enters `animating`, set stage one and render a midpoint pose; after 300 ms set stage two and render the selected pose; after another 300 ms call `applyJevLanding` once, clear the animation, and allow the existing Jev cadence effect to run. Clean up timers when the phase, stage, decision token, or match ID changes. On reduced motion, bypass both timers and call `applyJevLanding` immediately. Keep the existing latest decision facts visible during the animation.

- [ ] **Step 7: Run animation tests, focused existing tests, and typecheck**

Run: `npm test -- src/game/jev-decision-session.test.ts src/client/match-app-landing.test.tsx src/client/match-app-keyboard.test.tsx`

Expected: PASS; no duplicate lock on timer cleanup, pause, restart, or finish.

Run: `npm run typecheck`

Expected: PASS with the new status and board presentation types handled exhaustively.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/game/jev-decision-session.ts src/game/jev-decision-session.test.ts src/client/match-app.tsx src/client/match-app-landing.test.tsx src/client/board-view.tsx app/globals.css openspec/changes/jev-landing-animation-and-decision-history/tasks.md
git commit -m "feat: show Jev landing in two stages"
```

Mark `1.1` complete in `tasks.md` before committing. Open a PR for Task 1 against `main`. Do not start Task 2 until that PR is merged; create Task 2's worktree from the newly updated `origin/main`.

### Task 2: Retain and browse recent Jev decisions

**Files:**
- Create: `src/client/jev-decision-history.ts`
- Test: `src/client/jev-decision-history.test.ts`
- Modify: `src/client/match-app.tsx`
- Modify: `src/client/jev-decision-panel.tsx`
- Test: `src/client/jev-decision-panel.test.tsx`
- Test: `src/client/match-app-landing.test.tsx`
- Modify: `README.md`

**Interfaces:**
- `CompletedDecisionFacts` moves to `src/client/jev-decision-history.ts` as the immutable pair of a `JevDecisionSnapshot` and `JevDecisionResult`; `jev-decision-panel.tsx` re-exports the type for existing consumers.
- `retainRecentJevDecisions(history, newest)` returns `[newest, ...history].slice(0, 5)` without mutating either input.
- `JevDecisionPanel` receives `decisions: CompletedDecisionFacts[]`; it renders the newest entry's facts and alternatives expanded, with previous entries in native expandable disclosures.
- `MatchApp` stores `decisionHistory` per match, records each successful decision once, passes history during every decision state, and initializes an empty list for a new match.

- [ ] **Step 1: Write failing ring-buffer and disclosure tests**

Add helper tests for newest-first order, the five-entry limit, and immutability. Update `src/client/jev-decision-panel.test.tsx` to assert the newest record is expanded by default and an older record reveals its returned selection, probability, alternatives, and outcomes when expanded.

```ts
it('keeps only the five newest decisions without mutating the existing list', () => {
  const history = [4, 3, 2, 1, 0].map(makeDecisionFacts);
  const result = retainRecentJevDecisions(history, makeDecisionFacts(5));
  expect(result.map(({ snapshot }) => snapshot.sequenceIndex)).toEqual([5, 4, 3, 2, 1]);
  expect(history.map(({ snapshot }) => snapshot.sequenceIndex)).toEqual([4, 3, 2, 1, 0]);
});
```

Use a complete fixture builder `makeDecisionFacts(sequenceIndex: number): CompletedDecisionFacts`; set the snapshot's sequence index from the argument and use valid board/candidate/result fields matching `jev-decision-panel.test.tsx`.

- [ ] **Step 2: Run focused history tests and observe the expected failure**

Run: `npm test -- src/client/jev-decision-history.test.ts src/client/jev-decision-panel.test.tsx`

Expected: FAIL because the bounded history helper and expandable decision records do not exist.

- [ ] **Step 3: Implement immutable bounded history and panel disclosures**

Add `retainRecentJevDecisions`, change the panel prop from a single optional fact to a list, render the latest record as the current decision, and give older records native `<details>`/`<summary>` controls with the existing placement facts reused for their expanded content.

```ts
export function retainRecentJevDecisions(
  history: readonly CompletedDecisionFacts[],
  newest: CompletedDecisionFacts,
): CompletedDecisionFacts[] {
  return [newest, ...history].slice(0, 5);
}
```

- [ ] **Step 4: Wire history through match lifecycle and document the demo behavior**

Replace `lastDecision` with `decisionHistory` in `ViewState`. Record the accepted decision once when its landing is accepted, keep the list when the next request is pending or retry-required, and clear it in the ready/new-match initialization path. Update `README.md` to document the two-stage Jev landing, the five-entry in-match decision history, and its reset behavior.

- [ ] **Step 5: Add match-flow tests for persistence and reset**

Update `src/client/match-app-landing.test.tsx` to resolve more than five mocked decisions and assert the panel retains only the latest five newest-first; assert the panel remains visible while the next request is pending and that New match starts with empty history. Verify retries do not duplicate a record.

- [ ] **Step 6: Run focused panel/match tests, typecheck, lint, and full unit suite**

Run: `npm test -- src/client/jev-decision-history.test.ts src/client/jev-decision-panel.test.tsx src/client/match-app-landing.test.tsx`

Expected: PASS, including while Jev is pending, retry-required, and after a new match starts.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run lint`

Expected: PASS with accessible disclosure labels and no stale view-state fields.

Run: `npm test`

Expected: PASS for the complete unit suite.

Run: `npm run build`

Expected: PASS for the production Next.js build.

- [ ] **Step 7: Commit Task 2 and validate the complete change**

```bash
git add src/client/jev-decision-history.ts src/client/jev-decision-history.test.ts src/client/match-app.tsx src/client/jev-decision-panel.tsx src/client/jev-decision-panel.test.tsx src/client/match-app-landing.test.tsx README.md openspec/changes/jev-landing-animation-and-decision-history/tasks.md
git commit -m "feat: keep recent Jev decisions visible"
```

Mark `2.1` complete in `tasks.md` before committing. Open a separate PR for Task 2 from the latest `main`. Before marking the OpenSpec change complete, run `npx openspec validate jev-landing-animation-and-decision-history --strict` and confirm both task checkboxes are complete in the corresponding task PRs.
