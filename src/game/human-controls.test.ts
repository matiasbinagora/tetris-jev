import { describe, expect, it } from 'vitest';
import { createMatchSession, startMatchSession, type MatchSessionState } from './match-session';
import { applyHumanGameAction, type HumanGameAction } from './human-controls';

function playing(seed = 123): MatchSessionState {
  return startMatchSession(createMatchSession(seed));
}

describe('human game actions', () => {
  it.each([
    ['left', -1, 0],
    ['right', 1, 0],
  ] as const)('moves %s by one legal cell', (action, dx, dy) => {
    const before = playing();
    const after = applyHumanGameAction(before, action);
    expect(after.core.human.activePiece?.x).toBe(before.core.human.activePiece!.x + dx);
    expect(after.core.human.activePiece?.y).toBe(before.core.human.activePiece!.y + dy);
    expect(after.core.jev).toBe(before.core.jev);
  });

  it('rotates both ways and soft-drops without locking', () => {
    const initial = playing();
    const clockwise = applyHumanGameAction(initial, 'rotate-clockwise');
    const counterclockwise = applyHumanGameAction(clockwise, 'rotate-counterclockwise');
    const dropped = applyHumanGameAction(counterclockwise, 'soft-drop');
    expect(clockwise.core.human.activePiece?.rotation).toBe(1);
    expect(counterclockwise.core.human.activePiece?.rotation).toBe(0);
    expect(dropped.core.human.activePiece?.y).toBe(initial.core.human.activePiece!.y + 1);
    expect(dropped.core.human.lockedThisRound).toBe(false);
  });

  it('leaves a blocked move unchanged', () => {
    const before = playing();
    const againstLeftWall = {
      ...before,
      core: {
        ...before.core,
        human: {
          ...before.core.human,
          activePiece: { type: 'T' as const, rotation: 0 as const, x: 0, y: 0 },
        },
      },
    };
    expect(applyHumanGameAction(againstLeftWall, 'left')).toBe(againstLeftWall);
  });

  it('hard-drops and locks only the human board', () => {
    const before = playing();
    const jevBoard = before.core.jev.board;
    const after = applyHumanGameAction(before, 'hard-drop');
    expect(after.core.human.activePiece).toBeNull();
    expect(after.core.human.lockedThisRound).toBe(true);
    expect(after.core.human.board).not.toBe(before.core.human.board);
    expect(after.core.jev.board).toBe(jevBoard);
    expect(after.core.jev).toBe(before.core.jev);
  });

  it('settles the shared round after the human hard-drops when Jev is already locked', () => {
    const before = playing();
    const jevBoard = before.core.jev.board;
    const bothReadyToSettle: MatchSessionState = {
      ...before,
      core: {
        ...before.core,
        jev: { ...before.core.jev, activePiece: null, lockedThisRound: true },
      },
    };
    const after = applyHumanGameAction(bothReadyToSettle, 'hard-drop');
    expect(after.core.roundIndex).toBe(before.core.roundIndex + 1);
    expect(after.core.human.activePiece?.type).toBe(after.core.currentPiece);
    expect(after.core.jev.activePiece?.type).toBe(after.core.currentPiece);
    expect(after.core.jev.board).toBe(jevBoard);
  });

  it.each(['ready', 'paused', 'finished'] as const)(
    'rejects game actions during %s',
    (phase) => {
      const active = playing();
      const state: MatchSessionState = {
        ...active,
        phase,
        ...(phase === 'finished' ? { result: { kind: 'draw' as const } } : {}),
      };
      expect(applyHumanGameAction(state, 'left')).toBe(state);
    },
  );

  it('rejects actions without an active human piece or after its round lock', () => {
    const active = playing();
    const missingPiece = {
      ...active,
      core: { ...active.core, human: { ...active.core.human, activePiece: null } },
    };
    const locked = {
      ...active,
      core: { ...active.core, human: { ...active.core.human, lockedThisRound: true } },
    };
    expect(applyHumanGameAction(missingPiece, 'right')).toBe(missingPiece);
    expect(applyHumanGameAction(locked, 'right')).toBe(locked);
  });

  it('keeps the human state unchanged when soft drop cannot move', () => {
    const before = playing();
    const activePiece = { type: 'T' as const, rotation: 0 as const, x: 3, y: 20 };
    const atFloor = { ...before, core: { ...before.core, human: { ...before.core.human, activePiece } } };
    const after = applyHumanGameAction(atFloor, 'soft-drop' satisfies HumanGameAction);
    expect(after).toBe(atFloor);
  });
});
