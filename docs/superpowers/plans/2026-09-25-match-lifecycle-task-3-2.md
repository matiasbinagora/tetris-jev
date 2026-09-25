# Shared Match Lifecycle (Task 3.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pure match-session transitions for start, pause, resume, immediate seeded restart, shared-round progression, and win/draw outcomes.

**Architecture:** Create `src/game/match-session.ts` as a serializable lifecycle wrapper around the existing `MatchCoreState`. Control functions return immutable state transitions; `tickMatchSession` applies one shared gravity tick, resolves top-outs, and advances the shared round only after both players lock. The client continues to own the timer and will call the pure tick later.

**Tech Stack:** TypeScript 5.9, Node.js 20.9+, npm, Vitest 5; no new dependencies.

**Spec:** `openspec/changes/play-tetris-against-jev/specs/synchronized-match/spec.md`, `openspec/changes/play-tetris-against-jev/design.md` (task 3.2 lifecycle section), and task 3.2 in `openspec/changes/play-tetris-against-jev/tasks.md`.

## Global Constraints

- Use TypeScript and the Next.js App Router. Keep board rules deterministic and pure so browser gameplay, Jev candidate generation, and server validation share the same behavior.
- Keep the human and Jev boards independent while sharing one seeded seven-bag piece sequence, one piece per round, and one gravity clock. Do not advance to the next piece until both players have locked the current one.
- Preserve the desktop 50% human / 35% Jev board / 15% Jev decision panel layout.
- Jev chooses among enumerated legal placements through the server route. Do not substitute a heuristic or another model when Jev is delayed or unavailable; pause and allow retry with the same decision state.
- Keep `JEV_API_KEY` server-only. Never use a `NEXT_PUBLIC_` variable for it, return it to the browser, commit it, or log it.
- Keep match state in the browser. The MVP has no accounts, database, persistence, multiplayer, or garbage attacks.
- Preserve `agents-cli@0.1.0` and `node_modules/agents-cli/catalog/agents/global-orchestrator.md`; this task adds no dependencies.
- Keep product documentation and code comments in English. Update `README.md` and mark only task 3.2 complete after all required verification.
- Keep the shared gravity interval at `MATCH_GRAVITY_INTERVAL_MS = 700`; this module exposes state transitions and does not schedule a browser timer.
- Pass a fresh integer seed to restart; do not read ambient randomness inside the pure game module.

## Review Focus

- Start, pause, or resume requests made in the wrong phase must preserve the exact session reference; Task 1 pins each invalid transition.
- Resume must preserve serialized boards, active pieces, round, and RNG state; Task 1 compares the original and resumed core by identity and JSON value.
- Restart must reject non-finite or fractional seeds and otherwise create a clean core with the supplied seed, no result, and phase `playing`; Task 1 pins both cases.
- A single gravity or next-spawn top-out must finish with the other player as winner without applying another round; Task 2 tests each event.
- Simultaneous gravity or next-spawn top-outs must finish as a draw, and every finished session must ignore future ticks; Task 2 tests both event sources and the terminal no-op.

---

### Task 1: Define session state and lifecycle controls

**Files:**
- Create: `src/game/match-session.ts`
- Create: `src/game/match-session.test.ts`
- Read: `src/game/match.ts` exports `MatchCoreState` and `createMatchCore`
- Read: `src/game/engine.ts` board and piece types

**Interfaces:**
- Consumes: `MatchCoreState` and `createMatchCore(seed)` from the task 3.1 shared core.
- Produces:

```ts
export type MatchPhase = 'ready' | 'playing' | 'paused' | 'finished';
export type MatchPlayer = 'human' | 'jev';
export type MatchResult =
  | { kind: 'win'; winner: MatchPlayer }
  | { kind: 'draw' };

export interface MatchSessionState {
  core: MatchCoreState;
  phase: MatchPhase;
  result: MatchResult | null;
}

export function createMatchSession(seed: number): MatchSessionState;
export function startMatchSession(state: MatchSessionState): MatchSessionState;
export function pauseMatchSession(state: MatchSessionState): MatchSessionState;
export function resumeMatchSession(state: MatchSessionState): MatchSessionState;
export function restartMatchSession(freshSeed: number): MatchSessionState;
```

- `createMatchSession(seed)` wraps `createMatchCore(seed)` in phase `ready` with no result.
- Start only changes `ready` to `playing`; pause only changes `playing` to `paused`; resume only changes `paused` to `playing`. A request in any other phase returns its exact input object.
- `restartMatchSession(freshSeed)` is a pure fresh-session constructor: it creates a new core with that seed, clears the result, and returns phase `playing`. The caller generates and supplies the seed.

- [ ] **Step 1: Install the lockfile dependencies and verify the pinned agent CLI**

Run: `npm ci`

Expected: dependencies install from `package-lock.json` without changing the approved `agents-cli` version.

Run: `node -p "require('./node_modules/agents-cli/package.json').version"`

Expected: `0.1.0`.

Run: `test -f node_modules/agents-cli/catalog/agents/global-orchestrator.md`

Expected: exit code 0.

- [ ] **Step 2: Write failing tests for session creation and controls**

Create `src/game/match-session.test.ts` with this behavior coverage:

```ts
import { describe, expect, it } from 'vitest';
import { createMatchCore } from './match';
import {
  createMatchSession,
  pauseMatchSession,
  restartMatchSession,
  resumeMatchSession,
  startMatchSession,
  type MatchSessionState,
} from './match-session';

describe('match session controls', () => {
  it('creates a ready session with a seeded core and no result', () => {
    const session = createMatchSession(123);
    expect(session.phase).toBe('ready');
    expect(session.result).toBeNull();
    expect(session.core).toEqual(createMatchCore(123));
    expect(JSON.parse(JSON.stringify(session))).toEqual(session);
  });

  it('starts without replacing the core', () => {
    const ready = createMatchSession(123);
    const playing = startMatchSession(ready);
    expect(playing.phase).toBe('playing');
    expect(playing.core).toBe(ready.core);
  });

  it('pauses and resumes without changing the core or serialized state', () => {
    const playing = startMatchSession(createMatchSession(123));
    const paused = pauseMatchSession(playing);
    const resumed = resumeMatchSession(paused);
    expect(paused.phase).toBe('paused');
    expect(resumed.phase).toBe('playing');
    expect(resumed.core).toBe(playing.core);
    expect(JSON.parse(JSON.stringify(resumed.core))).toEqual(playing.core);
  });

  it('returns the same session for controls invalid in the current phase', () => {
    const ready = createMatchSession(123);
    const playing = startMatchSession(ready);
    const paused = pauseMatchSession(playing);
    const finished: MatchSessionState = {
      ...playing,
      phase: 'finished',
      result: { kind: 'win', winner: 'human' },
    };
    expect(pauseMatchSession(ready)).toBe(ready);
    expect(pauseMatchSession(paused)).toBe(paused);
    expect(pauseMatchSession(finished)).toBe(finished);
    expect(resumeMatchSession(ready)).toBe(ready);
    expect(resumeMatchSession(playing)).toBe(playing);
    expect(startMatchSession(playing)).toBe(playing);
    expect(startMatchSession(paused)).toBe(paused);
    expect(resumeMatchSession(finished)).toBe(finished);
  });

  it('restarts immediately with a clean core made from the supplied seed', () => {
    const restarted = restartMatchSession(456);
    expect(restarted.phase).toBe('playing');
    expect(restarted.result).toBeNull();
    expect(restarted.core).toEqual(createMatchCore(456));
    expect(restarted.core.roundIndex).toBe(0);
    expect(restarted.core.human.board).not.toBe(restarted.core.jev.board);
    expect(restarted.core.human.activePiece?.type).toBe(restarted.core.currentPiece);
    expect(restarted.core.jev.activePiece?.type).toBe(restarted.core.currentPiece);
  });

  it('rejects an invalid restart seed', () => {
    expect(() => restartMatchSession(1.5)).toThrow(RangeError);
  });
});
```

- [ ] **Step 3: Run the focused tests to verify they fail**

Run: `npm test -- src/game/match-session.test.ts`

Expected: FAIL because the lifecycle module and exports do not exist yet.

- [ ] **Step 4: Implement the session types and phase transitions**

Create `src/game/match-session.ts` with the declared interfaces. The control logic should follow these immutable transitions:

```ts
export function createMatchSession(seed: number): MatchSessionState {
  return { core: createMatchCore(seed), phase: 'ready', result: null };
}

export function startMatchSession(state: MatchSessionState): MatchSessionState {
  return state.phase === 'ready' ? { ...state, phase: 'playing' } : state;
}

export function pauseMatchSession(state: MatchSessionState): MatchSessionState {
  return state.phase === 'playing' ? { ...state, phase: 'paused' } : state;
}

export function resumeMatchSession(state: MatchSessionState): MatchSessionState {
  return state.phase === 'paused' ? { ...state, phase: 'playing' } : state;
}

export function restartMatchSession(freshSeed: number): MatchSessionState {
  return { core: createMatchCore(freshSeed), phase: 'playing', result: null };
}
```

The actual module also defines the types above and imports only the existing pure core. Do not add timers, browser APIs, or `Math.random`.

- [ ] **Step 5: Run lifecycle tests and type-check**

Run: `npm test -- src/game/match-session.test.ts`

Expected: PASS for ready creation, guarded phase transitions, preserved resume state, seeded immediate restart, and invalid seed rejection.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the lifecycle state and controls**

```sh
git add src/game/match-session.ts src/game/match-session.test.ts
git commit -m "feat: add match lifecycle controls"
```

### Task 2: Orchestrate shared ticks, round progression, and outcomes

**Files:**
- Modify: `src/game/match-session.ts`
- Modify: `src/game/match-session.test.ts`
- Read: `src/game/match.ts` exports `applySharedGravityTick` and `advanceMatchRound`
- Read: `src/game/engine.ts` gravity lock and spawn top-out semantics

**Interfaces:**
- Consumes: `MatchSessionState`, `applySharedGravityTick(core)`, and `advanceMatchRound(core)`.
- Produces:

```ts
export function tickMatchSession(state: MatchSessionState): MatchSessionState;
```

- A tick in `ready`, `paused`, or `finished` returns the same session reference.
- A playing tick applies exactly one shared gravity transition. A top-out from that transition ends the match before any round advancement. If both players top out in the same transition, the result is a draw; otherwise the surviving player wins.
- If neither player topped out and both locked, advance once to the next round immediately. Resolve a top-out caused by either next-piece spawn in that same transition. The finished state keeps the resulting core for inspection.

- [ ] **Step 1: Add failing tests for inactive ticks, shared progression, and independent board clearing**

Add tests to `src/game/match-session.test.ts` using fixture helpers that copy boards before editing them. For the line-clear case, set both active pieces and `currentPiece` to horizontal `I` at `{ x: 3, y: 20 }`; fill human row 21 except columns 3–6, and leave Jev's board empty. The assertions are:

```ts
import { describe, expect, it } from 'vitest';
import { BOARD_WIDTH, HIDDEN_ROWS, createEmptyBoard } from './engine';
import {
  createMatchCore,
  type MatchCoreState,
  type MatchPlayerState,
} from './match';
import {
  createMatchSession,
  pauseMatchSession,
  tickMatchSession,
  type MatchPlayer,
  type MatchSessionState,
} from './match-session';

function withBothLocked(core: MatchCoreState): MatchCoreState {
  return {
    ...core,
    human: { ...core.human, activePiece: null, lockedThisRound: true },
    jev: { ...core.jev, activePiece: null, lockedThisRound: true },
  };
}

function playing(core: MatchCoreState): MatchSessionState {
  return { core, phase: 'playing', result: null };
}

function withGravityBlock(
  core: MatchCoreState,
  blockedPlayer: MatchPlayer,
): MatchCoreState {
  const board = createEmptyBoard().map((row) => [...row]);
  board[2][3] = 'I';
  board[2][4] = 'I';
  board[2][5] = 'I';
  const activePiece = { type: 'T' as const, rotation: 0 as const, x: 3, y: 0 };
  const human: MatchPlayerState = {
    ...core.human,
    activePiece: { ...activePiece },
    ...(blockedPlayer === 'human' ? { board } : {}),
  };
  const jev: MatchPlayerState = {
    ...core.jev,
    activePiece: { ...activePiece },
    ...(blockedPlayer === 'jev' ? { board } : {}),
  };
  return { ...core, currentPiece: 'T', human, jev };
}

function withSpawnBlocked(
  core: MatchCoreState,
  blockedPlayer: MatchPlayer,
): MatchCoreState {
  const board = createEmptyBoard().map((row) => [...row]);
  for (let y = 0; y < HIDDEN_ROWS; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) board[y][x] = 'I';
  }
  const playerState: MatchPlayerState = { ...core[blockedPlayer], board };
  return blockedPlayer === 'human'
    ? { ...core, human: playerState }
    : { ...core, jev: playerState };
}

describe('tickMatchSession progression', () => {
  it('does nothing outside the playing phase', () => {
    const ready = createMatchSession(123);
    const paused: MatchSessionState = { ...ready, phase: 'paused' };
    const finished: MatchSessionState = {
      ...ready,
      phase: 'finished',
      result: { kind: 'win', winner: 'human' },
    };
    expect(tickMatchSession(ready)).toBe(ready);
    expect(tickMatchSession(paused)).toBe(paused);
    expect(tickMatchSession(finished)).toBe(finished);
  });

  it('advances once when both players have locked', () => {
    const core = withBothLocked(createMatchCore(123));
    const ticked = tickMatchSession(playing(core));
    expect(ticked.phase).toBe('playing');
    expect(ticked.core.roundIndex).toBe(core.roundIndex + 1);
    expect(ticked.core.human.activePiece?.type).toBe(ticked.core.currentPiece);
    expect(ticked.core.jev.activePiece?.type).toBe(ticked.core.currentPiece);
    expect(ticked.core.human.lockedThisRound).toBe(false);
    expect(ticked.core.jev.lockedThisRound).toBe(false);
  });

  it('clears a line on one board while retaining the other board cells', () => {
    const base = createMatchCore(123);
    const humanBoard = createEmptyBoard().map((row) => [...row]);
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (x < 3 || x > 6) humanBoard[21][x] = 'T';
    }
    const jevBoard = createEmptyBoard();
    const core: MatchCoreState = {
      ...base,
      currentPiece: 'I',
      human: {
        ...base.human,
        board: humanBoard,
        activePiece: { type: 'I', rotation: 0, x: 3, y: 20 },
      },
      jev: {
        ...base.jev,
        board: jevBoard,
        activePiece: { type: 'I', rotation: 0, x: 3, y: 20 },
      },
    };
    const sourceHumanBoard = humanBoard.map((row) => [...row]);
    const sourceJevBoard = jevBoard.map((row) => [...row]);
    const cleared = tickMatchSession(playing(core));
    expect(cleared.core.roundIndex).toBe(core.roundIndex + 1);
    expect(cleared.core.human.board[21].every((cell) => cell === null)).toBe(true);
    expect(cleared.core.jev.board[21].slice(3, 7)).toEqual(['I', 'I', 'I', 'I']);
    expect(humanBoard).toEqual(sourceHumanBoard);
    expect(jevBoard).toEqual(sourceJevBoard);
  });
});
```

Construct the line-clear fixture by copying `createEmptyBoard()`, writing `'T'` into human row 21 at every column except 3–6, and setting both player active pieces to `{ type: 'I', rotation: 0, x: 3, y: 20 }`. Set `core.currentPiece` to `'I'`. Since an orientation-0 I occupies `y + 1`, one shared tick locks both pieces on row 21: the human clears that row and Jev keeps four I cells. Also assert the original fixture boards are unchanged after ticking.

For the regular progression fixture, call `playing(withBothLocked(createMatchCore(123)))`. After ticking, compare both source board references and values with their pre-tick snapshots to pin immutability.

For the ordinary progression test, create a core whose two players have `activePiece: null` and `lockedThisRound: true`, wrap it in a playing session, and tick once. For phase no-ops, make ready, paused, and finished sessions and assert the exact same reference is returned.

- [ ] **Step 2: Run the orchestration tests to verify they fail**

Run: `npm test -- src/game/match-session.test.ts`

Expected: FAIL because `tickMatchSession` does not exist.

- [ ] **Step 3: Implement the non-terminal shared tick path**

Add `tickMatchSession`. First return the exact state for any non-playing phase. Otherwise call `applySharedGravityTick`; when neither player topped out, call `advanceMatchRound` only if both `lockedThisRound` flags are true. Return a new `playing` state with the transitioned core and `result: null`. Do not call `setInterval` or import a browser API.

```ts
export function tickMatchSession(state: MatchSessionState): MatchSessionState {
  if (state.phase !== 'playing') return state;

  const tickedCore = applySharedGravityTick(state.core);
  const bothLocked =
    tickedCore.human.lockedThisRound && tickedCore.jev.lockedThisRound;
  const nextCore = bothLocked ? advanceMatchRound(tickedCore) : tickedCore;
  return { ...state, core: nextCore, phase: 'playing', result: null };
}
```

- [ ] **Step 4: Run progression tests and add failing gravity top-out tests**

Run: `npm test -- src/game/match-session.test.ts`

Expected: PASS for non-playing no-ops, automatic progression, and independent row clear.

Add these gravity tests after the baseline tick tests pass:

```ts
describe('tickMatchSession gravity top-outs', () => {
  it.each([
    { blockedPlayer: 'human' as const, winner: 'jev' as const },
    { blockedPlayer: 'jev' as const, winner: 'human' as const },
  ])('awards the surviving player when $blockedPlayer tops out', ({ blockedPlayer, winner }) => {
    const core = withGravityBlock(createMatchCore(123), blockedPlayer);
    const finished = tickMatchSession(playing(core));
    expect(finished.phase).toBe('finished');
    expect(finished.result).toEqual({ kind: 'win', winner });
    expect(finished.core[blockedPlayer].topOut).toBe(true);
    expect(finished.core.roundIndex).toBe(core.roundIndex);
    expect(tickMatchSession(finished)).toBe(finished);
  });

  it('draws when both players top out during the same gravity tick', () => {
    const core = withGravityBlock(
      withGravityBlock(createMatchCore(123), 'human'),
      'jev',
    );
    const finished = tickMatchSession(playing(core));
    expect(finished.phase).toBe('finished');
    expect(finished.result).toEqual({ kind: 'draw' });
    expect(finished.core.human.topOut).toBe(true);
    expect(finished.core.jev.topOut).toBe(true);
    expect(finished.core.roundIndex).toBe(core.roundIndex);
    expect(tickMatchSession(finished)).toBe(finished);
  });
});
```

`withGravityBlock` copies the blocked board, writes `'I'` into row 2 columns 3–5, and starts both players with the shared T at `{ x: 3, y: 0 }`. The blocked T cannot descend and locks into hidden rows. Applying it once for each player creates the simultaneous case.

- [ ] **Step 5: Implement gravity and terminal outcome resolution**

Add a private helper that maps top-out flags to results and returns `null` if neither is set. Use it immediately after `applySharedGravityTick`, before considering round advancement. If it returns a result, return phase `finished` with the ticked core. Do not advance after gravity top-out.

```ts
function resultForTopOut(core: MatchCoreState): MatchResult | null {
  if (core.human.topOut && core.jev.topOut) return { kind: 'draw' };
  if (core.human.topOut) return { kind: 'win', winner: 'jev' };
  if (core.jev.topOut) return { kind: 'win', winner: 'human' };
  return null;
}

// Inside tickMatchSession, immediately after applySharedGravityTick:
const gravityResult = resultForTopOut(tickedCore);
if (gravityResult !== null) {
  return { ...state, core: tickedCore, phase: 'finished', result: gravityResult };
}
```

Keep the rest of the non-terminal path from Step 3. Do not return a playing state with a stale result.

- [ ] **Step 6: Run gravity outcome tests and add failing spawn top-out tests**

Run: `npm test -- src/game/match-session.test.ts`

Expected: PASS for gravity top-out winner/draw resolution and finished-state tick immutability.

Add these next-spawn cases after gravity outcome tests pass:

```ts
describe('tickMatchSession spawn top-outs', () => {
  it('awards the other player when one next-round spawn is blocked', () => {
    const core = withSpawnBlocked(
      withBothLocked(createMatchCore(123)),
      'human',
    );
    const finished = tickMatchSession(playing(core));
    expect(finished.phase).toBe('finished');
    expect(finished.core.roundIndex).toBe(core.roundIndex + 1);
    expect(finished.core.human.topOut).toBe(true);
    expect(finished.core.human.activePiece).toBeNull();
    expect(finished.core.jev.topOut).toBe(false);
    expect(finished.core.jev.activePiece?.type).toBe(finished.core.currentPiece);
    expect(finished.result).toEqual({ kind: 'win', winner: 'jev' });
  });

  it('draws when both next-round spawns are blocked', () => {
    const core = withSpawnBlocked(
      withSpawnBlocked(withBothLocked(createMatchCore(123)), 'human'),
      'jev',
    );
    const finished = tickMatchSession(playing(core));
    expect(finished.phase).toBe('finished');
    expect(finished.core.roundIndex).toBe(core.roundIndex + 1);
    expect(finished.core.human.topOut).toBe(true);
    expect(finished.core.jev.topOut).toBe(true);
    expect(finished.result).toEqual({ kind: 'draw' });
  });
});
```

`withSpawnBlocked` writes `'I'` to every cell in hidden rows 0 and 1 and returns a copied player state. Each fixture starts with both players locked; the core then advances one round and attempts the same next-piece spawn for both.

- [ ] **Step 7: Resolve next-round spawn top-outs and finish the focused checks**

After `advanceMatchRound`, run the same result mapping against its returned core. If a result exists, return the session as `finished` with that advanced core; otherwise keep it `playing`. The completed transition is:

```ts
export function tickMatchSession(state: MatchSessionState): MatchSessionState {
  if (state.phase !== 'playing') return state;

  const tickedCore = applySharedGravityTick(state.core);
  const gravityResult = resultForTopOut(tickedCore);
  if (gravityResult !== null) {
    return { ...state, core: tickedCore, phase: 'finished', result: gravityResult };
  }

  const bothLocked =
    tickedCore.human.lockedThisRound && tickedCore.jev.lockedThisRound;
  const nextCore = bothLocked ? advanceMatchRound(tickedCore) : tickedCore;
  const spawnResult = resultForTopOut(nextCore);
  if (spawnResult !== null) {
    return { ...state, core: nextCore, phase: 'finished', result: spawnResult };
  }

  return { ...state, core: nextCore, phase: 'playing', result: null };
}
```

Then run:

Run: `npm test -- src/game/match-session.test.ts`

Expected: PASS for controls, progression, independent line clearing, gravity outcomes, spawn outcomes, and terminal no-ops.

Run: `npm run lint`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit tick orchestration and outcomes**

```sh
git add src/game/match-session.ts src/game/match-session.test.ts
git commit -m "feat: resolve shared match lifecycle outcomes"
```

### Task 3: Document lifecycle behavior and complete OpenSpec task 3.2

**Files:**
- Modify: `README.md`
- Modify: `openspec/changes/play-tetris-against-jev/tasks.md`

- [ ] **Step 1: Update README with the implemented lifecycle**

Update Current status to say the pure match-session lifecycle is implemented while browser controls/timer, Jev decision route, and playable UI remain pending. Update progress from 6 of 19 to 7 of 19 tasks complete. Add a `Match lifecycle` section describing the serializable phases, state-preserving pause/resume, immediate seeded restart, 700 ms tick ownership by the client, automatic next-round spawn after both locks, and win/draw outcomes. Preserve setup, installed skill, and agent tooling documentation.

- [ ] **Step 2: Run complete verification before marking the task complete**

Run: `npm test`

Expected: PASS for all engine, shared-core, and lifecycle suites.

Run: `npm run lint`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `openspec validate play-tetris-against-jev --strict --no-interactive`

Expected: `Change 'play-tetris-against-jev' is valid`.

- [ ] **Step 3: Mark only task 3.2 complete and verify OpenSpec progress**

Change `3.2` to `[x]` in `tasks.md`; leave tasks 4.1 and later unchecked. Then run:

```sh
openspec validate play-tetris-against-jev --strict --no-interactive
openspec status --change play-tetris-against-jev --json
rg -c '^\s*- \[x\]' openspec/changes/play-tetris-against-jev/tasks.md
```

Expected: validation succeeds, the status reports task 3.2 complete, and the checkbox count is `7`.

- [ ] **Step 4: Commit README and OpenSpec progress**

```sh
git add README.md openspec/changes/play-tetris-against-jev/tasks.md
git commit -m "docs: record match lifecycle task 3.2"
```

After implementation, review the complete diff and final verification output, push `feature/task-3-2-match-lifecycle`, update PR #8's body from design review to implementation summary, and mark it ready for review with `gh pr ready 8`. Do not merge it; the user merges manually.
