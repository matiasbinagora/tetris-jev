## Why

Jev locks its selected landing immediately, so a fast decision can be difficult to follow during a live demo. The decision panel also hides while the next request is pending and retains only one result, making prior decisions unavailable just when the audience may want to inspect them.

## What Changes

- Show Jev's selected placement landing in two visible stages before locking it, while the human board continues independently.
- Pause and resume an in-progress Jev landing animation with the match; do not lose the accepted decision.
- Retain the five most recent successful Jev decisions for the current match. Keep the newest decision's details visible and let users expand older entries.
- Keep the decision history visible while Jev is deciding or waiting for a retry, and clear it when a new match starts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `synchronized-match`: Jev shows a two-stage landing before locking, and manual pause freezes and resumes that progression.
- `split-screen-interface`: the decision panel retains and exposes the five most recent successful decisions throughout the match.

## Impact

- Changes the client match presentation state, Jev board rendering, decision panel, and related CSS.
- Leaves the Jev API request and response contract unchanged; no new dependencies or server changes are needed.
- Adds deterministic unit and UI coverage for staged progression, pause/resume, history retention, and reset behavior.
