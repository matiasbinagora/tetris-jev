# Spec Delta

## Purpose

Defines deterministic Tetris board rules that both the human player and Jev can use, inspect, and verify consistently.

## ADDED Requirements

### Requirement: Board and piece rules
The game SHALL use a 10-column board with 20 visible rows and the seven standard tetromino types (I, O, T, S, Z, J, and L). Each tetromino SHALL have a deterministic set of orientations and spawn position.

#### Scenario: Spawn a tetromino
- **WHEN** a new round supplies a tetromino to a board
- **THEN** the piece appears at that board's defined spawn position and orientation

### Requirement: Legal movement and rotation
The game SHALL reject any movement or rotation that would place a piece outside the board or overlap settled cells. Rotation SHALL use the documented deterministic wall-kick order and SHALL leave the piece unchanged when no tested position is legal.

#### Scenario: Reject an illegal move
- **WHEN** a movement or rotation would overlap a settled cell or cross a board boundary
- **THEN** the piece remains at its previous legal position

#### Scenario: Rotate beside a wall
- **WHEN** a rotation's default position is blocked but a configured wall-kick candidate is legal
- **THEN** the piece rotates at the first legal candidate in the documented order

### Requirement: Gravity and piece locking
The game SHALL move each active piece down by one cell for each shared gravity tick. The human player SHALL be able to soft-drop and hard-drop; hard drop SHALL move the piece to its lowest legal position and lock it immediately. A piece SHALL lock when it cannot move down on a gravity tick.

#### Scenario: Apply a gravity tick
- **WHEN** the shared clock emits a gravity tick while a board has an active piece
- **THEN** that piece moves down one cell if the destination is legal, or locks if it is not

#### Scenario: Hard-drop the human piece
- **WHEN** the human presses the hard-drop control
- **THEN** the active piece locks at its lowest legal position

### Requirement: Line clearing and top-out
The game SHALL remove every fully occupied row after a piece locks and shift rows above it down. A board SHALL top out when a newly spawned piece cannot occupy its spawn position or when a locked piece occupies a hidden row above the visible board.

#### Scenario: Clear completed rows
- **WHEN** a locked piece completes one or more rows
- **THEN** all completed rows are removed together and the board reports the number cleared

#### Scenario: Detect top-out at spawn
- **WHEN** a board cannot place its next piece at the spawn position
- **THEN** that board enters the top-out state

#### Scenario: Detect top-out above the visible board
- **WHEN** a piece locks with one or more cells above the visible board
- **THEN** that board enters the top-out state
