## Context

The client currently applies a valid Jev response by locking the selected board immediately and advancing Jev's sequence cursor. A cadence delay follows before the next API request, but it does not show how Jev's current piece reaches its selected landing. `MatchApp` stores only one completed decision and passes `null` to `JevDecisionPanel` whenever a new decision is pending or retry-required, so the previous result disappears between pieces.

The match engine and API contract are already pure and deterministic. This change is confined to the client presentation and match orchestration. The human board must keep its own gravity and controls while Jev is deciding or animating.

## Goals / Non-Goals

**Goals:**

- Make each accepted Jev landing visible as two staged movements: first to the midpoint of the path, then to the selected landing.
- Use approximately 300 ms for each stage, then lock the exact server-validated selected board and continue Jev's existing independent cadence.
- Freeze an in-progress animation on manual pause and resume from that stage without losing the accepted result.
- Retain the latest five successful Jev decisions through subsequent pieces and pending/retry states, until a new match begins.
- Track and display a score per player; each line cleared on a player's own board adds exactly one point, and a new match resets both scores.
- Freeze the decision panel's currently visible history snapshot on request without pausing gameplay, API calls, or internal history updates; returning to live view selects the newest decision.
- Keep decision facts honest: display only returned probabilities and metrics and computed board outcomes.

**Non-Goals:**

- Changing candidate generation, server validation, the TypeSafe request, or which model choice is applied.
- Changing human gravity, human controls, board rules, the decision cadence, or the match winner rules.
- Adding persistence across reloads or matches.
- Using line score to change the existing survival-based match winner.

## Decisions

### Stage Jev's accepted landing before locking

After validating a successful response, keep Jev's settled board and active piece snapshot available for display and create a client presentation state containing the selected candidate, decision facts, and current animation stage. Move the rendered piece to the interpolated midpoint of the spawn-to-landing pose for 300 ms, then to the exact selected pose for another 300 ms. Only after the second stage completes, apply the validated board through the existing pure match transition. Start the next Jev request only after that lock and the existing cadence.

This keeps game rules and server-selected outcomes unchanged while making the choice observable. A CSS transition can interpolate the visible pose; the eventual board always comes from the server-validated candidate, not from the visual interpolation. Respect `prefers-reduced-motion` by applying the selected landing immediately.

While the landing is in progress, human gravity and input continue normally. Manual pause cancels the active stage timer while preserving the current stage and accepted result; resume restarts that stage. Restart or match completion discards an unfinished landing so stale work cannot alter the new or finished match.

### Keep a bounded decision history

Replace the single `lastDecision` view value with a newest-first list of at most five accepted decisions for the current match. Record a valid choice once, including its sequence index, immutable request snapshot, returned probabilities, and available metrics. Keep the most recent record expanded in the panel and render earlier records as compact expandable entries. Do not hide the list when another decision begins, is pending, or needs retry. A failed or malformed response is not a completed decision. Starting a new match clears the list.

Five entries provide a useful demo history without making the decision panel unbounded. The existing resizable panel lets the presenter allocate more space when inspecting older entries.

### Track line score per player

Add a serializable score field to each independent player state. Every lock transition receives the actual `linesCleared` result from the deterministic board engine and adds that number to that player's score. Movement, soft drop, spawn, and locks that clear no rows do not change the score. A lock that clears rows awards those points even if the same lock tops out, because the rows were removed from that player's board. New match construction initializes both scores to zero. The score is displayed with each player's board and remains informational; match winners continue to be decided by survived pieces.

### Freeze a decision history snapshot

The decision panel receives the live bounded history and a frozen snapshot owned by match presentation state. Activating Freeze captures the exact rendered history and selected/expanded record. Subsequent successful decisions continue to update live history but do not replace the frozen snapshot. The panel indicates that it is frozen and offers a Resume live control. Resuming discards the snapshot and displays the current newest history, including any decisions completed while frozen. This control does not touch match pause state, decision requests, retry state, or the history ring buffer. Starting a new match clears both live and frozen decision state.

### Keep responsibilities separated

The presentation lifecycle belongs in the client match orchestration because the API has already returned a validated decision before animation begins. The pure match engine remains responsible for applying a final landing and counting survival only when the piece locks. `BoardView` receives a visual piece pose while the landing stage is active; it does not mutate the board. `JevDecisionPanel` receives a bounded list of immutable completed-decision facts and owns the expand/collapse UI.

## Risks / Trade-offs

- The 600 ms landing makes Jev progress more slowly. This is the requested demo pacing; the human clock remains independent.
- A timeout or pause could otherwise leave an animation timer running. Tie each timer to the active match, decision, stage, and playing phase; cleanup and stale-token checks discard obsolete callbacks.
- Interpolated visual poses may not trace every legal path used during candidate enumeration. Treat the movement as presentation only and apply the exact validated landing at completion.
- Older decision details add panel content. Keep only five entries, collapse older entries by default, and preserve the existing panel resizer.
- A frozen snapshot intentionally may be older than the five live history records after enough decisions; it is scoped to the current match and is discarded on Resume live or New match.

## Migration Plan

No data migration is required. Decision history is in-memory state and resets when the user starts a new match or reloads the page. The server route and environment configuration do not change.

## Open Questions

None.
