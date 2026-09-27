# Tetris vs Jev

A desktop-first browser match where a human plays Tetris against Jev. Both players are intended to receive the same pieces on the same gravity clock while keeping independent boards. The product and architecture contract lives in the OpenSpec change `play-tetris-against-jev`.

## Current status

The Next.js App Router foundation, deterministic Tetris engine, shared-match core, pure match-session lifecycle, server-side Jev decision route, decision deadline/retry coordinator, split-screen match view, focused keyboard controls, Jev decision facts panel, Playwright browser-flow coverage, and Vercel environment setup documentation are implemented. The browser shows both boards, starts the shared 700 ms clock, pauses during Jev decisions, accepts keyboard input after the human board receives focus, and retains the last completed Jev selection and calculated outcomes during the human turn. E2E tests cover start, decision success/retry, a human round, pause/resume, restart, and a terminal result with Jev mocked.

OpenSpec implementation progress is **16 of 19 tasks complete** (tasks 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, and 6.1). See [`openspec/changes/play-tetris-against-jev/tasks.md`](openspec/changes/play-tetris-against-jev/tasks.md) for the task list and acceptance checks.

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

### Configure Jev locally

Create an API key in the [TypeSafe console](https://console.typesafe.ai/keys). In the root of the checkout where you run Next.js (beside `package.json`), create a file named `.env.local` containing:

```dotenv
JEV_API_KEY=your_typesafe_api_key_here
```

Replace the placeholder with your own key. Keep the variable name exactly `JEV_API_KEY`; do not add a `NEXT_PUBLIC_` prefix. Next.js loads `.env.local` into the server environment when you run `npm run dev`, and the Node.js Route Handler reads `process.env.JEV_API_KEY` for `POST /api/jev/decision`. Start or restart the development server after creating or changing the file. Each Git worktree is a separate checkout, so place `.env.local` in whichever worktree runs the app.

`.env.local` is covered by this repository's `.gitignore`. Keep the key out of commits, PR descriptions, screenshots, browser code, and client-side environment variables. Do not paste it into chat or a terminal command whose output you plan to share. The route sends it only in the upstream `Authorization: Bearer` header to TypeSafe's System One API. If the key is absent, a valid decision request returns `503` with `jev_not_configured`; it does not call TypeSafe. An invalid request is rejected before the key is checked. The split-screen view, keyboard controls, and calculated decision facts are available locally.

### Configure Jev on Vercel

Vercel uses separate environment scopes for Preview and Production. Configure `JEV_API_KEY` as a server-side environment variable in the Vercel project; use this exact name and do not add a `NEXT_PUBLIC_` prefix. The Next.js decision route reads it on the server. Never put the value in source code, client-side configuration, screenshots, or logs.

#### Preview first

1. Connect the Git repository to a Vercel project. The Preview deployment steps are in OpenSpec task 6.2.
2. In the Vercel dashboard, open the project and go to **Settings → Environment Variables**. Add `JEV_API_KEY`, enter the TypeSafe API key as its value, and select **Preview**. You can scope it to all Preview branches or a specific branch.
3. Save the variable and create a new Preview deployment (or redeploy the branch) so the deployment receives the updated environment.
4. Open the Preview URL and verify the game can complete a Jev decision. Confirm the browser-visible response and assets do not contain the key.

Do not configure or promote Production until Preview has been verified. Vercel applies environment variable changes only to new deployments, so redeploy after changing a value or its environment scope.

#### Production after Preview verification

After Preview passes, return to **Settings → Environment Variables** and add or assign `JEV_API_KEY` for the **Production** environment. Then create a Production deployment from the configured production branch, or redeploy it, so it receives the Production-scoped value. Verify a Jev decision and confirm the key remains absent from browser-visible responses and assets. The actual Production configuration and deployment are tracked separately in OpenSpec task 6.3.

For current Vercel dashboard steps and environment behavior, see [Managing Environment Variables](https://vercel.com/docs/environment-variables/managing-environment-variables) and [Environment Variables](https://vercel.com/docs/environment-variables).

### Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest unit and JSDOM UI suites for the engine, match lifecycle, keyboard controls, and Jev decision flow |
| `npm run test:e2e` | Run the Playwright Chromium end-to-end match flows |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run build` | Build the production application |
| `npm start` | Serve the production build |

### Browser end-to-end tests

Install the Playwright Chromium binary once with `npx playwright install chromium`, then run `npm run test:e2e`. Playwright starts a dedicated Next.js development server at `http://127.0.0.1:3100`; it refuses to reuse an existing server and sets `JEV_API_KEY` to an empty value. Every browser test intercepts `/api/jev/decision` and returns mocked decisions, so the suite does not need a Jev API key and cannot make a live Jev request.

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

`tickMatchSession(state)` is a pure transition with no browser timer. It ignores ticks while the session is ready, paused, or finished. While playing, it applies one shared gravity tick, ends with a win when one player tops out or a draw when both top out in the same gravity event, and advances as soon as both players lock. It also resolves single or simultaneous top-outs caused by spawning the next shared piece. The client view schedules one `MATCH_GRAVITY_INTERVAL_MS` interval while playing; keyboard input is added in task 5.2.

## Jev decision route

`POST /api/jev/decision` is a same-origin Next.js Node.js Route Handler. It requires a uint32 integer `seed` (0 through 0xffffffff), the current board, active piece, and complete legal landing candidate set. The seed is retained for retry identity and is not sent to TypeSafe. The server validates the board dimensions and cells, active piece, candidate count, IDs, and exact landing poses by recomputing candidates with the shared game engine before making one typed `choice` request to the official TypeSafe System One endpoint. A successful response contains the verified candidate ID in `choice`, the canonical engine simulation in `selectedCandidate`, and the per-candidate `probabilities` returned by TypeSafe without normalization or rounding.

The handler reads `JEV_API_KEY` only from its server environment and sends it as a Bearer credential. The key is never returned or logged. Invalid requests, an absent key, and upstream failures return small generic error responses. Valid TypeSafe token counts are mapped to `usage.inputTokens` and `usage.outputTokens`; `usage` is omitted when those counts are absent or malformed. The current API schema does not supply latency or cost, so the route does not estimate them. The route aborts upstream after eight seconds, covering both response headers and JSON body reading; timeout returns the same generic 502 error as other upstream failures. Local setup is described above; Vercel Preview and Production configuration is a later task.

## Decision pause and retry

[`src/game/jev-decision-session.ts`](src/game/jev-decision-session.ts) wraps the generic match lifecycle with pure, serializable `pending`, `retry-required`, and `complete` decision states. `beginJevDecision(session, decisionId)` accepts a playing session with an active, unlocked Jev piece, clones the session, pauses both boards, and captures the seed, board, piece, full canonical candidates, and serialized POST body. The captured session and snapshot are recursively frozen. Invalid begin states return `null`.

The host must supply a **distinct decision ID for every new decision**, including restarts with the same seed. Each attempt has a `{ decisionId, attempt }` token. Capture this token before awaiting HTTP and pass it back to completion/failure against the **latest** coordinator state. A stale token or duplicate completion is ignored. Restart must discard the old coordinator and create a new decision ID.

[`requestJevDecision(snapshot, fetcher?, signal?)`](src/client/jev-decision-api.ts) makes one same-origin POST to `/api/jev/decision`. It returns either `{ ok: true, result }` or `{ ok: false, error: 'jev_request_failed' }`. It accepts an abort signal for view cleanup, performs no automatic retry, and uses no fallback decision maker. The eight-second deadline runs on the server; the browser adapter has no separate transport timer.

```ts
const initial = beginJevDecision(playingSession, crypto.randomUUID());
if (initial) {
  // Store initial as the current coordinator; gate keyboard/gravity while pending.
  const token = initial.token;
  const response = await requestJevDecision(initial.snapshot);
  // In the host's state reducer, use its latest state, not the captured initial:
  // response.ok
  //   ? completeJevDecision(latest, token, response.result)
  //   : failJevDecision(latest, token)
}
```

Failures preserve the same paused session and snapshot. Only an explicit user retry calls `retryJevDecision(failed)` and sends its snapshot again; the POST body is byte-identical, including the seed, board, piece, and candidate list. A valid result must select a captured candidate and contain a finite probability in [0, 1] for every candidate with no extra keys. Probabilities are neither normalized nor rounded. Optional valid token counts are retained; malformed optional usage is omitted. The client ignores supplied board simulations and applies only its captured canonical outcome.

Completion locks Jev and uses `settleMatchSession` to resolve top-out and the round barrier without applying gravity to the human. If the human has already locked, the next shared piece spawns once; otherwise the human continues its current piece. The result retains canonical board effects and probabilities for the decision panel.

The match view gates the shared clock while a decision is pending or requires retry and does not offer generic resume in those states. It shows pending and retry status and offers an explicit same-snapshot retry. Current route and UI tests use mocked HTTP responses; no live TypeSafe decision is sent by the automated suite.

## Split-screen match view

[`src/client/match-app.tsx`](src/client/match-app.tsx) owns the browser session and Jev decision coordinator. Start, pause, resume, retry, and new-match buttons call the existing pure transitions. Each new match receives a fresh seed and unique match ID; each round's Jev decision has a distinct ID so late responses from an earlier attempt or match are ignored. The browser makes one same-origin request per pending attempt and aborts it when that attempt is replaced. If it cannot prepare a legal Jev decision, it pauses the match and shows a stopped state rather than advancing Jev through gravity.

[`src/client/board-view.tsx`](src/client/board-view.tsx) draws each player's settled cells and active piece from the shared engine. It renders only the 20 visible rows. `peekNextPiece` previews the next shared piece without consuming the seven-bag, including at a bag boundary. Both boards and the round, current piece, upcoming piece, player labels, and ready/playing/paused/Jev pending/retry/finished states are visible.

At desktop width, [`app/globals.css`](app/globals.css) uses two equal-width columns. The human region fills the left 50%; the right column uses a 70/30 row split for a Jev region of 35% and a decision/status region of 15%. The decision panel retains the last completed choice and its returned probability, up to three alternatives ranked by returned probability, and canonical simulated lines cleared, aggregate height, holes, and bumpiness. Token usage appears only when returned; latency and absent usage are labeled unavailable. The panel contains no generated natural-language explanation. Below 950 px the regions stack vertically.

### Keyboard controls

The human board is a focusable keyboard region. Click or tab to the board before using game keys; the match action buttons remain outside this region and keep their native keyboard activation. The visible help below the human board lists the bindings:

| Key | Action |
| --- | --- |
| Left / Right arrows | Move the human piece |
| Down arrow | Soft drop by one cell |
| Up arrow or X | Rotate clockwise |
| Z | Rotate counterclockwise |
| Space | Hard drop and lock |
| P | Pause or resume manual play |

Game keys prevent page scrolling while the board has focus. Movement is disabled while the match is paused, a human piece is already locked, or Jev's decision is pending/requires retry. `P` cannot resume a Jev decision pause. Ctrl, Meta, and Alt shortcuts pass through to the browser.

## Development workflow

OpenSpec is the source of truth for scope and task acceptance. Each numbered task is developed in its own feature branch and pull request. Start each new worktree from the latest `origin/main`; do not combine multiple numbered tasks in one PR.
