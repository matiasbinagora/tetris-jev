# End-to-End Match Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exercise the existing match lifecycle in a real browser, including successful and failed Jev responses, retry identity, human controls, pause/resume, restart, and a finished result, without contacting Jev.

**Architecture:** Add Playwright's test runner and a single Chromium project that starts the existing Next.js app on an isolated local port. Each E2E test intercepts the same-origin `/api/jev/decision` request before navigation; the Playwright server environment also sets `JEV_API_KEY` to an empty string so an interception mistake cannot trigger an upstream call. The match and route production code remain unchanged unless a failing E2E test exposes a spec violation.

**Tech Stack:** TypeScript, Next.js App Router, `@playwright/test`, Chromium.

**Spec:** `openspec/changes/play-tetris-against-jev/specs/split-screen-interface/spec.md`, `specs/jev-decisions/spec.md`, `specs/synchronized-match/spec.md`, and task 5.4 in `openspec/changes/play-tetris-against-jev/tasks.md`.

## Global Constraints

- Keep Jev API use behind same-origin `/api/jev/decision`; mock that browser request for every scenario.
- `JEV_API_KEY` stays server-only; the test web server receives an empty value and never calls upstream Jev.
- Do not add a heuristic or test-only fallback to production gameplay code.
- Preserve `agents-cli@0.1.0` and `node_modules/agents-cli/catalog/agents/global-orchestrator.md`.
- Copy and byte-verify `.env` or `.env.local` in this worktree without reading or printing values.
- Use the installed Next.js 16.3.6 Playwright guide before configuring the runner.

## Review Focus

- A failed request leaves the same round and snapshot in retry state; the second POST body is byte-for-byte equivalent after JSON serialization.
- Success data is displayed from the returned candidate, then the next human hard drop advances the shared round barrier.
- Pause and resume preserve round state; restart returns to round 1, resets counters, and issues a new seed.
- Repeated user hard drops reach a visible win or draw result without selectors tied to generated DOM structure.
- The E2E server and network mock cannot issue a real Jev request even if an endpoint interception is misconfigured.

---

### Task 1: Add the Playwright browser harness and match-flow coverage

**Files:**
- Modify: `package.json` and `package-lock.json` to add `@playwright/test` and `test:e2e`.
- Create: `playwright.config.ts` for a single headless Chromium project, base URL `http://127.0.0.1:3100`, and an isolated Next dev server.
- Create: `e2e/match-flow.e2e.ts` for browser-level decision fixtures and match journeys.
- Modify: `README.md` and `openspec/changes/play-tetris-against-jev/tasks.md`.

**Interfaces:**
- `npm run test:e2e` runs Playwright tests in `e2e/`.
- The test route fixture intercepts `**/api/jev/decision`, reads the posted JSON, and returns a response whose `choice` is an ID from that request's submitted candidate list.
- The Playwright `webServer.env.JEV_API_KEY` is an empty string; the app route must therefore reject an accidental unmocked request without upstream access.

- [x] **Step 1: Add the Playwright runner dependency and script**

Run `npm install --save-dev @playwright/test`, then add `"test:e2e": "playwright test"` to the existing scripts while preserving all current scripts and the pinned `agents-cli` URL.

- [x] **Step 2: Configure the app server and Chromium project**

Create `playwright.config.ts` with this shape:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: { JEV_API_KEY: '' },
  },
});
```

- [x] **Step 3: Add a mocked decision fixture and lifecycle E2E test**

In `e2e/match-flow.e2e.ts`, define a JSON request shape with `seed` and `candidates: { id: string }[]`. The success helper must return `choice: body.candidates[0].id` and a finite `probabilities` object with one value for every posted ID. Route all requests before `page.goto('/')`.

Write a test that queues an initial `502` and then successful replies; start the match, assert `Retry required`, click `Retry Jev`, assert the selected fact panel appears and exactly two request bodies are equal. Hard-drop the human piece and assert `ROUND 02`. Pause and resume, then click `New match`, assert the round resets to `ROUND 01`, and assert the restarted request has a different seed from the original.

- [x] **Step 4: Add the match-result E2E test**

Write a second browser test with a successful route fixture. Focus the `Human game board controls` group and issue the actual `Space` key. Repeat up to 30 shared rounds, waiting for either the round indicator to advance or the `Finished` heading after each key. Assert that a terminal result is visible as `You win this match.`, `Jev wins this match.`, or `The match ended in a draw.`. Keep the Jev mock response legal by always choosing the first ID from the current POST.

- [x] **Step 5: Install Chromium and run the new E2E suite**

Run `npx playwright install chromium` once in the work environment, then run `npm run test:e2e`. Fix test selectors, timings, or response fixtures if needed. Do not add delays longer than the existing UI request behavior requires.

- [x] **Step 6: Document E2E setup and update OpenSpec progress**

Add the browser install and run commands to `README.md`, describe that all decision POSTs are mocked, and change task 5.4 from `[ ]` to `[x]` only after the new suite passes.

- [x] **Step 7: Verify the full repository**

Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, `npm run build`, `npx openspec validate play-tetris-against-jev --strict`, and `git diff --check`. Confirm `.env` / `.env.local` remain ignored, `agents-cli` is still `0.1.0` with its orchestrator file, and the E2E run completed without using an API key.

- [ ] **Step 8: Review and submit task PR**

Commit task 5.4, request one independent final review, push `feature/task-5-4-e2e-match-flow`, and open one PR against `main`.
