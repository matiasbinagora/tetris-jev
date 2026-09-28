## 1. Jev landing animation

- [x] 1.1 Separate accepted Jev choices from board locking; animate two 300 ms stages, pause/resume safely, respect reduced motion, and verify the landing lifecycle with focused tests.

## 2. Recent decision history

- [ ] 2.1 Retain the five newest successful Jev decisions through pending/retry states, expose older entries in expandable panel rows, clear history on new match, document the behavior, and verify the complete unit/type/lint checks.
- [ ] 2.2 Add a panel-only Freeze/Resume live control that captures the displayed history and selected entry while gameplay, API requests, and live history continue; verify frozen, resume, and new-match reset behavior.

## 3. Per-player line score

- [ ] 3.1 Award each player one point per line cleared on their own board, expose each score beside its board, reset scores on new match, preserve survival-based winner determination, and verify gravity, human hard drop, Jev landing, top-out, and restart score transitions.
