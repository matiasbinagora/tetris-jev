# Spec Delta

## MODIFIED Requirements

### Requirement: Shared sequence with independent progression
Each match SHALL generate one deterministic seven-bag tetromino sequence from its seed. Each player SHALL have a separate sequence cursor and SHALL receive the same piece type at the same cursor position. A player SHALL receive its next piece immediately after its current piece locks without waiting for the other player. The human board SHALL use a 700 ms gravity interval. After Jev returns a valid placement, the interface SHALL show the selected piece landing in two visible stages of approximately 300 ms each; Jev SHALL lock the selected legal landing only after both stages complete. Jev SHALL proceed to the next piece independently after the landing and SHALL make no more than one decision request at a time.

#### Scenario: One player moves ahead
- **WHEN** Jev locks sequence item 3 while the human still plays item 2
- **THEN** Jev may start item 4, the human remains on item 2, and both players receive the same piece type when each reaches a given item

#### Scenario: Apply human gravity
- **WHEN** a human gravity tick occurs during active play
- **THEN** only the human active piece moves or locks, and Jev's board and sequence cursor remain unchanged

#### Scenario: Show Jev's chosen landing
- **WHEN** Jev returns a valid selected placement during active play
- **THEN** the selected piece moves through a midpoint stage and then its chosen landing for approximately 300 ms per stage, Jev locks only after the second stage, and the human board continues playing

#### Scenario: Honor reduced-motion preference
- **WHEN** the user has requested reduced motion
- **THEN** Jev applies the selected landing without the two-stage animation

### Requirement: Match controls and pauses
The match SHALL support start, manual pause, resume, and immediate seeded restart. Manual pause SHALL stop human gravity and Jev progression without losing an in-flight Jev result; its result MAY be retained but SHALL NOT be applied until resume. Manual pause during Jev's landing animation SHALL freeze its current stage and retain the accepted result until resume. Jev decision pending or retry-required SHALL stop only Jev progression; human gravity and controls SHALL continue unless the match is manually paused or finished. Restart SHALL create a fresh seed, reset both boards, cursors, counts, decisions, and result, and start playing immediately.

#### Scenario: Jev request is pending or fails
- **WHEN** Jev waits for an API response or requires retry
- **THEN** the human may continue playing and Jev's board and cursor remain unchanged

#### Scenario: Pause and resume
- **WHEN** the player pauses and later resumes the match
- **THEN** both players stop progressing while paused and continue from the same states afterward

#### Scenario: Pause during Jev's landing
- **WHEN** the player pauses during either stage of Jev's selected landing
- **THEN** Jev remains at the current visual stage and resumes that stage after the match resumes, while the accepted choice is preserved

#### Scenario: Restart a match
- **WHEN** the player restarts
- **THEN** both boards, sequence cursors, counters, and result reset for a new seeded match that is already playing
