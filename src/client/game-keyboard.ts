import type { MatchPhase } from '../game/match-session';
import type { HumanGameAction } from '../game/human-controls';

export interface FocusedGameKeyState {
  phase: MatchPhase;
  hasJevDecision: boolean;
  decisionSetupFailed: boolean;
  humanHasActivePiece: boolean;
  humanLockedThisRound: boolean;
}

export interface FocusedGameKeyboardEvent {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  preventDefault(): void;
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
    case ' ':
    case 'Spacebar': return 'hard-drop';
    default: return null;
  }
}

/** Dispatch game controls only when called by the focused human-board region. */
export function handleFocusedGameKey(
  event: FocusedGameKeyboardEvent,
  state: FocusedGameKeyState,
  onAction: (action: HumanGameAction) => void,
  onPauseToggle: () => void,
): void {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;

  const action = actionForKey(event.key);
  const isPauseKey = event.key.toLowerCase() === 'p';
  if (action === null && !isPauseKey) return;

  // Prevent the focused game keys from scrolling the page even while play is paused.
  event.preventDefault();

  const mayControlHuman =
    state.phase === 'playing' &&
    !state.hasJevDecision &&
    !state.decisionSetupFailed &&
    state.humanHasActivePiece &&
    !state.humanLockedThisRound;

  if (action !== null) {
    if (mayControlHuman && !(action === 'hard-drop' && event.repeat)) {
      onAction(action);
    }
    return;
  }

  const mayTogglePause =
    !state.hasJevDecision &&
    !state.decisionSetupFailed &&
    (state.phase === 'playing' || state.phase === 'paused');
  if (mayTogglePause && !event.repeat) onPauseToggle();
}
