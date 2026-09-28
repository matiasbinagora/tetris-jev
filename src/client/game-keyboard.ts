import type { MatchPhase } from '../game/match-session';
import type { HumanGameAction } from '../game/human-controls';

export interface GameKeyState {
  phase: MatchPhase;
  humanHasActivePiece: boolean;
  humanLockedThisRound: boolean;
}

export interface GameKeyboardEvent {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  target?: EventTarget | null;
  defaultPrevented?: boolean;
  preventDefault(): void;
}

function isInteractiveTarget(target: EventTarget | null | undefined): boolean {
  if (target === null || target === undefined || typeof target !== 'object') return false;
  const element = target as EventTarget & {
    closest?: (selectors: string) => unknown;
    isContentEditable?: boolean;
  };
  if (element.isContentEditable) return true;
  if (typeof element.closest !== 'function') return false;

  return element.closest(
    'button, input, select, textarea, a[href], summary, [role="button"], [role="separator"], [contenteditable=""], [contenteditable="true"]',
  ) !== null;
}

function actionForKey(key: string): HumanGameAction | null {
  switch (key) {
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'ArrowDown': return 'soft-drop';
    case 'ArrowUp':
    case 'x':
    case 'X': return 'rotate-clockwise';
    case 'z':
    case 'Z': return 'rotate-counterclockwise';
    case 'Space':
    case ' ':
    case 'Spacebar': return 'hard-drop';
    default: return null;
  }
}

/** Dispatch game controls from anywhere in the app except native or editable controls. */
export function handleGameKey(
  event: GameKeyboardEvent,
  state: GameKeyState,
  onAction: (action: HumanGameAction) => void,
  onPauseToggle: () => void,
): void {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
    event.defaultPrevented || isInteractiveTarget(event.target)) return;

  const action = actionForKey(event.key);
  const isPauseKey = event.key.toLowerCase() === 'p';
  if (action === null && !isPauseKey) return;

  // Prevent the focused game keys from scrolling the page even while play is paused.
  event.preventDefault();

  const mayControlHuman =
    state.phase === 'playing' &&
    state.humanHasActivePiece &&
    !state.humanLockedThisRound;

  if (action !== null) {
    if (mayControlHuman && !(action === 'hard-drop' && event.repeat)) {
      onAction(action);
    }
    return;
  }

  const mayTogglePause =
    (state.phase === 'playing' || state.phase === 'paused');
  if (mayTogglePause && !event.repeat) onPauseToggle();
}
