import { describe, expect, it } from 'vitest';
import { createEmptyBoard, type Cell } from './engine';
import { createMatchSession, startMatchSession, tickMatchSession } from './match-session';
import {
  beginJevDecision, completeJevDecision, failJevDecision, retryJevDecision,
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
  it('captures a detached serializable snapshot and pauses both boards', () => {
    const original = playing();
    const before = structuredClone(original.core);
    const flow = beginJevDecision(original, 'decision-1');
    expect(flow).not.toBeNull();
    expect(flow!.status).toBe('pending');
    expect(flow!.session.phase).toBe('paused');
    expect(flow!.session.core).toEqual(before);
    expect(tickMatchSession(flow!.session)).toBe(flow!.session);
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
    expect(tickMatchSession(retry.session)).toBe(retry.session);
    expect(retryJevDecision(retry)).toBe(retry);
    expect(completeJevDecision(retry, flow.token, answer(flow))).toBe(retry);
    expect(failJevDecision(retry, flow.token)).toBe(retry);
    expect(completeJevDecision(retry, { ...retry.token, decisionId: 'old-match' }, answer(flow))).toBe(retry);
    expect(failJevDecision(retry, { ...retry.token, decisionId: 'old-match' })).toBe(retry);
  });

  it('locks only the canonical Jev board and resumes without moving the human', () => {
    const source = playing();
    source.core.jev.activePiece = { type: 'I', rotation: 0, x: 3, y: 0 };
    const board = mutableBoard(source.core.jev);
    for (let x = 0; x < 10; x++) if (x < 3 || x > 6) board[21][x] = 'T';
    const flow = beginJevDecision(source, 'line-clear')!;
    const candidate = flow.snapshot.candidates.find((c) => c.linesCleared === 1)!;
    expect(candidate).toBeDefined();
    const done = completeJevDecision(flow, flow.token, answer(flow, candidate.id));
    expect(done.status).toBe('complete');
    expect(done.session.phase).toBe('playing');
    expect(done.session.core.jev.board).toEqual(createEmptyBoard());
    expect(done.session.core.jev.lockedThisRound).toBe(true);
    expect(done.session.core.jev.activePiece).toBeNull();
    expect(done.session.core.human).toBe(flow.session.core.human);
    expect(done.session.core.roundIndex).toBe(0);
    expect(done.result?.selectedCandidate).toBe(candidate);
    expect(done.result?.usage).toEqual({ inputTokens: 0, outputTokens: 12 });
    expect(done.result?.probabilities[flow.snapshot.candidates[0]!.id]).toBe(0.123456789);
    expect(completeJevDecision(done, done.token, answer(flow))).toBe(done);
    expect(failJevDecision(done, done.token)).toBe(done);
    expect(retryJevDecision(done)).toBe(done);
    expect(beginJevDecision(done.session, 'duplicate-round')).toBeNull();
  });

  it('advances exactly once when the human was already locked', () => {
    const source = playing();
    source.core.human.activePiece = null;
    source.core.human.lockedThisRound = true;
    const flow = beginJevDecision(source, 'barrier')!;
    const done = completeJevDecision(flow, flow.token, answer(flow));
    expect(done.session.core.roundIndex).toBe(1);
    expect(done.session.core.human.activePiece?.y).toBe(0);
    expect(done.session.core.jev.activePiece?.y).toBe(0);
    expect(done.session.core.human.activePiece?.type).toBe(done.session.core.jev.activePiece?.type);
  });

  it('finishes immediately on a Jev lock top-out', () => {
    const source = playing();
    source.core.jev.activePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
    mutableBoard(source.core.jev)[2].fill('I');
    const flow = beginJevDecision(source, 'top-out')!;
    const candidate = flow.snapshot.candidates.find((c) => c.topOut)!;
    expect(candidate).toBeDefined();
    const done = completeJevDecision(flow, flow.token, answer(flow, candidate.id));
    expect(done.session.phase).toBe('finished');
    expect(done.session.result).toEqual({ kind: 'win', winner: 'human' });
    expect(done.session.core.human).toBe(flow.session.core.human);
  });

  it.each([false, true])('resolves next-spawn top-outs (both=%s)', (both) => {
    const source = playing();
    source.core.human.activePiece = null;
    source.core.human.lockedThisRound = true;
    mutableBoard(source.core.human)[0].fill('I');
    mutableBoard(source.core.human)[1].fill('I');
    if (both) {
      mutableBoard(source.core.jev)[0].fill('I', 3, 7);
      mutableBoard(source.core.jev)[1].fill('I', 3, 7);
      source.core.jev.activePiece!.y = 5;
    }
    const flow = beginJevDecision(source, 'spawn')!;
    const candidate = flow.snapshot.candidates.find((c) => !c.topOut)!;
    const done = completeJevDecision(flow, flow.token, answer(flow, candidate.id));
    expect(done.session.phase).toBe('finished');
    expect(done.session.result).toEqual(both ? { kind: 'draw' } : { kind: 'win', winner: 'jev' });
  });

  it.each(['ready', 'paused', 'finished'] as const)('does not start from %s', (phase) => {
    expect(beginJevDecision({ ...playing(), phase }, 'invalid')).toBeNull();
  });

  it('does not start with an empty decision ID or a topped-out player', () => {
    expect(beginJevDecision(playing(), '')).toBeNull();
    const source = playing();
    source.core.human.topOut = true;
    expect(beginJevDecision(source, 'ended')).toBeNull();
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
