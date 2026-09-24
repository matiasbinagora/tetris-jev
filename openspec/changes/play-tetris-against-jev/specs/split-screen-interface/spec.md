# Spec Delta

## Purpose

Provides a desktop-first simultaneous view of the human board, Jev board, and Jev's structured decision data without presenting invented explanations as model reasoning.

## ADDED Requirements

### Requirement: Approved desktop layout
At the target desktop viewport, the game SHALL use two equal-width columns. The human board area SHALL fill the full left column (50% of the viewport area). The right column SHALL place Jev's board in the upper 70% of that column (35% of the viewport area) and Jev's decision panel in the lower 30% (15% of the viewport area).

#### Scenario: Render the desktop match
- **WHEN** the game is shown at its target desktop viewport
- **THEN** the human board fills the left half, Jev's smaller board appears at the upper right, and the decision panel appears below it

### Requirement: Show both players and match state
The interface SHALL show both boards simultaneously, identify each player, show the current shared piece and upcoming piece, and make the shared match state visible, including ready, playing, paused, Jev pending, retry required, and finished states.

#### Scenario: Show both boards during play
- **WHEN** a match is active
- **THEN** both independent boards and the shared match status are visible at the same time

#### Scenario: Show a paused or finished match
- **WHEN** the match is paused, waiting for a Jev retry, or finished
- **THEN** the interface communicates that state and provides only the valid next controls

### Requirement: Desktop keyboard controls
The interface SHALL support human movement with Left/Right arrows, soft drop with Down, clockwise rotation with Up or X, counter-clockwise rotation with Z, hard drop with Space, and pause/resume with P. It SHALL prevent game controls from scrolling the page while the game has keyboard focus and SHALL display the controls.

#### Scenario: Control the human piece
- **WHEN** the human presses a movement, rotation, soft-drop, or hard-drop key during active play
- **THEN** only the human board applies that action using the game rules

#### Scenario: Pause from the keyboard
- **WHEN** the human presses P during active play
- **THEN** both boards and the shared gravity clock pause

### Requirement: Present Jev decision facts
The decision panel SHALL show Jev's selected placement, its returned probability, up to three highest-probability alternatives with their returned probabilities, and computed board effects for the selected placement and alternatives. Board effects SHALL be derived by simulating each legal placement and SHALL include lines cleared, resulting aggregate height, holes, and adjacent-column bumpiness. Aggregate height SHALL be the sum of the ten column heights; a hole SHALL be an empty cell below an occupied cell in the same column; bumpiness SHALL be the sum of absolute height differences between adjacent columns. The panel SHALL label these as calculated outcomes and SHALL NOT invent natural-language reasoning for Jev.

#### Scenario: Show a successful Jev decision
- **WHEN** Jev returns a placement and choice probabilities
- **THEN** the panel shows the selected placement, its probability, ranked alternatives, computed outcomes, and available latency or usage metrics

#### Scenario: A metric is absent from the API response
- **WHEN** Jev does not return a latency or usage metric
- **THEN** the interface marks that metric unavailable rather than estimating or fabricating it
