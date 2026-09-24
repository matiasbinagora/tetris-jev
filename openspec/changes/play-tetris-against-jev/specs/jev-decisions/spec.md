# Spec Delta

## Purpose

Lets Jev choose a legal Tetris landing through the TypeSafe decision API while protecting the API key and making delays and failures recoverable without substituting another player.

## ADDED Requirements

### Requirement: Make a typed Jev placement decision
For each Jev piece, the system SHALL enumerate the legal final placements from Jev's board and send the board, piece, and candidate placements to the Jev decision API as one typed `choice` decision. The submitted choice SHALL contain no more than 255 candidates. The system SHALL apply only a returned candidate identifier that matches one of the submitted legal placements. It SHALL NOT use a local heuristic or another model to choose a placement.

#### Scenario: Jev returns a legal choice
- **WHEN** the Jev API returns a submitted candidate identifier
- **THEN** the system applies that placement to Jev's board and records the choice probabilities returned for the submitted candidates

#### Scenario: Jev returns an unknown choice
- **WHEN** the response is malformed or its selected identifier is not among the submitted candidates
- **THEN** the system keeps the match paused and exposes a retryable error without changing Jev's board

### Requirement: Keep Jev credentials server-side
The browser SHALL call a same-origin server route for Jev decisions. The route SHALL read `JEV_API_KEY` from its server environment and SHALL never return or embed the key in browser-visible responses, assets, or logs. The route SHALL validate board dimensions, piece type, candidate count, and candidate legality before making one upstream Jev call.

#### Scenario: Valid decision request
- **WHEN** the browser submits a structurally valid board, piece, and legal candidate set
- **THEN** the server route calls Jev using its server-only key and returns only the decision result and safe metadata

#### Scenario: Missing API key
- **WHEN** the route receives a decision request without `JEV_API_KEY` configured
- **THEN** it returns a safe configuration error and does not call the upstream API

#### Scenario: Invalid decision request
- **WHEN** a request includes an invalid board, piece, or candidate placement
- **THEN** the route rejects it before calling Jev

### Requirement: Pause and retry on Jev delay or failure
The shared match SHALL pause both boards and gravity while awaiting Jev's decision. The server request SHALL have an eight-second deadline. If the request times out or fails, the match SHALL remain paused, preserve the exact board, piece, seed, and candidate set, and offer an explicit retry. A retry SHALL call Jev again for that same state; it SHALL NOT replace Jev or advance either board.

#### Scenario: Jev decision is pending
- **WHEN** a round is awaiting a Jev decision
- **THEN** both boards and shared gravity remain paused and the interface shows that Jev is deciding

#### Scenario: Jev request fails
- **WHEN** a timeout, network error, or upstream error prevents a usable decision
- **THEN** both boards remain unchanged and paused with a retry action

#### Scenario: Retry the same decision
- **WHEN** the player retries after a Jev request failure
- **THEN** the server receives the same match state and legal candidate set and the match remains paused until a valid Jev response arrives

### Requirement: Report Jev decision metadata
For each successful decision, the system SHALL retain the selected candidate, per-candidate probabilities, and any latency, token usage, or cost metrics returned by Jev. The system SHALL present only metrics actually returned by Jev and SHALL NOT describe probabilities or calculated board effects as natural-language reasoning.

#### Scenario: Record returned metadata
- **WHEN** Jev returns a successful choice with probabilities and usage metadata
- **THEN** the UI displays those returned values alongside the selected placement and calculated board effects
