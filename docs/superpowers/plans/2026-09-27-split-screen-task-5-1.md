# Split-screen match view implementation plan

> **For agentic workers:** Implement this plan in the current session. Keep one PR for OpenSpec task 5.1.

**Goal:** Show both independent boards and every shared match status in the approved desktop layout.

**Architecture:** A small client host owns `MatchSessionState` and the existing `JevDecisionSession`. Pure game modules remain the source of board and piece data. Presentational board and status components receive these states; the server retains the Jev credential.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Grid, Vitest for the pure next-piece helper.

**Spec:** `openspec/changes/play-tetris-against-jev/specs/split-screen-interface/spec.md`; `openspec/changes/play-tetris-against-jev/design.md`.

## Global constraints

- Desktop regions: human 50%, Jev board 35%, Jev decision panel 15%.
- Board: 10 columns, 20 visible rows, two hidden spawn rows.
- Use the shared seeded seven-bag and one 700 ms gravity clock; preserve the round barrier.
- Pause both boards during Jev decisions and failures. Retry uses the captured snapshot.
- `JEV_API_KEY` stays in the server route; the client never reads it.
- Keyboard controls and probability details are separate tasks 5.2 and 5.3.

## Review focus

- A final item in a seven-bag still shows the correct next piece from the future bag.
- Pending and retry states never allow gravity or a generic resume.
- Late Jev responses after restart do not affect the new match.
- Hidden spawn cells do not render as visible board cells.
- At a desktop viewport, both boards stay visible inside the exact 50/35/15 grid regions.

## Task 1: Next-piece preview

**Files:** `src/game/match.ts`, `src/game/match.test.ts`.

- [x] Add a test proving `peekNextPiece(state)` returns `bag[bagIndex]` and remains deterministic when the bag is exhausted.
- [x] Implement `peekNextPiece(state: MatchCoreState): PieceType` using the existing pure shuffle with `state.randomState`; do not mutate state.
- [x] Run the match test file.

## Task 2: Match host and view

**Files:** `app/page.tsx`, `src/client/match-app.tsx`, `src/client/board-view.tsx`, `app/globals.css`.

- [x] Render 20 visible rows for both players using the settled board and active piece from the pure engine.
- [x] Show player names, current and upcoming piece, round, and ready/playing/paused/pending/retry/finished statuses.
- [x] Connect start, pause, resume, retry, and restart buttons to the existing pure transitions; use one browser gravity interval only while playing.
- [x] Start a Jev decision when it has an active piece, fetch once per attempt, and guard late responses with the existing token and an abort controller.
- [x] Use a two-column CSS Grid with a 70/30 right-column row split at desktop size, with responsive stacking below desktop.

## Task 3: Documentation and validation

**Files:** `README.md`, `openspec/changes/play-tetris-against-jev/tasks.md`.

- [x] Record the new view and its scope in the README; mark 5.1 complete only after a desktop viewport check.
- [x] Verify lint, typecheck, build, relevant tests, OpenSpec validation, and a desktop browser viewport showing both boards and the intended region sizes.
- [x] Commit and open a PR against the latest `main`.
