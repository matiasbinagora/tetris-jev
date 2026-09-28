# Player Line Score and Frozen Jev Decisions

## Context and intent

The match is used in live demonstrations. The presenter wants an immediately readable reward for clearing lines and needs to hold a Jev decision table on screen long enough to explain it. Holding that view must not slow Jev or the human player's independent game.

The score is informational: each player receives one point per line cleared on their own board. The existing match winner remains based on survived pieces. The decision view can freeze a snapshot for presentation while the underlying match and bounded decision history continue to update.

## Approaches considered

### Score derived from the board and winner calculation

This would keep extra state out of each player but requires reconstructing prior line clears from board history and risks changing the survival winner rule. It is rejected because score is a cumulative match fact and should not be inferred from current board shape.

### Independent score in each player state, incremented from engine lock results (recommended)

Each deterministic lock already returns the exact number of lines cleared. Pass that count into the owning player's pure match transition and add it to that player's serializable score. This handles human hard drop, gravity locks, and Jev-selected landings from the same source of truth, while keeping both scores isolated.

### Freeze only the selected row, allow the rest of the panel to update

This could preserve one choice while new decisions replace surrounding history and counters. It is rejected because moving content would still make the table hard to present consistently.

### Freeze a full panel snapshot while live history continues (recommended)

Capture the exact currently displayed history and expanded selection in client presentation state. New decisions keep flowing into the live five-entry history. Resume discards the snapshot and shows the latest live decision. This gives the presenter a stable view without coupling the control to game pause, network requests, or Jev progression.

## Design

### Player score

Add `score: number` to each player state and initialize it to zero for every new match. Every lock path supplies the actual `linesCleared` value returned by the engine; the score increases by that value only for the player whose board was locked. A lock that clears lines and also tops out still earns its points because the rows were cleared. A spawn top-out, movement, or a lock with zero cleared lines adds no points. The UI shows each player's score alongside that player's board. Score does not affect candidate evaluation, piece sequence, cadence, top-out rules, or the winner-by-survival outcome.

### Frozen decision presentation

Keep one live decision-history list, bounded to the five most recent successful decisions, and add a nullable frozen presentation snapshot. Show Freeze when at least one successful decision exists. Freeze copies the currently visible list and expanded entry. While frozen, successful decisions continue to append to live history, but the rendered panel uses the snapshot and visibly indicates that it is frozen. Resume live clears the snapshot and renders the current live list with its newest entry selected. New match clears both history and any frozen snapshot. The Freeze/Resume live button affects only the decision panel; it does not alter match phase, Jev timers, requests, retries, or record creation.

## Data flow and boundaries

- The engine remains the source of truth for line-clear counts.
- `MatchCoreState` owns each player's cumulative score through the existing pure match transitions.
- `MatchApp` owns live decision history and the optional frozen display snapshot.
- The decision panel renders whichever immutable list is selected by presentation state and owns no match transitions.
- The existing server endpoint and Jev response schema remain unchanged.

## Validation

- Pure transition tests cover scoring from human hard drop, gravity lock, Jev landing, independent boards, top-out locks, and new-match reset.
- UI tests cover score labels and frozen history while new records arrive, Resume live, and match restart while frozen.
- OpenSpec validation, typecheck, focused unit/UI tests, lint, and production build are required before the implementation PRs are complete.

## Scope

This design updates the in-progress Jev landing/history change. Implementation remains split into its ordered, independently reviewable tasks: landing animation, bounded decision history, freezing the panel, and line scoring. Each implementation task is delivered in its own PR against the latest `main`.
