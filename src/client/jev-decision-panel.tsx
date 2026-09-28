import { getPieceCells } from '../game/engine';
import type { JevDecisionResult } from '../game/jev-decision-contract';
import type { JevDecisionSnapshot } from '../game/jev-decision-session';

export interface CompletedDecisionFacts {
  snapshot: JevDecisionSnapshot;
  result: JevDecisionResult;
}

interface JevDecisionPanelProps {
  facts: CompletedDecisionFacts | null;
}

function placementLabel(result: JevDecisionResult['selectedCandidate']): string {
  const occupiedCells = getPieceCells(result.lockedPiece);
  const leftmostColumn = Math.min(...occupiedCells.map(({ x }) => x));
  return `${result.lockedPiece.type} · column ${leftmostColumn + 1} · rotation ${result.lockedPiece.rotation * 90}°`;
}

function formatProbability(probability: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(probability);
}

function outcomeLabel(candidate: JevDecisionResult['selectedCandidate']): string {
  const followUp = candidate.followUp;
  return `Lines cleared: ${candidate.linesCleared} · Aggregate height: ${candidate.metrics.aggregateHeight} · Holes: ${candidate.metrics.holes} · Bumpiness: ${candidate.metrics.bumpiness} · ` +
    `Next piece: ${followUp.linesCleared} ${followUp.linesCleared === 1 ? 'line' : 'lines'} · Height: ${followUp.metrics.aggregateHeight} · Holes: ${followUp.metrics.holes} · Bumpiness: ${followUp.metrics.bumpiness}${followUp.topOut ? ' · Top-out' : ''}`;
}

export function JevDecisionPanel({ facts }: JevDecisionPanelProps) {
  if (facts === null) return null;

  const { snapshot, result } = facts;
  const alternatives = snapshot.candidates
    .map((candidate, index) => ({
      candidate,
      index,
      probability: result.probabilities[candidate.id],
    }))
    .filter(({ candidate }) => candidate.id !== result.choice)
    .sort((left, right) => right.probability - left.probability || left.index - right.index)
    .slice(0, 3);
  const placements = [
    { candidate: result.selectedCandidate, probability: result.probabilities[result.choice], label: 'Selected' },
    ...alternatives.map(({ candidate, probability }, index) => ({
      candidate,
      probability,
      label: `Alternative ${index + 1}`,
    })),
  ];

  return (
    <section className="decision-facts" aria-label="Jev decision facts">
      <div className="decision-facts__header">
        <h3>Last Jev decision</h3>
        <span>Calculated board outcomes</span>
      </div>
      <div className="decision-facts__metadata" aria-label="Returned Jev metrics">
        <span>Jev preference among evaluated options</span>
        <span>Latency unavailable</span>
        <span>
          {result.usage
            ? `Input ${result.usage.inputTokens} · Output ${result.usage.outputTokens}`
            : 'Token usage unavailable'}
        </span>
      </div>
      <ol className="decision-facts__placements" aria-label="Placements by Jev preference among evaluated options">
        {placements.map(({ candidate, probability, label }) => (
          <li
            key={candidate.id}
            className={`decision-facts__placement${label === 'Selected' ? ' decision-facts__placement--selected' : ''}`}
          >
            <span className="decision-facts__rank">{label}</span>
            <strong className="decision-facts__piece">{placementLabel(candidate)}</strong>
            <span className="decision-facts__probability" aria-label="Returned probability">
              {formatProbability(probability)}
            </span>
            <span className="decision-facts__outcome">{outcomeLabel(candidate)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
