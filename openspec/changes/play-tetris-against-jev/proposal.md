# Proposal

## Why

This project needs a playable browser demo that makes Jev's decisions observable in a familiar game. A synchronized human-versus-agent Tetris match provides a clear comparison: both players receive the same pieces and gravity, while each board remains independent and the match ends when a player tops out.

## What Changes

- Add a deterministic Tetris rules engine and a shared match clock and piece sequence for two independent boards.
- Add a desktop-first split-screen game: the human board fills the left half; Jev's smaller board occupies the upper right; a decision panel fills the lower right.
- Add a server-side Jev decision route that receives legal landing choices, calls the TypeSafe Jev API, and returns the selected placement and available decision metadata.
- Pause the entire match while Jev is deciding or when a Jev request fails; allow retry without substituting another decision maker.
- Add local setup and Vercel deployment guidance for the server-side Jev API key.

## Capabilities

### New Capabilities

- `tetris-engine`: Standard tetromino movement, rotation, gravity, locking, line clearing, and top-out rules.
- `synchronized-match`: Shared seed, piece sequence, gravity clock, and win/draw lifecycle across two independent boards.
- `split-screen-interface`: Desktop keyboard play and the approved human/Jev/decision-panel layout.
- `jev-decisions`: Secure Jev API integration, legal-placement decisions, decision metadata, and paused retry behavior.
- `vercel-deployment`: Local configuration and deployment requirements for running the Next.js application and Jev route on Vercel.

### Modified Capabilities

None. The project has no existing capability specs.

## Impact

- A new Next.js App Router application using TypeScript, with browser-owned match state and a server-only Jev integration route.
- New game engine, match orchestration, UI, and API boundary; no database or account system.
- `JEV_API_KEY` must be configured as a server-side environment variable for local play and in the relevant Vercel environments. It must never be exposed to browser bundles.
- Vercel deployment becomes possible after this folder is connected to a Git repository and Vercel project; this change does not create that repository or deploy it.
- The Jev player is a real general-purpose decision model and may choose a legal but strategically weak placement.
