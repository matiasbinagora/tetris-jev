import {
  calculateBoardMetrics,
  enumerateLegalLandingCandidates,
  trySpawnPiece,
  type ActivePiece,
  type Board,
  type BoardMetrics,
  type LandingCandidate,
  type PieceType,
} from './engine';

export const MAX_JEV_SHORTLIST_SIZE = 12 as const;

export interface FollowUpOutcome {
  linesCleared: number;
  topOut: boolean;
  metrics: BoardMetrics;
}

export interface RankedLanding extends LandingCandidate {
  score: number;
  followUp: FollowUpOutcome;
}

interface FollowUpAssessment {
  outcome: FollowUpOutcome;
  quality: number;
}

/** Rank a bounded list of legal outcomes; Jev remains responsible for choosing. */
export function rankJevPlacements(
  board: Board,
  piece: ActivePiece,
  nextPiece: PieceType,
): RankedLanding[] {
  const candidates = enumerateLegalLandingCandidates(board, piece);
  const ranked = candidates.map((candidate) => {
    const followUp = assessFollowUp(candidate.board, nextPiece);
    return {
      ...candidate,
      score: outcomeQuality(candidate.linesCleared, candidate.metrics) + 0.5 * followUp.quality,
      followUp: followUp.outcome,
    };
  });

  const safeCandidates = ranked.filter((candidate) => !candidate.topOut);
  return selectShortlist(safeCandidates.length > 0 ? safeCandidates : ranked);
}

function assessFollowUp(board: Board, piece: PieceType): FollowUpAssessment {
  const spawn = trySpawnPiece(board, piece);
  if (spawn.kind === 'top-out') {
    return {
      outcome: { linesCleared: 0, topOut: true, metrics: calculateBoardMetrics(board) },
      quality: -1000,
    };
  }

  const candidates = enumerateLegalLandingCandidates(board, spawn.piece);
  const safeCandidates = candidates.filter((candidate) => !candidate.topOut);
  const eligible = safeCandidates.length > 0 ? safeCandidates : candidates;
  if (eligible.length === 0) {
    return {
      outcome: { linesCleared: 0, topOut: true, metrics: calculateBoardMetrics(board) },
      quality: -1000,
    };
  }

  const best = [...eligible].sort(compareQuality)[0]!;
  const allFollowUpsTopOut = safeCandidates.length === 0;
  return {
    outcome: { linesCleared: best.linesCleared, topOut: best.topOut, metrics: best.metrics },
    quality: allFollowUpsTopOut ? -1000 : outcomeQuality(best.linesCleared, best.metrics),
  };
}

function outcomeQuality(linesCleared: number, metrics: BoardMetrics): number {
  return 12 * linesCleared - 8 * metrics.holes - 0.5 * metrics.aggregateHeight - 0.4 * metrics.bumpiness;
}

function compareQuality(left: LandingCandidate, right: LandingCandidate): number {
  return (
    outcomeQuality(right.linesCleared, right.metrics) - outcomeQuality(left.linesCleared, left.metrics) ||
    left.id.localeCompare(right.id)
  );
}

function compareRanked(left: RankedLanding, right: RankedLanding): number {
  return right.score - left.score || left.id.localeCompare(right.id);
}

function selectShortlist(candidates: RankedLanding[]): RankedLanding[] {
  const ranked = [...candidates].sort(compareRanked);
  if (ranked.length <= MAX_JEV_SHORTLIST_SIZE) return ranked;

  const bestForEachClearCount = new Map<number, RankedLanding>();
  for (const candidate of ranked) {
    if (!bestForEachClearCount.has(candidate.linesCleared)) {
      bestForEachClearCount.set(candidate.linesCleared, candidate);
    }
  }

  const shortlist = [...bestForEachClearCount.values()]
    .sort(compareRanked)
    .slice(0, MAX_JEV_SHORTLIST_SIZE);
  const selectedIds = new Set(shortlist.map((candidate) => candidate.id));
  for (const candidate of ranked) {
    if (shortlist.length === MAX_JEV_SHORTLIST_SIZE) break;
    if (!selectedIds.has(candidate.id)) {
      shortlist.push(candidate);
      selectedIds.add(candidate.id);
    }
  }

  return shortlist.sort(compareRanked);
}
