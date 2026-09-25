# Spec Delta

## Purpose

Defines a fair head-to-head match in which the human and Jev receive the same seeded piece sequence and share one gravity clock while maintaining separate boards.

## ADDED Requirements

### Requirement: Shared piece sequence and gravity clock
Each match SHALL generate one deterministic sequence of standard seven-bag tetrominoes from a match seed and supply the same piece at the same round to both boards. Both boards SHALL use one shared gravity clock and the same fixed gravity interval for the duration of the match. The next round SHALL begin only after both boards have locked their current piece.

#### Scenario: Begin a shared round
- **WHEN** a match starts or both boards have locked the current round's piece
- **THEN** the next piece in the shared sequence becomes active on both boards

#### Scenario: Advance shared gravity
- **WHEN** a gravity tick occurs during an active round
- **THEN** every board with an active piece applies that same tick to its piece

### Requirement: Independent board outcomes
The human and Jev boards SHALL maintain independent settled cells, line clears, and top-out state. A line clear or placement on one board SHALL NOT alter the other board.

#### Scenario: Clear a line on one board
- **WHEN** a piece completes a line on one player's board
- **THEN** only that player's board removes the line

### Requirement: Match controls and shared pause
The match SHALL support start, manual pause, resume, and restart. Pausing SHALL stop the shared gravity clock for both boards; resuming SHALL continue the same sequence and board states. Restart SHALL create a fresh seed, reset both boards and the match result, and start the new match immediately.

#### Scenario: Pause and resume
- **WHEN** the player pauses and later resumes the match
- **THEN** gravity stops on both boards while paused and continues from the same states after resume

#### Scenario: Restart a match
- **WHEN** the player restarts
- **THEN** both boards, sequence position, counters, and result reset for a new seeded match that is already playing

### Requirement: Determine the winner
The match SHALL end as soon as a board tops out. The surviving player SHALL win. If both boards top out on the same shared gravity tick or shared-round spawn, the match SHALL be recorded as a draw.

#### Scenario: One player tops out
- **WHEN** exactly one board tops out
- **THEN** the match ends and the other player is declared the winner

#### Scenario: Both players top out together
- **WHEN** both boards top out in the same shared event
- **THEN** the match ends in a draw
