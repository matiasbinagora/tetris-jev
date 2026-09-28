# Tetris vs Jev

A desktop-first browser match where a human plays Tetris against Jev. Both players receive the same seeded piece sequence on independent boards. The approved revision lets each player advance at its own pace. The product and architecture contract lives in the OpenSpec change `play-tetris-against-jev`.

## Current status

The Next.js App Router foundation, deterministic Tetris engine, server-side Jev decision route, split-screen match view, application-level keyboard controls, Jev decision facts panel, and Vercel environment setup are implemented. Task 7.1 adds a deterministic shortlist of up to 12 placements, evaluates the known next piece, validates the exact shortlist on the server, and labels Jev's probabilities as preferences among those options. Task 7.2 handles game keys without requiring board focus and restores visible play focus after Start and Resume. Task 7.3 gives each board an independent cursor into the same seeded sequence: human gravity continues during Jev latency or retry, Jev advances after its decision, manual pause stops both, and results compare survived-piece counts. Task 7.4 adds an accessible divider that resizes Jev's board and decision panel from a 70/30 default, within 50/50 to 80/20 limits; the divider supports dragging and Arrow Up/Down and is hidden when the panels stack below 950 px. Final validation follows as task 7.5. Playwright flows mock Jev and cover independent advancement, pause/resume, retry, focus, resizing, and match flow. The Vercel project is connected to GitHub; Preview and Production deployments have been verified with Jev decisions.

OpenSpec implementation progress is **22 of 23 tasks complete with task 7.4**. Task 7.5 is the remaining final validation gate. See [`openspec/changes/play-tetris-against-jev/tasks.md`](openspec/changes/play-tetris-against-jev/tasks.md) for the task list and acceptance checks.

### Approved gameplay revision

Jev chooses from a deterministic shortlist evaluated for line clears, holes, height, bumpiness, and the known next piece. Task 7.2 makes game keys work without a board click and returns focus to the play area after Start and Resume. Task 7.3 implements independent progression through the same seeded sequence. A Jev API delay or retry stops only Jev; manual pause stops both players; the winner is determined by pieces survived rather than API speed. Task 7.4 lets the user resize Jev's board and decision panel, starting at 70/30, while leaving the human column fixed. Each implementation task is a separate PR from the latest `main`.

Jev's returned probabilities will remain its preferences among the submitted options. They are not estimates of the chance to clear a line or win. The shortlist will be calculated and validated by the shared rules, and Jev will still make the final placement choice. See the [OpenSpec design](openspec/changes/play-tetris-against-jev/design.md) for the exact contract and task order.

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

#### Verified Preview deployment

The Vercel project is [`matiasjacob/tetris-jev`](https://vercel.com/matiasjacob/tetris-jev), connected to [`matiasbinagora/tetris-jev`](https://github.com/matiasbinagora/tetris-jev). The verified task 6.2 Preview is [https://tetris-jev-git-feature-task-6-2-vercel-preview-matiasjacob.vercel.app](https://tetris-jev-git-feature-task-6-2-vercel-preview-matiasjacob.vercel.app). `JEV_API_KEY` is configured as a Sensitive Secret for Preview and Production. A browser session completed a Jev decision in Preview, and the key was not exposed in browser assets or the decision response. GitHub pushes and pull requests create Preview deployments; merges to the Production branch create Production deployments. See [Vercel Git deployments](https://vercel.com/docs/git).

Do not configure or promote Production until Preview has been verified. Vercel applies environment variable changes only to new deployments, so redeploy after changing a value or its environment scope.

#### Production after Preview verification

After Preview passes, configure `JEV_API_KEY` for the **Production** environment and create a new Production deployment so it receives that value. Do not expose the credential in client configuration. If the server credential is unavailable, a Jev decision must fail closed, preserve the round, and allow retry.

#### Verified Production deployment

The Production app is [https://tetris-jev.vercel.app](https://tetris-jev.vercel.app). `JEV_API_KEY` is configured as a Sensitive Secret in Production. The game completed a Jev decision and displayed the returned choice and probabilities. Before adding the Production secret, the live app showed **Retry required** and kept the round unchanged, confirming safe behavior when the server credential is missing. The key remained absent from the browser UI.

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
- One seeded seven-bag sequence with an independent sequence cursor per player. Human gravity runs every 700 ms; Jev advances after each API-selected placement. The winner survives more pieces from the same sequence.
- A desktop layout allocating 50% of the viewport area to the human board, and initially splitting the other half 70/30 between Jev's board and decision panel. The user can resize that right-column split within 50/50 to 80/20 bounds.
- Jev chooses from a server-validated shortlist of legal placements with calculated board outcomes. If a request fails or times out, Jev stops and retries with the same decision state while the human can keep playing; there is no substitute player.
- Game keys work during active human play without requiring board focus, while native controls and browser shortcuts retain their behavior.
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

The pure match state and transitions live in [`src/game/match.ts`](src/game/match.ts). `createMatchCore(seed)` normalizes a finite integer seed and both players use independent sequence cursors to retrieve pieces from the same deterministic seven-bag stream. Each player stores its board, active piece, sequence index, survived-piece count, and top-out status. The state can be JSON-serialized and restored; indexed lookups reproduce the same sequence after different player speeds.

`applyHumanGravityTick(state)` advances only the human board. Jev does not use gravity: its board locks the canonical placement returned by its current API request, then starts the next indexed piece. A successful lock advances only that player's cursor; a top-out ends that player's progression. These are pure transitions, with browser scheduling in the match view.

## Match lifecycle

The serializable match-session state and transitions live in [`src/game/match-session.ts`](src/game/match-session.ts). A session begins in `ready`; start moves it to `playing`. Pause and resume change only the phase, preserving the core, boards, active pieces, round, and seeded sequence. Restart receives a fresh seed from its caller, creates a clean core, clears the result, and begins playing immediately.

`tickMatchSession(state)` is a pure human gravity transition. It ignores ticks while ready, paused, or finished. Manual pause stops both progressions. A Jev pending request or retry-required state does not pause the human clock or controls. A piece increments the survived count only after a safe spawn; the match ends when one player has survived more pieces than a topped-out opponent, or both top out. Equal final counts draw. The client view schedules a 700 ms human interval and Jev decisions independently, with a 350 ms minimum visible cadence between Jev moves.

## Jev decision route

`POST /api/jev/decision` is a same-origin Next.js Node.js Route Handler. The revised contract requires a uint32 integer `seed` (0 through 0xffffffff), Jev's `sequenceIndex` (0 through 9,999), board, active piece, known next piece, and shortlisted legal landing poses. The seed and sequence index preserve retry identity and are not sent to TypeSafe. The server validates the sequence pieces, board dimensions and cells, active piece, and exact shortlist IDs, ordering, and poses by recomputing ranked candidates with the shared game engine. It derives compact `p0` through `p11` choice descriptions from canonical immediate and next-piece outcomes before making one typed `choice` request to the official TypeSafe System One endpoint. A successful response maps TypeSafe's short choice and probability keys back to canonical candidate IDs without normalizing or rounding returned values.

The handler reads `JEV_API_KEY` only from its server environment and sends it as a Bearer credential. The key is never returned or logged. Invalid requests, an absent key, and upstream failures return small generic error responses. Valid TypeSafe token counts are mapped to `usage.inputTokens` and `usage.outputTokens`; `usage` is omitted when those counts are absent or malformed. The current API schema does not supply latency or cost, so the route does not estimate them. The route aborts upstream after eight seconds, covering both response headers and JSON body reading; timeout returns the same generic 502 error as other upstream failures. Local setup is described above; Vercel Preview and Production configuration is a later task.

## Decision pause and retry

[`src/game/jev-decision-session.ts`](src/game/jev-decision-session.ts) wraps the match lifecycle with pure, serializable `pending`, `retry-required`, `ready-to-apply`, and `complete` decision states. `beginJevDecision(session, decisionId)` accepts a playing session with an active Jev piece and captures the seed, Jev sequence index, current and next piece, board, ranked shortlist (up to 12 options), and serialized POST body. The human session keeps running independently. The captured snapshot is recursively frozen. Invalid begin states return `null`.

The host must supply a **distinct decision ID for every new decision**, including restarts with the same seed. Each attempt has a `{ decisionId, attempt }` token. Capture this token before awaiting HTTP and pass it back to completion/failure against the **latest** coordinator state. A stale token or duplicate completion is ignored. Restart must discard the old coordinator and create a new decision ID.

[`requestJevDecision(snapshot, fetcher?, signal?)`](src/client/jev-decision-api.ts) makes one same-origin POST to `/api/jev/decision`. It returns either `{ ok: true, result }` or `{ ok: false, error: 'jev_request_failed' }`. It accepts an abort signal for view cleanup, performs no automatic retry, and uses no fallback decision maker. The eight-second deadline runs on the server; the browser adapter has no separate transport timer.

```ts
const initial = beginJevDecision(playingSession, crypto.randomUUID());
if (initial) {
  // Store initial as the current Jev coordinator; human controls keep running.
  const token = initial.token;
  const response = await requestJevDecision(initial.snapshot);
  // In the host's state reducer, use its latest state, not the captured initial:
  // response.ok
  //   ? completeJevDecision(latest, token, response.result)
  //   : failJevDecision(latest, token)
}
```

Failures preserve the same decision snapshot while the human keeps playing. Only an explicit user retry calls `retryJevDecision(failed)` and sends its snapshot again; the POST body is byte-identical, including the seed, board, piece, and candidate list. A valid result must select a captured candidate and contain a finite probability in [0, 1] for every candidate with no extra keys. Probabilities are neither normalized nor rounded. Optional valid token counts are retained; malformed optional usage is omitted. The client ignores supplied board simulations and applies only its captured canonical outcome to the latest live match state. If a response arrives during manual pause, it remains ready-to-apply until resume.

Completion locks Jev's piece and advances only Jev to its next sequence item. The human piece and board are preserved. A delayed response is ignored if restart, finish, or a newer Jev piece made its snapshot stale. The result retains canonical board effects, next-piece lookahead outcomes, and probabilities for the decision panel.

The match view runs the human gravity clock independently from Jev's request and decision cadence. It shows separate sequence positions and survived-piece counts, Jev pending/retry status, and an explicit same-snapshot retry. Manual pause/resume remains available during a Jev request. Current route and UI tests use mocked HTTP responses; no live TypeSafe decision is sent by the automated suite.

## Split-screen match view

[`src/client/match-app.tsx`](src/client/match-app.tsx) owns the browser session and Jev decision coordinator. Start, pause, resume, retry, and new-match buttons call the pure transitions. Each new match receives a fresh seed and unique match ID; each Jev piece decision has a distinct ID so late responses from an earlier attempt or match are ignored. The browser makes one same-origin request per pending attempt and aborts it when that attempt is replaced. Human and Jev have separate sequence positions, and the interface reports each player's survived-piece count.

[`src/client/board-view.tsx`](src/client/board-view.tsx) draws each player's settled cells and active piece from the shared engine. It renders only the 20 visible rows. Each sidebar previews that player's next indexed piece. Both boards, separate sequence positions, piece previews, player labels, survived-piece counts, and ready/playing/paused/Jev pending/retry/finished states are visible.

At desktop width, [`app/globals.css`](app/globals.css) uses two equal-width columns. The human region fills the left 50%; the right column defaults to a 70/30 row split for a Jev region of 35% and a decision/status region of 15%. The accessible separator supports pointer dragging and Arrow Up/Down keyboard adjustments within 50/50 and 80/20 bounds while keeping the human region fixed. Its sizing resets to 70/30 after a page reload. The decision panel retains the last completed choice and its returned probability, up to three alternatives ranked by returned probability, and canonical simulated current and next-piece lines, aggregate height, holes, and bumpiness. Probabilities are labeled as Jev's preference among evaluated options; they do not estimate line-clear or win chances. Token usage appears only when returned; latency and absent usage are labeled unavailable. The panel contains no generated natural-language explanation. Below 950 px the regions stack vertically and the separator is hidden.

### Keyboard controls

Game keys work during active human play without requiring the board to have focus. Start and Resume return visible focus to the human board. Native buttons retain their keyboard activation, and editable controls, IME composition, and Ctrl/Meta/Alt browser shortcuts are left alone. The visible help below the human board lists the bindings:

| Key | Action |
| --- | --- |
| Left / Right arrows | Move the human piece |
| Down arrow | Soft drop by one cell |
| Up arrow or X | Rotate clockwise |
| Z | Rotate counterclockwise |
| Space | Hard drop and lock |
| P | Pause or resume manual play |

Handled game keys prevent page scrolling wherever focus is in the app. Human movement is disabled while the match is paused, the human has topped out, or the match is finished. `P` toggles manual pause; Jev pending/retry does not disable human play.

## Development workflow

OpenSpec is the source of truth for scope and task acceptance. Each numbered task is developed in its own feature branch and pull request. Start each new worktree from the latest `origin/main`; do not combine multiple numbered tasks in one PR.
