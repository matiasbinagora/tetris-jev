import { describe, expect, it, vi } from 'vitest';
import { handleGameKey, type GameKeyState } from './game-keyboard';

function state(overrides: Partial<GameKeyState> = {}): GameKeyState {
  return {
    phase: 'playing',
    hasJevDecision: false,
    decisionSetupFailed: false,
    humanHasActivePiece: true,
    humanLockedThisRound: false,
    ...overrides,
  };
}

function keyboardEvent(key: string, overrides: Partial<KeyboardEvent> = {}) {
  return {
    key,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent;
}

describe('game keyboard controls', () => {
  it.each([
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
    ['ArrowDown', 'soft-drop'],
    ['ArrowUp', 'rotate-clockwise'],
    ['x', 'rotate-clockwise'],
    ['X', 'rotate-clockwise'],
    ['z', 'rotate-counterclockwise'],
    ['Z', 'rotate-counterclockwise'],
    ['Space', 'hard-drop'],
    [' ', 'hard-drop'],
  ] as const)('maps %s to %s and prevents page scroll', (key, action) => {
    const event = keyboardEvent(key);
    const onAction = vi.fn();
    const onPauseToggle = vi.fn();
    handleGameKey(event, state(), onAction, onPauseToggle);
    expect(onAction).toHaveBeenCalledWith(action);
    expect(onPauseToggle).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('toggles manual pause with P without treating it as a piece action', () => {
    const event = keyboardEvent('p');
    const onAction = vi.fn();
    const onPauseToggle = vi.fn();
    handleGameKey(event, state(), onAction, onPauseToggle);
    expect(onPauseToggle).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('allows P to resume a manually paused match', () => {
    const onPauseToggle = vi.fn();
    handleGameKey(keyboardEvent('P'), state({ phase: 'paused' }), vi.fn(), onPauseToggle);
    expect(onPauseToggle).toHaveBeenCalledOnce();
  });

  it.each([
    ['ready', { phase: 'ready' as const }],
    ['finished', { phase: 'finished' as const }],
    ['paused', { phase: 'paused' as const }],
    ['missing piece', { humanHasActivePiece: false }],
    ['human already locked', { humanLockedThisRound: true }],
    ['Jev pending', { hasJevDecision: true }],
    ['Jev setup failed', { decisionSetupFailed: true }],
  ] as const)('does not move the board during %s', (_label, overrides) => {
    const event = keyboardEvent('ArrowLeft');
    const onAction = vi.fn();
    handleGameKey(event, state(overrides), onAction, vi.fn());
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('does not resume a Jev pending or retry pause with P', () => {
    for (const guarded of [
      state({ phase: 'paused', hasJevDecision: true }),
      state({ phase: 'paused', decisionSetupFailed: true }),
    ]) {
      const onPauseToggle = vi.fn();
      handleGameKey(keyboardEvent('p'), guarded, vi.fn(), onPauseToggle);
      expect(onPauseToggle).not.toHaveBeenCalled();
    }
  });

  it('suppresses repeated Space and P events', () => {
    const spaceAction = vi.fn();
    const spaceEvent = keyboardEvent(' ', { repeat: true });
    handleGameKey(spaceEvent, state(), spaceAction, vi.fn());
    expect(spaceEvent.preventDefault).toHaveBeenCalledOnce();
    expect(spaceAction).not.toHaveBeenCalled();

    const pauseToggle = vi.fn();
    const pauseEvent = keyboardEvent('p', { repeat: true });
    handleGameKey(pauseEvent, state(), vi.fn(), pauseToggle);
    expect(pauseEvent.preventDefault).toHaveBeenCalledOnce();
    expect(pauseToggle).not.toHaveBeenCalled();
  });

  it('passes modified shortcuts and IME composition through to the browser', () => {
    for (const overrides of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { isComposing: true },
    ]) {
      const event = keyboardEvent('ArrowDown', overrides);
      const onAction = vi.fn();
      handleGameKey(event, state(), onAction, vi.fn());
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(onAction).not.toHaveBeenCalled();
    }
  });

  it('does not consume keys outside the game mapping', () => {
    const event = keyboardEvent('Tab');
    handleGameKey(event, state(), vi.fn(), vi.fn());
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores keys originating from native controls and editable content', () => {
    for (const selector of ['button', 'input', 'textarea', 'select', '[contenteditable="true"]']) {
      const event = keyboardEvent(' ', {
        target: {
          closest: (requested: string) => requested.includes(selector) ? {} : null,
        } as unknown as EventTarget,
      });
      const onAction = vi.fn();
      handleGameKey(event, state(), onAction, vi.fn());
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(onAction).not.toHaveBeenCalled();
    }
  });

  it('does not handle a game key already consumed by another handler', () => {
    const event = keyboardEvent('ArrowLeft', { defaultPrevented: true });
    const onAction = vi.fn();
    handleGameKey(event, state(), onAction, vi.fn());
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });
});
