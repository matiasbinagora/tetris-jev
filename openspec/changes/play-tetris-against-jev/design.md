# Design

## Context

The Next.js Tetris demo is deployed and already has a deterministic engine, seeded seven-bag sequence, two boards, a TypeSafe Jev route, and a decision panel. The first version holds both players at a shared round barrier, pauses the human for every Jev request, requires focus on the human board for keyboard input, and gives Jev placement descriptions containing only piece coordinates and rotation. The approved gameplay revision makes Jev's Tetris decisions more useful and allows both players to advance independently while keeping the comparison fair.

## Goals / Non-Goals

**Goals:**

- Make line clearing and long-term board survival visible to Jev when it chooses a placement.
- Keep the final applied Jev choice and its returned probabilities genuinely from the TypeSafe API.
- Give both boards the same seeded piece at each sequence position without making the faster player wait.
- Allow the human to play while Jev is pending or retry-required and accept game keys without a board click.
- Preserve the desktop 50% human / 35% Jev board / 15% decision-panel layout and server-only key handling.
- Let the user temporarily enlarge Jev's decision panel by resizing the vertical split in the right column.

**Non-Goals:**

- A perfect Tetris bot, a local fallback move, probability sampling, invented Jev reasoning, accounts, persistence, multiplayer, or garbage attacks.
- Treating Jev's returned choice probability as the probability of clearing lines or winning.
- Changing the seven tetrominoes, SRS rules, board dimensions, or line-clear mechanics.

## Decisions

### Pure rules and one indexed sequence

Continue using the pure TypeScript engine for collision, movement, SRS rotations, reachable landing enumeration, locking, line clears, top-out, and metrics. A match seed defines one infinite seven-bag sequence. Add a pure way to derive a piece by zero-based sequence index from that seed, or an equivalent serializable sequence cache. Bound route sequence indexes below 10,000 so validation cannot be forced to replay an unbounded number of bag shuffles. Each player keeps its own sequence index, active piece, settled board, survived-piece count, and top-out flag. Both players receive the same type at the same index; neither waits for the other to lock. The human receives one 700 ms gravity tick on its own timer. Jev locks its API-selected landing directly and begins the next decision after a minimum 350 ms visible cadence, with at most one request in flight. Manual pause stops both progressions.

A piece counts as survived only when its lock does not top out. A failed spawn does not increment the count. When one player tops out, compare survived counts: if the other has already survived more, finish immediately; otherwise let that player continue until it survives one more than the topped-out count or tops out. If both top out with equal survived counts, draw. This compares progress through the same sequence rather than API speed. A finished match ignores all later ticks and responses.

### Deterministic shortlist, then Jev decides

The existing engine enumerates every reachable landing footprint and simulates its resulting board. For each landing, calculate immediate lines cleared, resulting holes, aggregate height, bumpiness, and top-out. Use the known next piece to simulate the best legal follow-up landing one step ahead. Define `quality(outcome) = 12 * linesCleared - 8 * holes - 0.5 * aggregateHeight - 0.4 * bumpiness`. Rank each current candidate by its immediate quality plus half the best next-piece quality. A top-out candidate ranks below every surviving move; if the next piece cannot spawn, its follow-up quality is `-1000`. This score will be checked against fixed board scenarios before integration and can be adjusted in the strategy task with a corresponding design update.

First keep the highest-scoring surviving candidate for each distinct immediate line-clear count when capacity allows. Fill the remaining slots by score, breaking ties by stable candidate ID, to a maximum of 12. If all placements top out, apply the same ranking without the surviving-only filter. The score only filters and orders choices; it never applies a placement. The server reconstructs the full legal set and the shortlist from canonical board, seed, Jev sequence index, and piece. It rejects altered IDs, poses, or shortlist membership. Client-provided prose or scores are ignored.

Send one TypeSafe `choice` question per Jev piece. Its state contains a compact 20-row board representation with a legend and the current and next piece. Each criterion describes a shortlisted landing with its position, rotation, immediate lines, resulting holes/height/bumpiness, and best known-next-piece follow-up. Use short labels in the upstream criteria to keep the request small, then map the returned label and probabilities back to canonical candidate IDs. The route continues to enforce its eight-second deadline and keeps `JEV_API_KEY` server-only. A missing key, malformed response, or timeout never triggers a substitute move.

The UI displays the selected move, up to three alternatives, calculated outcomes, and the exact returned probabilities. It labels probabilities as preferences within the submitted shortlist. It does not claim they are win probabilities or explanations of Jev's reasoning. This one-call design follows the [Jev Tetris example](https://www.jevtypesafeai.com/games/jev-tetris), which also shortlists placements before a typed choice, while our scoring and server validation remain explicit and deterministic.

### Independent Jev request state and pauses

Keep Jev's decision state separate from the overall match phase. Beginning a decision captures an immutable seed, Jev sequence index, board, active piece, next piece, canonical shortlist, and serialized POST body. Each new decision has a unique ID and each retry increments an attempt number; stale responses cannot alter a newer match or decision. Pending or retry-required freezes Jev alone while the human gravity timer and controls continue. Retry sends the byte-identical request body. Manual pause stops both boards. An in-flight response may be retained during manual pause but is applied only after resume; restarting or finishing discards it. Only one Jev request may be in flight at a time.

### Keyboard and visible state

Handle game keys at the application/window level while the match is active so a board click is unnecessary. Ignore composing input, editable targets, native buttons and other interactive controls, and Ctrl/Meta/Alt shortcuts. Prevent scrolling only for keys handled as game controls. Move visible focus back to the human play area after Start and Resume. Preserve native button keyboard activation. `P` toggles manual pause; it does not dismiss a Jev error. Movement affects only the human board and remains available while Jev is pending or retry-required. Show each player's own current/next piece and survived-piece count, the winner comparison, and Jev's separate pending/retry status. Preserve the existing CSS Grid area allocation.

### Resizable Jev board and decision panel

Keep the human column fixed at half of the desktop viewport. Add a horizontal separator between Jev's board area and the decision panel in the right column. The default split stays 70% / 30%, preserving the approved 50% / 35% / 15% layout until the user changes it. Let the user drag the separator with mouse or touch and adjust it with Up/Down arrow keys while focused. Bound the Jev board between 50% and 80% of the right column, which gives the decision panel the remaining 50% to 20%. Expose the separator's orientation and current/minimum/maximum values to assistive technology. Keep the adjustment in component state only; a page reload restores the default. At the existing narrow-screen breakpoint, stack the regions and hide the resize separator.

### Test and deployment boundaries

Add pure tests for sequence equality across different player speeds, candidate ranking and line-clear retention, next-piece lookahead, top-out count resolution, manual pause and stale response handling. Add route tests that reject forged shortlists and verify safe credential handling. Update UI and Playwright coverage for input after Start/Resume, human movement during Jev pending/retry, independent Jev progression, and piece-count win/draw. Mock `/api/jev/decision` in automated browser flows. Verify the strategic payload with a few fixed board cases and one configured Preview decision before Production. Keep the full lint, unit, E2E, typecheck, build, and strict OpenSpec validation gate at the end of the change.

## Task and PR order

1. Strategy: deterministic shortlist, canonical route validation, useful Jev criteria, probability labels, and strategy scenarios.
2. Keyboard: application-level controls and focus after match buttons.
3. Independent progression: separate cursors and clocks, Jev-only pending/retry, manual pause, and survived-piece results.
4. Resizable Jev panel: an accessible 70/30 default divider with bounded manual resizing.
5. Final validation: run all repository checks and verify Preview before updating Production.

Each numbered task gets its own feature branch and PR from the latest merged `main`. This design and the revised OpenSpec contract are reviewed in a planning PR before implementation.

## Risks / Trade-offs

- The shortlist can exclude an unexpectedly good creative placement. Fixed strategy scenarios and line-clear diversity keep the filter reviewable; Jev still makes the final choice.
- A general decision model can still choose a weak move from the shortlist. The UI reports the actual choice and conditional probabilities without promising optimal play.
- Jev may consume decisions faster than a human can place pieces. Limit it to one request at a time and a short visible cadence; show both sequence positions.
- A finished match or restart can race with an old network response. Unique decision IDs, attempt tokens, and a final-state guard discard stale results.
- Preview and Production require separate server-side credentials. Keep the key out of client assets, responses, logs, and commits.

## References

- [Jev Tetris example](https://www.jevtypesafeai.com/games/jev-tetris)
- [TypeSafe System One endpoint](https://www.jevtypesafeai.com/jev/api)
- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
