import { describe, expect, it } from 'vitest';
import { createEmptyBoard, type Cell } from './engine';
import { createMatchSession, pauseMatchSession, startMatchSession, tickMatchSession } from './match-session';
import {
  applyJevLanding, beginJevDecision, completeJevDecision, failJevDecision, retryJevDecision, resumeCompletedJevDecision,
  type JevDecisionSession,
} from './jev-decision-session';

function mutableBoard(player: { board: ReadonlyArray<ReadonlyArray<Cell>> }): Cell[][] {
  const board = player.board.map((row) => [...row]);
  player.board = board;
  return board;
}

function playing() { return startMatchSession(createMatchSession(123)); }
function begin() {
  const flow = beginJevDecision(playing(), 'decision-1');
  expect(flow).not.toBeNull();
  return flow!;
}
function answer(flow: JevDecisionSession, choice = flow.snapshot.candidates[0]!.id) {
  return {
    choice,
    selectedCandidate: { board: 'untrusted simulation' },
    probabilities: Object.fromEntries(flow.snapshot.candidates.map(({ id }, i) => [id, i === 0 ? 0.123456789 : 0.25])),
    usage: { inputTokens: 0, outputTokens: 12 },
  };
}

describe('Jev decision coordination', () => {
  it('captures a detached serializable snapshot without pausing the human board', () => {
    const original = playing();
    const before = structuredClone(original.core);
    const flow = beginJevDecision(original, 'decision-1');
    expect(flow).not.toBeNull();
    expect(flow!.status).toBe('pending');
    expect(flow!.session.phase).toBe('playing');
    expect(flow!.session.core).toEqual(before);
    expect(tickMatchSession(flow!.session).core.human.activePiece?.y).toBe(before.human.activePiece!.y + 1);
    expect(JSON.parse(JSON.stringify(flow))).toEqual(flow);
    const request = JSON.parse(flow!.snapshot.requestBody);
    expect(request.seed).toBe(123);
    expect(request.board).toEqual(before.jev.board);
    expect(request.piece).toEqual(before.jev.activePiece);
    expect(request.candidates[0]).toHaveProperty('lockedPiece');
    expect(request.candidates[0]).not.toHaveProperty('board');
    mutableBoard(original.core.jev)[21][0] = 'I';
    original.core.human.activePiece!.x = 0;
    expect(flow!.session.core).toEqual(before);
    expect(JSON.parse(flow!.snapshot.requestBody)).toEqual(request);
    expect(() => { (flow!.snapshot.candidates[0]!.board as Cell[][])[21][0] = 'Z'; }).toThrow();
  });

  it('preserves the exact paused state and request across explicit retries', () => {
    const flow = begin();
    const failed = failJevDecision(flow, flow.token);
    expect(failed.status).toBe('retry-required');
    expect(failed.session).toBe(flow.session);
    const retry = retryJevDecision(failed);
    expect(retry.status).toBe('pending');
    expect(retry.token.attempt).toBe(2);
    expect(retry.snapshot).toBe(flow.snapshot);
    expect(retry.session).toBe(flow.session);
    expect(tickMatchSession(retry.session).core.human.activePiece?.y).toBe(retry.session.core.human.activePiece!.y + 1);
    expect(retryJevDecision(retry)).toBe(retry);
    expect(completeJevDecision(retry, flow.token, answer(flow))).toBe(retry);
    expect(failJevDecision(retry, flow.token)).toBe(retry);
    expect(completeJevDecision(retry, { ...retry.token, decisionId: 'old-match' }, answer(flow))).toBe(retry);
    expect(failJevDecision(retry, { ...retry.token, decisionId: 'old-match' })).toBe(retry);
  });

  it('keeps the selected board unapplied until Jev finishes the landing animation', () => {
    const source = playing();
    source.core.jev.activePiece = { type: 'I', rotation: 0, x: 3, y: 0 };
    const board = mutableBoard(source.core.jev);
    for (let x = 0; x < 10; x++) if (x < 3 || x > 6) board[21][x] = 'T';
    const flow = beginJevDecision(source, 'line-clear')!;
    const candidate = flow.snapshot.candidates.find((c) => c.linesCleared === 1)!;
    expect(candidate).toBeDefined();
    const accepted = completeJevDecision(flow, flow.token, answer(flow, candidate.id));
    expect(accepted.status).toBe('animating');
    expect(accepted.session.phase).toBe('playing');
    expect(accepted.session.core.jev.board).toEqual(flow.session.core.jev.board);
    expect(accepted.session.core.jev.sequenceIndex).toBe(flow.snapshot.sequenceIndex);
    expect(accepted.session.core.jev.survivedPieces).toBe(0);
    expect(accepted.session.core.jev.activePiece).toEqual(flow.snapshot.piece);
    expect(accepted.session.core.human).toBe(flow.session.core.human);
    expect(accepted.result?.selectedCandidate).toBe(candidate);
    expect(accepted.result?.usage).toEqual({ inputTokens: 0, outputTokens: 12 });
    expect(accepted.result?.probabilities[flow.snapshot.candidates[0]!.id]).toBe(0.123456789);

    const done = applyJevLanding(accepted);
    expect(done.status).toBe('complete');
    expect(done.session.core.jev.board).toEqual(createEmptyBoard());
    expect(done.session.core.jev.lockedThisRound).toBe(false);
    expect(done.session.core.jev.sequenceIndex).toBe(1);
    expect(done.session.core.jev.survivedPieces).toBe(1);
    expect(done.session.core.jev.activePiece?.type).toBe(flow.snapshot.nextPiece);
    expect(done.session.core.human).toBe(flow.session.core.human);
    expect(completeJevDecision(done, done.token, answer(flow))).toBe(done);
    expect(failJevDecision(done, done.token)).toBe(done);
    expect(retryJevDecision(done)).toBe(done);
    expect(beginJevDecision(done.session, 'next-piece')).not.toBeNull();
  });

  it('does not immediately finish when Jev tops out at the same survived-piece count', () => {
    const source = playing();
    source.core.jev.activePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
    mutableBoard(source.core.jev)[2].fill('I');
    const flow = beginJevDecision(source, 'top-out')!;
    const candidate = flow.snapshot.candidates.find((c) => c.topOut)!;
    expect(candidate).toBeDefined();
    const done = completeJevDecision(flow, flow.token, answer(flow, candidate.id));
    expect(done.session.phase).toBe('playing');
    expect(done.session.result).toBeNull();
    expect(done.session.core.human).toBe(flow.session.core.human);
  });

  it('ignores a response when the independent Jev piece has moved to a newer snapshot', () => {
    const flow = begin();
    const newer = { ...flow.session, core: { ...flow.session.core,
      jev: { ...flow.session.core.jev, sequenceIndex: flow.snapshot.sequenceIndex + 1 } } };
    expect(completeJevDecision(flow, flow.token, answer(flow), newer)).toBe(flow);
  });

  it('retains a valid decision received during manual pause until resume', () => {
    const flow = begin();
    const paused = pauseMatchSession(flow.session);
    const waiting = completeJevDecision(flow, flow.token, answer(flow), paused);
    expect(waiting.status).toBe('ready-to-apply');
    expect(waiting.session.core.jev).toEqual(paused.core.jev);
    const resumed = resumeCompletedJevDecision(waiting);
    expect(resumed.status).toBe('animating');
    expect(resumed.session.phase).toBe('playing');
    expect(resumed.session.core.jev.sequenceIndex).toBe(0);
    expect(applyJevLanding(resumed).session.core.jev.sequenceIndex).toBe(1);
  });

  it.each(['ready', 'paused', 'finished'] as const)('does not start from %s', (phase) => {
    expect(beginJevDecision({ ...playing(), phase }, 'invalid')).toBeNull();
  });

  it('does not start with an empty decision ID, but Jev may continue after human top-out', () => {
    expect(beginJevDecision(playing(), '')).toBeNull();
    const source = playing();
    source.core.human.topOut = true;
    expect(beginJevDecision(source, 'after-human-topout')).not.toBeNull();
  });

  it.each(['unknown', 'missing', 'extra', 'negative', 'infinite', 'string'])('keeps invalid %s responses paused', (kind) => {
    const flow = begin();
    const response = answer(flow);
    const id = flow.snapshot.candidates[0]!.id;
    if (kind === 'unknown') response.choice = 'unknown';
    if (kind === 'missing') delete response.probabilities[id];
    if (kind === 'extra') response.probabilities.extra = 0;
    if (kind === 'negative') response.probabilities[id] = -0.1;
    if (kind === 'infinite') response.probabilities[id] = Infinity;
    if (kind === 'string') (response.probabilities as Record<string, unknown>)[id] = '0.5';
    const failed = completeJevDecision(flow, flow.token, response);
    expect(failed.status).toBe('retry-required');
    expect(failed.session).toBe(flow.session);
    expect(failed.snapshot).toBe(flow.snapshot);
    expect(failed.result).toBeNull();
  });
});
