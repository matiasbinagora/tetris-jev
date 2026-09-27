import type { ActivePiece, Board, LandingCandidate } from './engine';

export interface SubmittedLanding {
  id: string;
  lockedPiece: ActivePiece;
}

export interface JevDecisionRequest {
  seed: number;
  board: Board;
  piece: ActivePiece;
  candidates: SubmittedLanding[];
}

export interface JevTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface JevDecisionResult {
  choice: string;
  selectedCandidate: LandingCandidate;
  probabilities: Record<string, number>;
  usage?: JevTokenUsage;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Treat the captured candidates as the only authority for board outcomes. */
export function parseJevDecisionResult(
  candidates: LandingCandidate[],
  value: unknown,
): JevDecisionResult | null {
  if (!isRecord(value) || typeof value.choice !== 'string' || !isRecord(value.probabilities)) return null;
  const selectedCandidate = candidates.find(({ id }) => id === value.choice);
  if (!selectedCandidate || Object.keys(value.probabilities).length !== candidates.length) return null;
  const probabilities: Record<string, number> = {};
  for (const { id } of candidates) {
    const probability = value.probabilities[id];
    if (!Object.hasOwn(value.probabilities, id) || typeof probability !== 'number' ||
      !Number.isFinite(probability) || probability < 0 || probability > 1) return null;
    probabilities[id] = probability;
  }
  const result: JevDecisionResult = { choice: value.choice, selectedCandidate, probabilities };
  const usage = value.usage;
  if (isRecord(usage) && typeof usage.inputTokens === 'number' &&
    typeof usage.outputTokens === 'number' && Number.isSafeInteger(usage.inputTokens) &&
    Number.isSafeInteger(usage.outputTokens) && usage.inputTokens >= 0 && usage.outputTokens >= 0) {
    result.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
  }
  return result;
}
