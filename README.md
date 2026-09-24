# Tetris vs Jev

A desktop-first browser match where a human plays Tetris against Jev. Both players are intended to receive the same pieces on the same gravity clock while keeping independent boards. The product and architecture contract lives in the OpenSpec change `play-tetris-against-jev`.

## Current status

The Next.js App Router foundation and development tooling are in place. The home page is still a placeholder; the game engine, synchronized match, Jev decision route, and playable interface are not implemented yet.

OpenSpec implementation progress is **2 of 19 tasks complete** (application foundation tasks 1.1 and 1.2). See [`openspec/changes/play-tetris-against-jev/tasks.md`](openspec/changes/play-tetris-against-jev/tasks.md) for the task list and acceptance checks.

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
| `npm test` | Run Vitest; currently no tests have been added |
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

## Jev API and Vercel

The Jev route and API-key configuration have not been implemented yet. When they are, `JEV_API_KEY` must remain server-only, with no `NEXT_PUBLIC_` prefix, and the setup instructions will be added here. The deployment plan requires verifying Vercel Preview with its environment configuration before Production.

## Development workflow

OpenSpec is the source of truth for scope and task acceptance. Each numbered task is developed in its own feature branch and pull request. Start each new worktree from the latest `origin/main`; do not combine multiple numbered tasks in one PR.
