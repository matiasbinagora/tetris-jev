import {
  hardDropPiece,
  softDropPiece,
  tryMovePiece,
  tryRotatePiece,
} from './engine';
import { lockMatchSessionPlayer, type MatchSessionState } from './match-session';

export type HumanGameAction =
  | 'left'
  | 'right'
  | 'soft-drop'
  | 'rotate-clockwise'
  | 'rotate-counterclockwise'
  | 'hard-drop';

/** Apply one legal human input without mutating Jev's independent board. */
export function applyHumanGameAction(
  session: MatchSessionState,
  action: HumanGameAction,
): MatchSessionState {
  const human = session.core.human;
  const piece = human.activePiece;
  if (
    session.phase !== 'playing' ||
    piece === null ||
    human.lockedThisRound ||
    human.topOut
  ) {
    return session;
  }

  if (action === 'hard-drop') {
    const result = hardDropPiece(human.board, piece);
    return lockMatchSessionPlayer(session, 'human', result.board, result.topOut);
  }

  const nextPiece = (() => {
    switch (action) {
      case 'left':
        return tryMovePiece(human.board, piece, -1, 0);
      case 'right':
        return tryMovePiece(human.board, piece, 1, 0);
      case 'soft-drop':
        return softDropPiece(human.board, piece);
      case 'rotate-clockwise':
        return tryRotatePiece(human.board, piece, 'clockwise');
      case 'rotate-counterclockwise':
        return tryRotatePiece(human.board, piece, 'counterclockwise');
    }
  })();

  if (nextPiece === piece) return session;
  return {
    ...session,
    core: {
      ...session.core,
      human: { ...human, activePiece: nextPiece },
    },
  };
}
