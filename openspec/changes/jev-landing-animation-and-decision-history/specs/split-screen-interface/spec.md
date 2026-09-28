# Spec Delta

## MODIFIED Requirements

### Requirement: Present Jev decision facts
The decision panel SHALL show Jev's selected placement, its returned probability, up to three highest-probability alternatives from the submitted shortlist with their returned probabilities, and computed board effects for the selected placement and alternatives. Board effects SHALL be derived by simulating each legal placement and SHALL include lines cleared, resulting aggregate height, holes, and adjacent-column bumpiness. Aggregate height SHALL be the sum of the ten column heights; a hole SHALL be an empty cell below an occupied cell in the same column; bumpiness SHALL be the sum of absolute height differences between adjacent columns. The panel SHALL label these as calculated outcomes and label probabilities as relative to the shortlist. It SHALL NOT invent natural-language reasoning for Jev. For the current match, the panel SHALL retain the five most recent successful Jev decisions in newest-first order, keep the newest decision's details visible, and let the user expand older decisions. The history SHALL remain visible while a new decision is pending or retry-required and SHALL clear when a new match starts.

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
