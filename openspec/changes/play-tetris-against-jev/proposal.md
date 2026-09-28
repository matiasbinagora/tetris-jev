# Proposal

## Why

This project needs a playable browser demo that makes Jev's decisions observable in a familiar game. Human and Jev receive the same seeded piece sequence on independent boards, but each advances at its own pace. The original round barrier and opaque Jev placement descriptions made the controls hard to discover and Jev's play strategically weak.

## What Changes

- Add a deterministic Tetris rules engine and one seeded piece sequence with an independent sequence cursor and play clock for each board.
- Add a desktop-first split-screen game: the human board fills the left half; Jev's smaller board occupies the upper right; a decision panel fills the lower right.
- Add a server-side Jev decision route that validates a deterministic shortlist of legal landings, describes their calculated Tetris outcomes and one-piece lookahead, calls the TypeSafe Jev API, and returns its selected placement and available decision metadata.
- Keep the human clock and controls active while Jev is deciding or waiting for retry. Manual pause stops both players. Retry preserves Jev's exact decision snapshot without substituting another decision maker.
- Accept game keys during active play without requiring the human board to have focus, while preserving browser shortcuts and native controls.
- Decide the winner by pieces survived from the shared sequence: after one board tops out, the other may continue until it surpasses that count or also tops out at the same count.
- Add local setup and Vercel deployment guidance for the server-side Jev API key.

## Capabilities

### New Capabilities

- `tetris-engine`: Standard tetromino movement, rotation, gravity, locking, line clearing, and top-out rules.
- `synchronized-match`: Shared seeded piece sequence, independent progression, and win/draw lifecycle across two independent boards.
- `split-screen-interface`: Desktop keyboard play and the approved human/Jev/decision-panel layout.
- `jev-decisions`: Secure Jev API integration, legal-placement decisions, decision metadata, and paused retry behavior.
- `vercel-deployment`: Local configuration and deployment requirements for running the Next.js application and Jev route on Vercel.

### Modified Capabilities

None. The project has no existing capability specs.

## Impact

- A new Next.js App Router application using TypeScript, with browser-owned match state and a server-only Jev integration route.
- New game engine, match orchestration, UI, and API boundary; no database or account system. The post-deployment gameplay revision replaces the original shared round barrier and shared Jev pause.
- `JEV_API_KEY` must be configured as a server-side environment variable for local play and in the relevant Vercel environments. It must never be exposed to browser bundles.
- The repository and Vercel project are connected, and Preview and Production have been verified. The gameplay revision uses Preview verification before updating Production.
- The Jev player is a real general-purpose decision model. Deterministic candidate scoring removes clearly weak placements before its choice, but the model may still select a strategically weak option from the shortlist. Returned probabilities are conditional on the submitted shortlist, not the probability of clearing a line.
