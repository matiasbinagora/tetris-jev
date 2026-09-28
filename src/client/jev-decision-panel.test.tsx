/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createEmptyBoard } from '../game/engine';
import type { RankedLanding } from '../game/jev-placement';
import type { JevDecisionResult } from '../game/jev-decision-contract';
import type { JevDecisionSnapshot } from '../game/jev-decision-session';
import { JevDecisionPanel, type CompletedDecisionFacts } from './jev-decision-panel';

afterEach(cleanup);

function candidate(
  id: string,
  x: number,
  metrics: { lines: number; height: number; holes: number; bumpiness: number },
): RankedLanding {
  return {
    id,
    lockedPiece: { type: 'T', rotation: 0, x, y: 18 },
    board: createEmptyBoard(),
    linesCleared: metrics.lines,
    topOut: false,
    metrics: {
      columnHeights: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      aggregateHeight: metrics.height,
      holes: metrics.holes,
      bumpiness: metrics.bumpiness,
    },
    score: 0,
    followUp: {
      linesCleared: 1,
      topOut: false,
      metrics: { columnHeights: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], aggregateHeight: 16, holes: 2, bumpiness: 4 },
    },
  };
}

function facts(withUsage: boolean): CompletedDecisionFacts {
  const candidates = [
    candidate('selected', 2, { lines: 2, height: 31, holes: 4, bumpiness: 7 }),
    candidate('lower', 1, { lines: 0, height: 25, holes: 2, bumpiness: 5 }),
    candidate('highest', 5, { lines: 1, height: 22, holes: 1, bumpiness: 3 }),
    candidate('middle', 3, { lines: 0, height: 27, holes: 3, bumpiness: 6 }),
    candidate('second', 4, { lines: 3, height: 18, holes: 0, bumpiness: 2 }),
    candidate('lowest', 6, { lines: 0, height: 33, holes: 7, bumpiness: 9 }),
  ];
  const probabilities = {
    selected: 0.25,
    lower: 0.4,
    highest: 0.95,
    middle: 0.72,
    second: 0.83,
    lowest: 0.1,
  };
  const snapshot: JevDecisionSnapshot = {
    seed: 123,
    sequenceIndex: 0,
    board: createEmptyBoard(),
    piece: { type: 'T', rotation: 0, x: 3, y: 0 },
    nextPiece: 'I',
    candidates,
    requestBody: '{}',
  };
  const result: JevDecisionResult = {
    choice: 'selected',
    selectedCandidate: candidates[0],
    probabilities,
    ...(withUsage ? { usage: { inputTokens: 42, outputTokens: 7 } } : {}),
  };
  return { snapshot, result };
}

describe('Jev decision facts panel', () => {
  it('shows the selected placement, returned probability, and its simulated outcomes', () => {
    render(<JevDecisionPanel facts={facts(true)} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain('Selected');
    expect(rows[0].textContent).toContain('T · column 3 · rotation 0°');
    expect(rows[0].textContent).toContain('25%');
    expect(rows[0].textContent).toContain('Lines cleared: 2 · Aggregate height: 31 · Holes: 4 · Bumpiness: 7');
  });

  it('ranks alternatives by returned probability, excludes the selection, and shows only three', () => {
    render(<JevDecisionPanel facts={facts(true)} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[1].textContent).toContain('Alternative 1');
    expect(rows[1].textContent).toContain('column 6');
    expect(rows[1].textContent).toContain('95%');
    expect(rows[2].textContent).toContain('column 5');
    expect(rows[2].textContent).toContain('83%');
    expect(rows[3].textContent).toContain('column 4');
    expect(rows[3].textContent).toContain('72%');
    expect(rows.some((row) => row.textContent?.includes('0.1%'))).toBe(false);
  });

  it('shows returned token usage and marks unavailable latency explicitly', () => {
    render(<JevDecisionPanel facts={facts(true)} />);
    expect(screen.getByText('Latency unavailable')).not.toBeNull();
    expect(screen.getByText('Input 42 · Output 7')).not.toBeNull();
  });

  it('marks absent usage unavailable and labels effects as calculated without model reasoning', () => {
    render(<JevDecisionPanel facts={facts(false)} />);
    expect(screen.getByText('Latency unavailable')).not.toBeNull();
    expect(screen.getByText('Token usage unavailable')).not.toBeNull();
    expect(screen.getByText('Calculated board outcomes')).not.toBeNull();
    expect(screen.queryByText(/because|my reasoning|I chose/i)).toBeNull();
  });

  it('labels probabilities as preferences among evaluated options and shows next-piece outcomes', () => {
    render(<JevDecisionPanel facts={facts(true)} />);
    expect(screen.getByText('Jev preference among evaluated options')).not.toBeNull();
    expect(screen.getAllByText(/Next piece: 1 line · Height: 16 · Holes: 2 · Bumpiness: 4/).length).toBeGreaterThan(0);
  });
});
