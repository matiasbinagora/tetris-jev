# Spec Delta

## Purpose

Defines a head-to-head match in which human and Jev play independent boards at their own pace while receiving the same seeded piece at each sequence position.

## ADDED Requirements

### Requirement: Shared sequence with independent progression
Each match SHALL generate one deterministic seven-bag tetromino sequence from its seed. Each player SHALL have a separate sequence cursor and SHALL receive the same piece type at the same cursor position. A player SHALL receive its next piece immediately after its current piece locks without waiting for the other player. The human board SHALL use a 700 ms gravity interval; Jev SHALL lock its chosen legal landing when its decision completes and MAY proceed to the next piece independently. Jev SHALL make no more than one decision request at a time.

#### Scenario: One player moves ahead
- **WHEN** Jev locks sequence item 3 while the human still plays item 2
- **THEN** Jev may start item 4, the human remains on item 2, and both players receive the same piece type when each reaches a given item

#### Scenario: Apply human gravity
- **WHEN** a human gravity tick occurs during active play
- **THEN** only the human active piece moves or locks, and Jev's board and sequence cursor remain unchanged

### Requirement: Independent board outcomes
The human and Jev boards SHALL maintain independent settled cells, line clears, top-out state, and survived-piece counts. A line clear or placement on one board SHALL NOT alter the other board. A piece SHALL count as survived only after it locks without top-out; a spawn top-out SHALL NOT increment the count.

#### Scenario: Clear a line on one board
- **WHEN** a piece completes a line on one player's board
- **THEN** only that player's board removes the line

### Requirement: Match controls and pauses
The match SHALL support start, manual pause, resume, and immediate seeded restart. Manual pause SHALL stop human gravity and Jev progression without losing an in-flight Jev result; its result MAY be retained but SHALL NOT be applied until resume. Jev decision pending or retry-required SHALL stop only Jev progression; human gravity and controls SHALL continue unless the match is manually paused or finished. Restart SHALL create a fresh seed, reset both boards, cursors, counts, decisions, and result, and start playing immediately.

#### Scenario: Jev request is pending or fails
- **WHEN** Jev waits for an API response or requires retry
- **THEN** the human may continue playing and Jev's board and cursor remain unchanged

#### Scenario: Pause and resume
- **WHEN** the player pauses and later resumes the match
- **THEN** both players stop progressing while paused and continue from the same states afterward

#### Scenario: Restart a match
- **WHEN** the player restarts
- **THEN** both boards, sequence cursors, counters, and result reset for a new seeded match that is already playing

### Requirement: Determine the winner by survival
After a player tops out, the other SHALL continue if needed to establish which player survived more pieces from the shared sequence. The match SHALL finish when the surviving player has already survived more pieces, surpasses the topped-out player's count, or also tops out. The player with more survived pieces SHALL win. Equal survived counts after both top out SHALL be a draw. A finished match SHALL ignore late Jev responses.

#### Scenario: The faster player tops out first
- **WHEN** Jev tops out after surviving 10 pieces while the human has survived 4
- **THEN** the human continues until it survives an eleventh piece or also tops out, and the result is determined from the final survived counts

#### Scenario: The slower player tops out
- **WHEN** the human tops out after surviving 4 pieces while Jev has already survived 10
- **THEN** the match finishes immediately with Jev as winner

#### Scenario: Equal survival
- **WHEN** both players top out after surviving the same number of pieces
- **THEN** the match finishes in a draw
