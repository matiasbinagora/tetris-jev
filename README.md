# Tetris vs Jev

A desktop-first browser match where a human plays Tetris against Jev. Both players are intended to receive the same pieces on the same gravity clock while keeping independent boards. The product and architecture contract lives in the OpenSpec change `play-tetris-against-jev`.

## Current status

The Next.js App Router foundation, deterministic Tetris engine, shared-match core, and pure match-session lifecycle are implemented. Two independent boards receive the same seeded seven-bag sequence and advance through shared 700 ms gravity ticks and a lock barrier. The home page is still a placeholder; browser controls and timer scheduling, the Jev decision route, and the playable interface remain pending.

OpenSpec implementation progress is **7 of 19 tasks complete** (tasks 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, and 3.2). See [`openspec/changes/play-tetris-against-jev/tasks.md`](openspec/changes/play-tetris-against-jev/tasks.md) for the task list and acceptance checks.

## Local development

### Requirements

- Node.js 20.9 or newer
- npm

### Install and run

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest unit suites for the Tetris engine, shared-match core, and lifecycle |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run build` | Build the production application |
| `npm start` | Serve the production build |

## Agent tooling

The project pins the existing `agents-cli@0.1.0` release as a development-only dependency from the GitHub `v0.1.0` tag. It is not installed from the public npm registry, which contains a package with the same name but a different release. The lockfile records the HTTPS archive and its integrity hash so clean installs use the approved source and do not require SSH access.

The installed package provides `node_modules/agents-cli/catalog/agents/global-orchestrator.md`. To verify the version and path after `npm ci`:

```sh
node -p "require('./node_modules/agents-cli/package.json').version"
test -f node_modules/agents-cli/catalog/agents/global-orchestrator.md && echo "global-orchestrator is available"
```

The Vercel skills installed for this project are stored under `.agents/skills/` and recorded in `skills-lock.json`:

- `vercel-react-best-practices` — React and Next.js performance guidance.
- `vercel-composition-patterns` — reusable React component composition guidance.
- `web-design-guidelines` — interface and accessibility review guidance.
- `deploy-to-vercel` — Vercel Preview and deployment workflow.

## Approved product behavior

These are the OpenSpec requirements; they describe the target behavior and are not all implemented yet:

- A deterministic 10 by 20 Tetris board with two hidden spawn rows and standard tetromino rotation rules.
- One seeded seven-bag piece sequence and one 700 ms gravity clock shared by two independent boards. The next round starts after both players lock the current piece.
- A desktop layout allocating 50% of the viewport area to the human board, 35% to Jev's board, and 15% to Jev's decision panel.
- Jev chooses only from server-validated legal placements. If a request fails or times out, the match pauses and retries with the same decision state; there is no substitute player.
- The match stays in the browser. The MVP has no accounts, database, persistence, multiplayer, or garbage attacks.

## Tetris engine

The pure rules module is [`src/game/engine.ts`](src/game/engine.ts). It stores each board as 22 rows of 10 cells: rows 0 and 1 are hidden spawn rows, and rows 2 through 21 are visible. Empty cells are `null`; occupied cells store the tetromino type.

The seven pieces each have four explicit orientations. J, L, S, T, and Z use 3 by 3 orientation matrices; I and O use 4 by 4 matrices. Every piece spawns in orientation `0` at origin `(3, 0)`. Coordinates increase to the right and down. Movement and rotation helpers return a new piece when the move is legal and leave the input piece and board unchanged when it is blocked.

Clockwise and counterclockwise turns test the following Super Rotation System offsets in order. State names are `0` (spawn), `R` (right), `2` (reverse), and `L` (left). Each pair is `(x, y)` in board coordinates, with positive `y` pointing down. `O` rotates in place with only `(0, 0)`.

### J, L, S, T, Z kicks

| Transition | Ordered offsets `(x, y)` |
| --- | --- |
| `0 → R` | `(0,0), (-1,0), (-1,-1), (0,2), (-1,2)` |
| `R → 0` | `(0,0), (1,0), (1,1), (0,-2), (1,-2)` |
| `R → 2` | `(0,0), (1,0), (1,1), (0,-2), (1,-2)` |
| `2 → R` | `(0,0), (-1,0), (-1,-1), (0,2), (-1,2)` |
| `2 → L` | `(0,0), (1,0), (1,-1), (0,2), (1,2)` |
| `L → 2` | `(0,0), (-1,0), (-1,1), (0,-2), (-1,-2)` |
| `L → 0` | `(0,0), (-1,0), (-1,1), (0,-2), (-1,-2)` |
| `0 → L` | `(0,0), (1,0), (1,-1), (0,2), (1,2)` |

### I-piece kicks

| Transition | Ordered offsets `(x, y)` |
| --- | --- |
| `0 → R` | `(0,0), (-2,0), (1,0), (-2,1), (1,-2)` |
| `R → 0` | `(0,0), (2,0), (-1,0), (2,-1), (-1,2)` |
| `R → 2` | `(0,0), (-1,0), (2,0), (-1,-2), (2,1)` |
| `2 → R` | `(0,0), (1,0), (-2,0), (1,2), (-2,-1)` |
| `2 → L` | `(0,0), (2,0), (-1,0), (2,-1), (-1,2)` |
| `L → 2` | `(0,0), (-2,0), (1,0), (-2,1), (1,-2)` |
| `L → 0` | `(0,0), (1,0), (-2,0), (1,2), (-2,-1)` |
| `0 → L` | `(0,0), (-1,0), (2,0), (-1,-2), (2,1)` |

Gravity ticks move an active piece down by one cell or lock it when it cannot descend. Soft drop moves one legal cell without locking; hard drop finds the lowest legal position and locks immediately. Locking writes the piece to a copied board, removes all completed rows together, and returns the number of lines cleared. A locked piece touching either hidden row tops out; spawning also tops out when any spawn cell is occupied.

Board metrics are calculated from the 20 visible rows. Column height counts visible cells from the highest occupied cell through the floor; aggregate height is the sum of column heights; holes are empty visible cells below an occupied cell in their column; bumpiness is the sum of adjacent column-height differences. The hidden spawn rows do not contribute to these metrics.

Jev placement candidates are enumerated with a breadth-first search from its active piece. The search expands legal left, right, down, clockwise-rotation, and counterclockwise-rotation moves in that order, using the same collision and SRS rules as gameplay. A candidate is a reachable pose that cannot descend further; identical occupied-cell footprints appear once and receive stable IDs. Each candidate includes the simulated locked board, cleared-line count, top-out result, and resulting board metrics. The source board is never mutated.

The engine tests cover all 28 piece/orientation combinations, deterministic spawn positions, wall and floor boundaries, occupied-cell collisions, both kick tables, gravity, soft/hard drops, normal locking, simultaneous multi-line clearing, metrics, spawn/lock top-out, and candidate legality and simulation.

## Shared match core

The pure match state and transitions live in [`src/game/match.ts`](src/game/match.ts). `createMatchCore(seed)` normalizes a finite integer seed, shuffles a seven-bag with a serializable xorshift32 generator, and spawns the same current piece on separate human and Jev boards. The complete match core can be JSON-serialized and restored without losing future piece draws.

`applySharedGravityTick(state)` models one shared 700 ms gravity step: each active board moves or locks independently, while a player who has already locked keeps the same player state as the other board continues. `advanceMatchRound(state)` preserves the current state until both players lock, then spawns one shared next piece on both boards and rolls over to a new seven-bag when needed. A spawn failure tops out only the affected player. These core functions are pure transitions. Task 3.2 adds the lifecycle wrapper documented below; browser timer scheduling remains a later client task.

## Match lifecycle

The serializable match-session state and transitions live in [`src/game/match-session.ts`](src/game/match-session.ts). A session begins in `ready`; start moves it to `playing`. Pause and resume change only the phase, preserving the core, boards, active pieces, round, and seeded sequence. Restart receives a fresh seed from its caller, creates a clean core, clears the result, and begins playing immediately.

`tickMatchSession(state)` is a pure transition with no browser timer. It ignores ticks while the session is ready, paused, or finished. While playing, it applies one shared gravity tick, ends with a win when one player tops out or a draw when both top out in the same gravity event, and advances as soon as both players lock. It also resolves single or simultaneous top-outs caused by spawning the next shared piece. The client layer will schedule `MATCH_GRAVITY_INTERVAL_MS` ticks and connect these transitions to browser controls in a later task.

## Jev API and Vercel

The Jev route and API-key configuration have not been implemented yet. When they are, `JEV_API_KEY` must remain server-only, with no `NEXT_PUBLIC_` prefix, and the setup instructions will be added here. The deployment plan requires verifying Vercel Preview with its environment configuration before Production.

## Development workflow

OpenSpec is the source of truth for scope and task acceptance. Each numbered task is developed in its own feature branch and pull request. Start each new worktree from the latest `origin/main`; do not combine multiple numbered tasks in one PR.
