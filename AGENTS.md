# Project Instructions

## Project

This folder contains the planning baseline for a desktop-first Next.js Tetris match between a human and Jev. Product and architecture documentation is in English. The approved scope and behavior are captured in the OpenSpec change `play-tetris-against-jev`.

## Before implementation

- Read `openspec/changes/play-tetris-against-jev/proposal.md`, every spec under its `specs/` directory, and `design.md` before changing application behavior.
- Treat the OpenSpec requirements as the behavior contract. Update the proposal/specs/design/tasks first when the user approves a behavior change.
- Follow the ordered implementation tasks in `openspec/changes/play-tetris-against-jev/tasks.md` once implementation is requested.
- Use TypeScript and the Next.js App Router. Keep board rules deterministic and pure so browser gameplay, Jev candidate generation, and server validation share the same behavior.
- Preserve the already installed `agents-cli@0.1.0` release and its `node_modules/agents-cli/catalog/agents/global-orchestrator.md` path when introducing app dependencies; do not silently remove or update it.

## Product constraints

- Keep the human and Jev boards independent while sharing one seeded seven-bag piece sequence, one piece per round, and one gravity clock. Do not advance to the next piece until both players have locked the current one.
- Preserve the desktop 50% human / 35% Jev board / 15% Jev decision panel layout.
- Jev chooses among enumerated legal placements through the server route. Do not substitute a heuristic or another model when Jev is delayed or unavailable; pause and allow retry with the same decision state.
- Show returned choice probabilities and computed board outcomes. Do not present fabricated natural-language explanations as Jev reasoning.
- Keep `JEV_API_KEY` server-only. Never use a `NEXT_PUBLIC_` variable for it, return it to the browser, commit it, or log it.
- Keep match state in the browser. The MVP has no accounts, database, persistence, multiplayer, or garbage attacks.

## Validation

- Add or update unit tests for deterministic engine rules and candidate validation, route tests for Jev success/failure/secrets, and UI or end-to-end coverage for the match flow and keyboard controls as their implementation tasks require.
- Validate the OpenSpec change with the repository's OpenSpec CLI before marking its planning or implementation work complete.
- For Vercel work, use Preview first and verify the server route with Preview environment configuration before Production.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
