# Spec Delta

## Purpose

Lets Jev choose among a deterministic shortlist of strategically evaluated legal Tetris landings through the TypeSafe decision API while protecting the API key and making delays and failures recoverable without substituting another player.

## ADDED Requirements

### Requirement: Make a typed Jev placement decision
For each Jev piece, the system SHALL enumerate all legal final placements from Jev's board, simulate their outcomes and one-piece lookahead using the known next sequence piece, and deterministically shortlist at most 12 placements. A local score MAY rank or filter candidates but SHALL NOT choose the applied placement. The system SHALL send the board, current and next piece, and the shortlisted candidates with calculated Tetris outcomes to Jev as one typed `choice` decision. Jev SHALL make the final choice; the system SHALL apply only a returned identifier that matches a shortlisted legal placement. It SHALL NOT use a heuristic, random selection, or another model as a fallback decision maker.

The engine SHALL include only landing footprints reachable from the active piece through collision-legal left, right, down, and SRS rotation transitions. It SHALL represent each distinct occupied-cell footprint once, assign it a stable identifier, and simulate its locked board, line clears, top-out, and board metrics without mutating the source board. Shortlisting SHALL reject top-out placements when any non-top-out placement exists, retain every distinct line-clear count when space permits, and break score ties by stable candidate ID. The model descriptions SHALL include immediate lines cleared, resulting holes, height, bumpiness, and best known-next-piece follow-up; these are computed outcomes, not model reasoning.

#### Scenario: A line-clearing placement is available
- **WHEN** a legal current-piece placement clears lines and survives
- **THEN** the shortlist includes a highest-scoring placement for that line-clear count when the shortlist has capacity, and Jev receives its calculated outcomes

#### Scenario: Jev returns a legal choice
- **WHEN** the Jev API returns a submitted candidate identifier
- **THEN** the system applies that placement to Jev's board and records the choice probabilities returned for the shortlisted candidates

#### Scenario: Jev returns an unknown choice
- **WHEN** the response is malformed or its selected identifier is not among the submitted candidates
- **THEN** the system keeps the match paused and exposes a retryable error without changing Jev's board

### Requirement: Keep Jev credentials server-side
The browser SHALL call a same-origin server route for Jev decisions. The route SHALL read `JEV_API_KEY` from its server environment and SHALL never return or embed the key in browser-visible responses, assets, or logs. The route SHALL validate the seed, Jev sequence cursor, current and next piece types, board dimensions, shortlist count, and the exact canonical shortlist and landing poses before making one upstream Jev call. The server SHALL compute candidate descriptions itself rather than trusting client-supplied scores or prose.

#### Scenario: Valid decision request
- **WHEN** the browser submits a structurally valid board, piece, and canonical legal shortlist
- **THEN** the server route calls Jev using its server-only key and returns only the decision result and safe metadata

#### Scenario: Missing API key
- **WHEN** the route receives a decision request without `JEV_API_KEY` configured
- **THEN** it returns a safe configuration error and does not call the upstream API

#### Scenario: Invalid decision request
- **WHEN** a request includes an invalid board, piece, or candidate placement
- **THEN** the route rejects it before calling Jev

### Requirement: Pause and retry on Jev delay or failure
The server request SHALL have an eight-second deadline. While it is pending or retry-required, only Jev progression SHALL stop. The human SHALL continue playing unless the match is manually paused or finished. On timeout or failure, Jev SHALL preserve the exact seed, sequence cursor, board, piece, next piece, and shortlist, and offer an explicit retry. A retry SHALL call Jev again for that same state; it SHALL NOT replace Jev or advance Jev's board. If the match finishes before a late response arrives, that response SHALL be ignored.

#### Scenario: Jev decision is pending
- **WHEN** a round is awaiting a Jev decision
- **THEN** Jev's board remains unchanged, the human may keep playing, and the interface shows that Jev is deciding

#### Scenario: Jev request fails
- **WHEN** a timeout, network error, or upstream error prevents a usable decision
- **THEN** Jev's board remains unchanged with a retry action while the human may continue

#### Scenario: Retry the same decision
- **WHEN** the player retries after a Jev request failure
- **THEN** the server receives the byte-identical Jev decision snapshot and Jev remains stopped until a valid response arrives

### Requirement: Report Jev decision metadata
For each successful decision, the system SHALL retain the selected candidate, per-shortlist-candidate probabilities, and any latency, token usage, or cost metrics returned by Jev. The interface SHALL label these probabilities as relative to the submitted shortlist, not as the chance of clearing a line or as a measure of move quality. The system SHALL present only metrics actually returned by Jev and SHALL NOT describe probabilities or calculated board effects as natural-language reasoning.

#### Scenario: Record returned metadata
- **WHEN** Jev returns a successful choice with probabilities and usage metadata
- **THEN** the UI displays those returned values alongside the selected placement and calculated board effects
