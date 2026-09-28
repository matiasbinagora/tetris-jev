# split-screen-interface Specification

## Purpose

Provides a desktop-first simultaneous view of the human board, Jev board, and Jev's structured decision data without presenting invented explanations as model reasoning.

## Requirements

### Requirement: Approved desktop layout
At the target desktop viewport, the game SHALL use two equal-width columns. The human board area SHALL fill the full left column (50% of the viewport area). By default, the right column SHALL place Jev's board in the upper 70% of that column (35% of the viewport area) and Jev's decision panel in the lower 30% (15% of the viewport area). The user MAY temporarily resize the two right-column panels.

#### Scenario: Render the desktop match
- **WHEN** the game is shown at its target desktop viewport
- **THEN** the human board fills the left half, Jev's smaller board appears at the upper right, and the decision panel appears below it

### Requirement: Resize Jev's board and decision panel
On desktop, the interface SHALL provide an accessible horizontal separator between Jev's board and the decision panel. Dragging the separator SHALL resize these panels while leaving the human column unchanged. The initial split SHALL be 70% / 30%; the Jev board SHALL remain between 50% and 80% of the right column. The separator SHALL support keyboard adjustment and expose its orientation and current, minimum, and maximum values to assistive technology. The adjustment MAY reset to the default after a page reload. At the responsive stacked layout, the separator SHALL be hidden and both panels SHALL remain visible in normal document flow.

#### Scenario: Enlarge Jev's information panel
- **WHEN** the user drags the separator upward
- **THEN** the Jev board area becomes shorter, the decision panel becomes taller, and the human area remains unchanged

#### Scenario: Resize with a keyboard
- **WHEN** the separator has focus and the user presses Up or Down
- **THEN** the split changes in the matching direction without exceeding its supported bounds

#### Scenario: Reach a resize bound
- **WHEN** the user moves the separator beyond either supported limit
- **THEN** the split stays within its minimum and maximum values

### Requirement: Show both players and match state
The interface SHALL show both boards simultaneously, identify each player, show each player's current and upcoming piece and survived-piece count, and make the match and Jev decision states visible, including ready, playing, manually paused, Jev pending, retry required, and finished states. The display SHALL make it clear when one player is ahead in the shared sequence.

#### Scenario: Show both boards during play
- **WHEN** a match is active
- **THEN** both independent boards, their sequence positions, and the match and Jev statuses are visible at the same time

#### Scenario: Show a paused or finished match
- **WHEN** the match is paused, waiting for a Jev retry, or finished
- **THEN** the interface communicates that state and provides only the valid next controls

### Requirement: Desktop keyboard controls
The interface SHALL support human movement with Left/Right arrows, soft drop with Down, clockwise rotation with Up or X, counter-clockwise rotation with Z, hard drop with Space, and manual pause/resume with P. During an active match, game keys SHALL work without requiring the human board to have focus. They SHALL prevent page scrolling when handled as game controls. The handler SHALL leave editable fields, native button activation, input composition, and Ctrl/Meta/Alt browser shortcuts alone. Start and Resume controls SHALL return visible focus to the human play area. The interface SHALL display the controls.

#### Scenario: Control the human piece
- **WHEN** the human presses a movement, rotation, soft-drop, or hard-drop key during active play
- **THEN** only the human board applies that action using the game rules

#### Scenario: Play after using a match button
- **WHEN** the player starts or resumes a match by clicking a button and then presses a game key
- **THEN** the key controls the human piece without an additional click on the board

#### Scenario: Pause from the keyboard
- **WHEN** the human presses P during active play
- **THEN** human gravity and Jev progression pause

### Requirement: Present Jev decision facts
The decision panel SHALL show Jev's selected placement, its returned probability, up to three highest-probability alternatives from the submitted shortlist with their returned probabilities, and computed board effects for the selected placement and alternatives. Board effects SHALL be derived by simulating each legal placement and SHALL include lines cleared, resulting aggregate height, holes, and adjacent-column bumpiness. Aggregate height SHALL be the sum of the ten column heights; a hole SHALL be an empty cell below an occupied cell in the same column; bumpiness SHALL be the sum of absolute height differences between adjacent columns. The panel SHALL label these as calculated outcomes and label probabilities as relative to the shortlist. It SHALL NOT invent natural-language reasoning for Jev.

#### Scenario: Show a successful Jev decision
- **WHEN** Jev returns a placement and choice probabilities
- **THEN** the panel shows the selected placement, its probability, ranked alternatives, computed outcomes, and available latency or usage metrics

#### Scenario: A metric is absent from the API response
- **WHEN** Jev does not return a latency or usage metric
- **THEN** the interface marks that metric unavailable rather than estimating or fabricating it
