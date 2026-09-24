# Tasks

## 1. Application foundation

- [x] 1.1 Scaffold a TypeScript Next.js App Router application and npm scripts for development, linting, tests, type-checking, and production build; verify the expected scripts run and `npm run build` succeeds.
- [x] 1.2 Preserve the existing `agents-cli@0.1.0` release and `node_modules/agents-cli/catalog/agents/global-orchestrator.md` path while establishing app dependencies; verify the version and file path remain available after installation.

## 2. Deterministic Tetris engine

- [x] 2.1 Implement the 10 by 20 board with hidden spawn rows, seven standard tetrominoes, deterministic spawn positions, collision checks, and the documented Super Rotation System kick order; verify unit tests cover every piece orientation, wall/floor collisions, and blocked rotations.
- [x] 2.2 Implement gravity steps, soft/hard drop, locking, simultaneous line clearing, board metrics, and spawn/lock top-out; verify unit tests cover normal placement, multiple lines, holes, height, bumpiness, and top-out.
- [x] 2.3 Implement deterministic legal landing enumeration and board simulation for every candidate; verify tests prove each returned candidate is legal and its simulated effects match applying that placement to a copied board.

## 3. Shared match lifecycle

- [ ] 3.1 Implement the seeded shared seven-bag sequence, one-piece-per-round barrier, and common 700 ms gravity clock over independent boards; verify tests show both boards receive the same round piece and only the active board states change on ticks.
- [ ] 3.2 Implement start, pause, resume, restart, round progression, and win/draw resolution; verify tests cover preserved state on resume, fresh sequence on restart, independent line clears, single top-out, and simultaneous top-out.

## 4. Jev decision service

- [ ] 4.1 Implement a same-origin Next.js Node.js Route Handler that validates board/piece/candidates, reads `JEV_API_KEY` server-side, and calls Jev once with a typed `choice`; verify route tests cover valid requests, invalid candidates, missing credentials, upstream failures, and that the key is absent from responses and client bundles.
- [ ] 4.2 Map Jev's selected candidate, per-candidate probabilities, and returned latency/usage metadata to a safe response; verify tests cover valid choice mapping, probability preservation, omitted optional metrics, malformed responses, and unknown candidate IDs.
- [ ] 4.3 Implement the eight-second request deadline, shared pause, pending/error states, and same-snapshot retry without fallback behavior; verify tests show both boards remain unchanged during pending/failure and retry resubmits the same seed, board, piece, and candidate set.
- [ ] 4.4 Document `.env.local`, the `JEV_API_KEY` variable, key handling, and safe Jev setup in the project README; verify every documented local setup step matches the implemented route configuration.

## 5. Split-screen game interface

- [ ] 5.1 Build the simultaneous human/Jev board view using the 50% / 35% / 15% layout, player labels, current/upcoming piece, and visible match states; verify a desktop viewport check confirms the approved area allocation and both boards remain visible.
- [ ] 5.2 Add the documented keyboard controls, focus handling, and on-screen control help; verify UI tests cover movement, rotation, soft drop, hard drop, pause, and prevention of page scrolling from game keys.
- [ ] 5.3 Add Jev's selected move, returned probability, up to three alternatives, calculated board effects, and available latency/usage metrics; verify UI tests cover returned data, absent metrics, and no fabricated natural-language explanation.
- [ ] 5.4 Add end-to-end coverage for start, a human round, Jev decision success, Jev retry, pause/resume, restart, and match result; verify the full browser flow passes with the Jev API mocked and no live key required.

## 6. Vercel readiness and integration

- [ ] 6.1 Document Vercel Preview and Production environment setup for `JEV_API_KEY` and the Preview-before-Production workflow; verify the README clearly distinguishes local, Preview, and Production configuration.
- [ ] 6.2 Connect the application to a Vercel project after the folder is a Git repository, configure Preview variables, and deploy a Preview build; verify the UI and Jev route work and no API key appears in browser-visible assets or responses.
- [ ] 6.3 Configure Production variables and deploy only after Preview verification; verify the Production game can complete a Jev decision and fails safely when the server credential is unavailable.
- [ ] 6.4 Run the complete lint, test, type-check, production-build, and OpenSpec validation commands; verify each succeeds before considering the change ready to archive.
