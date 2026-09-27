# Keyboard controls implementation plan

> **For agentic workers:** Execute inline using the previously selected Native method. Keep this change within OpenSpec task 5.2 and one PR.

**Goal:** Let the focused human game board receive the documented Tetris controls without scrolling the page or bypassing a Jev pause.

**Architecture:** Keep keyboard mapping in a small tested client helper and board mutations in pure game-session transitions. Bind the handler only to the human board region, which is keyboard-focusable; controls outside that focused region retain normal browser behavior. Show the mappings beside the game board.

**Tech Stack:** TypeScript, Next.js App Router Client Component, Vitest, CSS.

**Spec:** `openspec/changes/play-tetris-against-jev/specs/split-screen-interface/spec.md`; related lifecycle and engine requirements in `specs/synchronized-match/spec.md` and `specs/tetris-engine/spec.md`.

## Global Constraints

- Left/Right arrows move, Down soft-drops, Up or X rotates clockwise, Z rotates counterclockwise, Space hard-drops, and P toggles manual pause/resume.
- Tetris rules remain in the pure engine; human and Jev boards stay independent.
- Jev pending/retry pauses remain locked; keyboard P cannot resume them.
- Prevent browser scrolling only for game keys while the human board owns focus.
- Keep `JEV_API_KEY` server-only.

## Review Focus

- Movement and rotation while the human is not active leave both board states unchanged.
- A browser shortcut with Ctrl/Meta/Alt is not consumed by the game handler.
- Repeated Space/P events cannot hard-drop multiple successive pieces or toggle pause repeatedly.
- Focus on a match action button does not steal its native keyboard activation.
- Jev pending/retry cannot resume from the keyboard.

## Task 1: Pure human transitions and focused keyboard mapping

**Files:**
- Create `src/game/human-controls.ts` and `src/game/human-controls.test.ts`.
- Create `src/client/game-keyboard.ts` and `src/client/game-keyboard.test.ts`.
- Modify `src/client/match-app.tsx`, `app/globals.css`, `README.md`, and the OpenSpec tasks file.

**Interfaces:**
- `HumanGameAction` is one of `left`, `right`, `soft-drop`, `rotate-clockwise`, `rotate-counterclockwise`, and `hard-drop`.
- `applyHumanGameAction(session: MatchSessionState, action: HumanGameAction): MatchSessionState` applies only the human engine transition and settles the shared round after a lock.
- `handleFocusedGameKey(event, state, onAction, onPauseToggle)` maps keyboard events only for the focused board. `state` includes `phase`, `hasJevDecision`, `decisionSetupFailed`, `humanHasActivePiece`, and `humanLockedThisRound`.

- [x] Write tests for legal horizontal/rotation/soft-drop transitions, blocked movement, hard-drop locking and round settlement, preservation of Jev's independent board, and rejecting actions outside active human play.
- [x] Run `npm test -- src/game/human-controls.test.ts`; expect failures because the module does not exist.
- [x] Implement pure human session transitions using `tryMovePiece`, `softDropPiece`, `tryRotatePiece`, `hardDropPiece`, and `settleMatchSession`.
- [x] Run the focused game test; expect all transition cases to pass.
- [x] Write keyboard tests for every mapping, scroll prevention, paused input gating, Jev pending/retry lockout, modifier/composition pass-through, and repeated Space/P suppression.
- [x] Implement the pure keyboard event dispatcher; run its focused tests and expect all mappings and guards to pass.
- [x] Add a focusable human-board region with an `onKeyDown` binding; route actions through functional `setState` and recheck current state before applying. Keep the existing action buttons outside the board focus target.
- [x] Render on-screen key help, add a visible `:focus-visible` ring, update the README and mark task 5.2 complete.
- [x] Manually verify focus behavior in a desktop browser.
- [x] Run the full test suite, lint, typecheck, production build, strict OpenSpec validation, and `git diff --check`.
- [ ] Commit task 5.2, request one independent final review, push the branch, and open its PR against `main`.
