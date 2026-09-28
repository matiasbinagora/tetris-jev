# Spec Delta

## MODIFIED Requirements

### Requirement: Present Jev decision facts
The decision panel SHALL show Jev's selected placement, its returned probability, up to three highest-probability alternatives from the submitted shortlist with their returned probabilities, and computed board effects for the selected placement and alternatives. Board effects SHALL be derived by simulating each legal placement and SHALL include lines cleared, resulting aggregate height, holes, and adjacent-column bumpiness. Aggregate height SHALL be the sum of the ten column heights; a hole SHALL be an empty cell below an occupied cell in the same column; bumpiness SHALL be the sum of absolute height differences between adjacent columns. The panel SHALL label these as calculated outcomes and label probabilities as relative to the shortlist. It SHALL NOT invent natural-language reasoning for Jev. For the current match, the panel SHALL retain the five most recent successful Jev decisions in newest-first order, keep the newest decision's details visible, and let the user expand older decisions. The history SHALL remain visible while a new decision is pending or retry-required and SHALL clear when a new match starts. When at least one successful decision exists, the panel SHALL provide an independent Freeze/Resume live control: Freeze captures the currently displayed history and expanded selection while new decisions continue to run and update live history, and Resume live discards that snapshot and displays the newest live decision. This control SHALL NOT pause gameplay, Jev requests, or decision recording. Starting a new match SHALL clear the frozen snapshot and return the panel to live mode.

#### Scenario: Show a successful Jev decision
- **WHEN** Jev returns a placement and choice probabilities
- **THEN** the panel shows the selected placement, its probability, ranked alternatives, computed outcomes, and available latency or usage metrics

#### Scenario: A metric is absent from the API response
- **WHEN** Jev does not return a latency or usage metric
- **THEN** the interface marks that metric unavailable rather than estimating or fabricating it

#### Scenario: Keep recent decision facts during the next request
- **WHEN** Jev begins, awaits, or retries a decision after earlier successful choices
- **THEN** the panel continues to show those choices in newest-first order without hiding the history

#### Scenario: Inspect an earlier decision
- **WHEN** the user expands one of the previous four decisions
- **THEN** the panel reveals that decision's selected placement, returned probability, alternatives, and computed outcomes

#### Scenario: Limit and reset decision history
- **WHEN** more than five successful Jev decisions have been recorded or the user starts a new match
- **THEN** the panel retains only the five newest decisions, or clears the history for the new match

#### Scenario: Freeze a decision for a demo
- **WHEN** the user freezes the panel and later successful Jev decisions complete
- **THEN** the exact visible decision history remains displayed, gameplay and Jev continue, and the panel identifies its frozen state

#### Scenario: Resume the live decision panel
- **WHEN** the user resumes the live panel after one or more decisions have completed in the background
- **THEN** the frozen snapshot is discarded and the newest current decision history is displayed

#### Scenario: Start a new match while the panel is frozen
- **WHEN** the user starts a new match
- **THEN** the old frozen snapshot is discarded, the decision history is empty, and the panel is live
