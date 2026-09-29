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
  presentationPiece?: ActivePiece | null;
  landingStage?: 1 | 2 | null;
  paused?: boolean;
  label: string;
  player: 'human' | 'jev';
}

export function BoardView({ board, activePiece, presentationPiece, landingStage = null, paused = false, label, player }: BoardViewProps) {
  const activeCells = new Set(
    activePiece?.type
      ? getPieceCells(activePiece).map(({ x, y }) => `${x}:${y}`)
      : [],
  );

  return (
    <div
      className={`board board--${player}${landingStage === null ? '' : ' board--landing'}`}
      data-landing-stage={landingStage ?? undefined}
      data-landing-paused={landingStage !== null && paused ? 'true' : undefined}
      role="img"
      aria-label={label}
    >
      {board.slice(HIDDEN_ROWS).flatMap((row, visibleY) =>
        row.map((settled, x) => {
          const y = visibleY + HIDDEN_ROWS;
          const active = landingStage === null && activeCells.has(`${x}:${y}`);
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
      {(presentationPiece ?? activePiece) !== null && (
        <div className="board__piece-layer" aria-hidden="true">
          {getPieceCells(presentationPiece ?? activePiece!).map(({ x, y }, index) => {
            const visibleRow = y - HIDDEN_ROWS;
            if (x < 0 || x >= BOARD_WIDTH || visibleRow < 0 || visibleRow >= 20) return null;
            const piece = presentationPiece ?? activePiece!;
            return (
              <span
                key={index}
                className={`board__piece-cell board__cell--${piece.type.toLowerCase()} board__cell--active`}
                style={{
                  left: `calc(${x * 10}% + ${x * 0.2}px)`,
                  top: `calc(${visibleRow * 5}% + ${visibleRow * 0.1}px)`,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
