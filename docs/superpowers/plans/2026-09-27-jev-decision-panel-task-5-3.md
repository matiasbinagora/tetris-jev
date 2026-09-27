# Jev decision panel implementation plan

> **For agentic workers:** Execute inline with the previously selected Native method. Complete only OpenSpec task 5.3 and open its own PR against `main`.

**Goal:** Show Jev's last successful placement, returned probabilities, canonical simulated outcomes, and only the metrics the API actually returned.

**Architecture:** Preserve the completed decision's frozen snapshot and parsed result in the browser-owned match view after the coordinator applies the move. Render a focused presentational panel that derives the top three alternatives from that snapshot and reads board metrics from canonical engine candidates; it must never estimate latency or invent Jev's reasoning.

**Tech Stack:** TypeScript, Next.js App Router Client Component, React, Vitest, Testing Library, JSDOM, CSS.

**Spec:** `openspec/changes/play-tetris-against-jev/specs/split-screen-interface/spec.md` and `specs/jev-decisions/spec.md`; architecture in `design.md`, task 5.3 in `tasks.md`.

## Global Constraints

- Show the selected placement and its returned probability plus up to three highest-probability alternatives.
- Show lines cleared, resulting aggregate height, holes, and bumpiness from each canonical candidate's engine simulation.
- Keep probabilities, usage, and other metadata as returned; display unavailable metrics as unavailable and never estimate them.
- Do not describe probabilities or computed outcomes as Jev's natural-language reasoning.
- Keep match state in the browser and preserve the shared round barrier and Jev pause/retry behavior.
- Preserve `agents-cli@0.1.0` and `node_modules/agents-cli/catalog/agents/global-orchestrator.md`; keep `.env.local` ignored and its value private.

## Review Focus

- The selected choice never appears a second time among alternatives; alternatives are ranked by returned probability and capped at three.
- Every displayed outcome comes from that candidate's canonical engine simulation, including when metrics differ across candidates.
- Missing latency and usage display as unavailable; no client-side timing estimate or inferred token count appears.
- Pending/retry state does not present the previous decision as the active response; a completed result remains available during the human turn and clears on a new match.
- UI copy states that outcomes are calculated and contains no invented explanation of Jev's reasoning.

## Task 1: Preserve and render completed Jev decision facts

**Files:**
- Create `src/client/jev-decision-panel.tsx` and `src/client/jev-decision-panel.test.tsx`.
- Modify `src/client/match-app.tsx`, `app/globals.css`, `README.md`, and `openspec/changes/play-tetris-against-jev/tasks.md`.
- Create `docs/superpowers/plans/2026-09-27-jev-decision-panel-task-5-3.md` and the ignored SDD work ledger.

**Interfaces:**
- `CompletedDecisionFacts` holds the successful `JevDecisionSnapshot` and parsed `JevDecisionResult` together.
- `JevDecisionPanel({ facts })` renders nothing when facts are absent; otherwise it renders the selected candidate first and up to three other candidates sorted by returned probability.
- `MatchApp` retains the most recent successful `{ snapshot, result }` after applying the Jev move, hides it while a decision is pending/retry-required, and resets it when a new match starts.

- [x] Write JSDOM tests for the selected placement and exact returned probability, alternative ordering/cap, canonical per-candidate outcomes, returned usage, unavailable missing latency/usage, and no fabricated reasoning.
- [x] Run `npm test -- src/client/jev-decision-panel.test.tsx`; confirm it fails because the panel module does not exist.
- [x] Implement the panel as a presentational component using `getPieceCells` only for a human-readable placement label and canonical `LandingCandidate` fields for effects.
- [x] Run the component tests and verify probabilities sort high-to-low, selected choice is excluded, and at most three alternatives appear.
- [x] Add a JSDOM `MatchApp` integration test with mocked Jev fetch that verifies successful facts survive the coordinator transition; verify missing metrics remain unavailable without making a live API call.
- [x] Add `lastDecision` to the browser view state, capture it from the successful coordinator snapshot/result, preserve it through human and gravity updates, hide stale facts during pending/retry, and reset it on new match.
- [x] Render selected/alternative rows and usage/latency labels in the existing decision panel; label effects as calculated outcomes, keep the 50/35/15 allocation, and add compact responsive styling.
- [x] Update README and mark task 5.3 complete.
- [x] Run the full test suite, lint, typecheck, production build, strict OpenSpec validation, and `git diff --check`; inspect the desktop interface locally and use only mocked Jev responses in UI tests.
- [x] Commit task 5.3, request one independent final review, push the branch, and open its PR against `main`.
