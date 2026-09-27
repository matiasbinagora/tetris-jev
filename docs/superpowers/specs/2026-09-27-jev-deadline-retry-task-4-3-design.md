# Jev Deadline, Pause, and Retry (Task 4.3) Design

## Purpose

Implement the approved Jev decision lifecycle so a slow or failed request cannot advance either board, and a retry asks Jev about the exact same match snapshot. The work covers the eight-second server deadline and a testable client decision coordinator. The later interface tasks render the pending and retry-required states.

## Existing Context

- `MatchCoreState` is serializable and contains the normalized match seed, independent player boards, active pieces, and round locks.
- `MatchSessionState` provides pure `playing`, `paused`, and `finished` lifecycle transitions.
- `POST /api/jev/decision` currently accepts the Jev board, active piece, and legal candidates; it validates them and returns a canonical candidate and probabilities.
- The home page is still a placeholder. OpenSpec tasks 5.1 and 5.4 own visible state presentation and browser end-to-end flow coverage.

## Confirmed Decisions

- The decision snapshot includes the match seed, board, active piece, and complete candidate set. Each same-origin POST includes that seed so retries can be asserted to repeat the full snapshot.
- The server validates the seed as an unsigned 32-bit integer and does not include it in the TypeSafe payload. TypeSafe receives only the game board, piece, and legal choice criteria.
- Jev request coordination lives in a separate pure client-side state module. It does not add network concerns or Jev-specific fields to the generic `MatchSessionState`.
- The upstream deadline is eight seconds and covers both the fetch and reading the response body. Timeout returns the existing generic `jev_upstream_failed` response.
- A pending or failed decision keeps the shared session paused and unchanged. Failure retains the original snapshot for an explicit retry. There is no automatic retry, heuristic fallback, alternate model, or resume while the decision is unresolved.
- On a valid response, the coordinator uses the candidate from the captured canonical snapshot, locks Jev's board, resolves a top-out or the two-player round barrier, and resumes the match if it is not finished.
- This task exposes serializable pending and retry-required state for later UI work; it does not build the visible page or controls.

## Architecture

### Server deadline

Add an eight-second deadline around the complete TypeSafe HTTP operation in `app/api/jev/decision/route.ts`. An `AbortController` cancels the upstream request at the deadline; deadline handling also ensures a response whose body never finishes cannot hold the route open. The timer is cleared on success and failure. Timeout, transport errors, non-success responses, and unusable JSON continue to produce the generic 502 body; no upstream body, exception, or credential is returned.

Extend `JevDecisionRequest` with a required `seed` field for the client decision contract. Validate it as an integer from `0` through `0xffffffff`. Add it to `ValidatedJevDecision` so the validated request retains the exact snapshot identifier, but keep `buildJevChoicePayload` unchanged with respect to model input: the seed is not forwarded to TypeSafe. Update route and pure request fixtures to supply a seed.

### Pure decision coordinator

Add a module under `src/game/` that models one Jev decision attempt independently of React and fetch. Its serializable state pairs the paused `MatchSessionState` with:

- a snapshot containing the seed, Jev board, active piece, and complete canonical `LandingCandidate[]` results, including their simulated boards and effects;
- a status of `pending`, `retry-required`, or `complete`;
- an attempt number to reject stale results from an earlier retry;
- the mapped result only after a valid response.

Starting an attempt is allowed only while the match is playing and Jev has an active piece. It enumerates the legal candidates once, snapshots the request values, and pauses the shared session. Marking an attempt failed preserves the paused session and snapshot. Retrying is allowed only from `retry-required`, reuses the exact snapshot, and advances the attempt number. Only a response for the current attempt can complete the decision.

The success transition resolves the returned `choice` only against candidates in the captured snapshot. It ignores any candidate simulation supplied by the response. It applies the canonical candidate's board and top-out state to Jev, marks Jev locked for the round, resolves single/double top-out consistently with `MatchSessionState`, and advances the round only when the human has also locked. A non-terminal match resumes playing; a terminal result remains finished. The successful response metadata remains available to the future decision panel.

Add a small client fetch adapter that posts the complete snapshot to `/api/jev/decision` and converts non-2xx, transport, timeout, and malformed responses into a retryable failure without exposing raw details. The adapter contains no match transitions; the pure coordinator remains responsible for state changes.

## State Flow

```text
playing
  -> capture seed + board + piece + legal candidates
  -> paused / pending (both boards and gravity unchanged)
       -> valid response for current attempt
            -> apply captured canonical Jev candidate
            -> resolve top-out or lock barrier
            -> playing, or finished
       -> timeout / network / server / invalid response
            -> paused / retry-required (same snapshot)
                 -> explicit retry
                      -> paused / pending (same POST body, next attempt number)
```

## Error and Security Boundaries

- The TypeSafe API key remains server-only and is never logged or returned.
- Retry requests include the same match seed and decision fields, but each request still contains only the server-validated board, piece, and candidates in the TypeSafe prompt. The captured `LandingCandidate[]` is serialized to the route as `{ id, lockedPiece }` pairs; its client-side canonical simulations are used only to apply the selected result safely.
- Any timeout or unusable response leaves both board records and the shared seed/round unchanged.
- A late response from a superseded attempt is ignored by its attempt number.
- Only an explicit retry makes another upstream call; no local move is selected when Jev is unavailable.

## Testing

- Route tests verify the upstream request receives an abort signal, the deadline is enforced while waiting for headers and while reading the body, the timer does not remain active after early success, and timeout returns the same generic 502 without leaking details.
- Request validation tests accept boundary seed values and reject fractions, negatives, and values above the unsigned 32-bit range. Payload tests confirm the seed is not forwarded upstream.
- Coordinator tests prove begin/pending/failure preserve both boards, the seed, piece, and round; retry emits the same serialized request and candidate set; an earlier attempt cannot apply after retry; and valid success locks the canonical candidate, advances only at the shared barrier, resumes non-terminal matches, and resolves top-out.
- Client adapter tests prove it posts the unchanged snapshot and turns network, non-2xx, timeout, and malformed response outcomes into a retryable failure without exposing response details.
- Visible pending/error labels and browser end-to-end interaction remain in tasks 5.1 and 5.4.

## Scope Boundaries

- Task 4.3 only. It does not build the game screen, keyboard controls, decision panel, local `.env.local` instructions, or Vercel deployment.
- It adds no package dependency, server-side match persistence, accounts, multiplayer, fallback decision maker, or automatic retry.
- It does not change the shared seven-bag sequence, gravity interval, Tetris movement rules, or the previously approved 4.1/4.2 response contract beyond requiring and validating the match seed on the route request.
