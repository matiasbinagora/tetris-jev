# Design

## Context

See [proposal.md](proposal.md) for motivation and scope. The folder has no existing application or capability specs; this change defines a new Next.js App Router application. The game is a desktop demo with two visible boards and a TypeSafe Jev decision route. The Jev key belongs to the server environment.

## Goals / Non-Goals

**Goals:**

- Keep the game rules deterministic and shared between rendering, placement simulation, and Jev request validation.
- Preserve the approved 50% human / 35% Jev board / 15% decision-panel screen-area layout.
- Make Jev's selected move and returned probabilities inspectable without inventing model explanations.
- Make local development and a later Vercel Preview/Production deployment straightforward.

**Non-Goals:**

- Accounts, saved matches, online multiplayer, garbage attacks, a database, or a persistent match service.
- Replacing Jev with a scripted, heuristic, or alternate-model player.
- Deploying the application before this folder is connected to a Git repository and Vercel project.

## Decisions

### Client-owned deterministic match, shared core rules

Keep match and board state in the browser for this single-user demo. Put board transitions, collision checks, rotations, candidate enumeration, line clears, and placement metrics in a pure TypeScript game module. The Jev route imports the same rules to validate the submitted candidate set; it does not own match state. This avoids a database or a stateful server and prevents the browser and server from silently applying different rules.

Use a 10 by 20 visible board with two hidden spawn rows. Use a seeded seven-bag sequence shared by both boards. Each round presents the same sequence item to both boards; a board that locks first waits until the other board locks before the next round begins. The shared clock advances both active boards on the same fixed 700 ms gravity interval. The waiting board has no active piece to move. This round barrier preserves identical pieces and ordering while keeping the two settled boards independent.

Use deterministic rotation with a documented Super Rotation System kick table for standard tetrominoes. Use one fixed gravity interval for the MVP rather than line-clear-based speed changes, since the players clear lines independently and a single shared clock is part of the match contract.

Calculate aggregate height, holes, and bumpiness over the 20 visible rows only; the two hidden spawn rows are excluded from these metrics. A piece that locks with any cell in a hidden row tops out, and a board also tops out when its next piece cannot occupy the spawn position.

Enumerate Jev's placements with a breadth-first search from its active piece. Expand collision-legal left, right, down, clockwise-rotation, and counterclockwise-rotation transitions in that fixed order, using the same movement and SRS helpers as gameplay. A reachable state is a landing when it cannot move down. Deduplicate identical occupied-cell footprints, assign a stable identifier to each footprint, and simulate every candidate with the pure lock-and-clear operation. Candidate order and identifiers must be repeatable for the same board and piece.

### Serializable shared-match core for task 3.1

Put the first match coordinator in `src/game/match.ts`, with unit tests in `src/game/match.test.ts`. It consumes the existing pure board engine and keeps match-level data in a JSON-serializable `MatchCoreState`: the normalized seed and PRNG state, current seven-bag and its next index, round number and shared piece type, and separate human and Jev records. Each player record contains its own board, active piece (or `null` after locking), whether it has locked for the current round, and a top-out flag from the engine's lock or spawn result. Transitions return new state values and do not mutate their inputs.

Generate bags by shuffling the canonical seven piece types with Fisher–Yates and a seeded xorshift32 generator. Normalize seeds to unsigned 32-bit integers and map zero to a fixed nonzero state so the generator cannot get stuck. Store the generator state and current bag in `MatchCoreState`, so the sequence is reproducible from a seed and can continue from a serialized snapshot. Do not use `Math.random` or other ambient state. Match creation selects the first piece and attempts to spawn that same type on both independent empty boards.

Export the shared gravity interval as `700` milliseconds. A pure match gravity transition applies the engine's one-cell gravity tick to each player who still has an active piece. If a tick locks a piece, keep the resulting board, clear that player's active piece, and mark the player locked for the round. Later ticks leave a locked player's record unchanged while the other player's active piece continues to fall. A pure next-round transition is guarded by both lock flags and by the absence of a top-out: before both players lock, or after either player tops out, it returns the current state unchanged. Otherwise it selects the next shared piece, attempts a spawn on both boards, increments the round, and resets the per-round lock flags. A failed spawn sets that board's top-out flag. The caller decides when to request this transition; task 3.2 owns automatic lifecycle orchestration, start/pause/resume/restart controls, and win/draw resolution based on the top-out flags.

Tests cover repeatable sequences for the same seed, one of each piece per bag, the shared piece on both boards in each round, board independence, immutable tick transitions, gravity movement on active boards, stability of an already locked board, and the next-round lock barrier. The match module contains no browser timer, UI state, persistence, or server-owned match state; the UI or lifecycle layer will schedule the exported 700 ms interval later.

### Match session lifecycle for task 3.2

Wrap `MatchCoreState` in a serializable `MatchSessionState` with `ready`, `playing`, `paused`, and `finished` phases plus a nullable win/draw result. Creating a session builds its seeded core in `ready`; start changes only the phase. Pause and resume change only the phase and preserve the core exactly. Restart accepts a fresh seed from its caller, resets the core and result, and starts the new match immediately in `playing`. Seed generation remains outside the pure game module.

The lifecycle tick is a pure transition called by the shared clock. It does nothing unless the session is `playing`; otherwise it applies one shared core tick, resolves a single top-out as a win for the surviving player or simultaneous top-outs as a draw, and advances to the next round as soon as both players lock. It resolves spawn top-outs in that same transition. A finished session ignores future ticks until restart. The browser timer remains with the client layer that schedules `MATCH_GRAVITY_INTERVAL_MS`; this module owns only deterministic session transitions and outcomes.

### Next.js App Router with a same-origin Jev route

Render the interactive match as a client-side game surface. Put the Jev proxy in a Next.js Route Handler on the Node.js runtime, under the same origin as the page. The browser sends the current Jev board, piece, and legal landing candidates; the route validates the data and calls Jev's decision endpoint once with a typed `choice` question. The API returns a chosen option and per-option probabilities; the route maps the result back to the candidate data and returns safe usage/latency metadata when available.

Use the server environment variable `JEV_API_KEY`, as shown in the Jev API documentation. Read it only inside the route handler, never in a client component or public `NEXT_PUBLIC_` variable. Keep the route stateless: a retry repeats the same snapshot and candidate IDs, and no match data is written to storage.

### Pause the shared match during Jev requests

When a Jev piece starts, pause the shared match while the decision request is pending. Give the upstream request an eight-second deadline. On a valid result, apply the selected placement to Jev's board and resume both boards. On timeout, network failure, invalid choice, or upstream error, leave the match paused and offer retry with the same snapshot. This gives the user the approved pause-and-retry behavior and prevents either player's clock or board from advancing during an unresolved decision.

### Render the approved layout with CSS Grid

Use equal-width viewport columns. The left column is the human area. Divide the right column into a 70% upper board region and a 30% lower decision region, which yields the approved 50/35/15 total viewport-area allocation. Scale the 10 by 20 board within its region while preserving cell proportions. Keep board labels, status, controls, and decision metrics visible in the surrounding region.

The decision panel shows the selected placement and probability, the highest-probability alternatives, and effects computed by simulating each option: lines cleared, aggregate height, holes, and column bumpiness. These values are outcomes calculated by the game, not Jev's prose or an explanation of its internal reasoning. Show latency and token/cost usage only when the API response supplies them.

### Vercel deployment after repository setup

Use Next.js's standard Vercel integration and keep the decision route on a server-capable runtime. Document `.env.local` for development and configure `JEV_API_KEY` separately for Vercel Preview and Production. Verify Preview with the configured secret before Production. Since this folder is not yet a Git repository, repository linking and deployment are follow-up operational steps, not part of this change's current documentation work.

## Risks / Trade-offs

- **Jev may choose legal but weak placements** → Treat that as expected behavior for a general decision model; expose the actual candidate set and returned probabilities, and do not claim the agent is a Tetris-optimized bot.
- **A Jev call delays the human match** → Pause both boards, show a clear pending state, and keep retry available after failure rather than allowing the game clock to diverge.
- **A public server route can consume API credits** → Validate request bounds, accept only legal candidate sets, make one Jev call per attempt, and expose returned usage/cost when available. Do not log or return the credential.
- **Vercel Preview or Production lacks the secret** → Fail with a safe setup message at decision time; document separate environment configuration for local, Preview, and Production.
- **The round barrier makes a faster player wait after locking** → Keep both boards visible and show the locked/waiting status; the barrier is the explicit fairness trade-off for receiving the same piece at each round.

## References

- [Jev API documentation](https://jevtypesafeai.com/docs)
- [Jev Tetris example](https://jevtypesafeai.com/games/jev-tetris)
- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
