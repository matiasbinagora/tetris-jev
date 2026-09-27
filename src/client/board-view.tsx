import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  getPieceCells,
  type ActivePiece,
  type Board,
} from '../game/engine';

interface BoardViewProps {
  board: Board;
  activePiece: ActivePiece | null;
  label: string;
  player: 'human' | 'jev';
}

export function BoardView({ board, activePiece, label, player }: BoardViewProps) {
  const activeCells = new Set(
    activePiece?.type
      ? getPieceCells(activePiece).map(({ x, y }) => `${x}:${y}`)
      : [],
  );

  return (
    <div className={`board board--${player}`} role="img" aria-label={label}>
      {board.slice(HIDDEN_ROWS).flatMap((row, visibleY) =>
        row.map((settled, x) => {
          const y = visibleY + HIDDEN_ROWS;
          const active = activeCells.has(`${x}:${y}`);
          const piece = active ? activePiece?.type : settled;
          return (
            <span
              key={y * BOARD_WIDTH + x}
              className={`board__cell${piece ? ` board__cell--${piece.toLowerCase()}` : ''}${active ? ' board__cell--active' : ''}`}
              aria-hidden="true"
            />
          );
        }),
      )}
    </div>
  );
}
