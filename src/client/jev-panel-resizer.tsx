'use client';

import { Children, useRef, useState, type PointerEvent, type ReactNode, type KeyboardEvent } from 'react';

const DEFAULT_BOARD_SHARE = 70;
const MIN_BOARD_SHARE = 50;
const MAX_BOARD_SHARE = 80;
const KEYBOARD_STEP = 5;
const SEPARATOR_SIZE = 12;

interface DragState {
  pointerId: number;
  top: number;
  height: number;
}

function clampBoardShare(value: number): number {
  return Math.min(MAX_BOARD_SHARE, Math.max(MIN_BOARD_SHARE, value));
}

export function JevPanelResizer({ children }: { children: ReactNode }) {
  const [boardShare, setBoardShare] = useState(DEFAULT_BOARD_SHARE);
  const boardShareRef = useRef(DEFAULT_BOARD_SHARE);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  function applyBoardShare(value: number): number {
    const nextShare = clampBoardShare(value);
    boardShareRef.current = nextShare;
    const rightColumn = rightColumnRef.current;
    if (rightColumn) rightColumn.style.gridTemplateRows = `${nextShare}fr ${SEPARATOR_SIZE}px ${100 - nextShare}fr`;
    const separator = separatorRef.current;
    separator?.setAttribute('aria-valuenow', String(nextShare));
    separator?.setAttribute('aria-valuetext', `Jev board ${nextShare} percent, decision panel ${100 - nextShare} percent`);
    return nextShare;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const bounds = rightColumnRef.current?.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, top: bounds.top, height: bounds.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const availableHeight = drag.height - SEPARATOR_SIZE;
    const share = ((event.clientY - drag.top - SEPARATOR_SIZE / 2) / availableHeight) * 100;
    applyBoardShare(share);
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setBoardShare(boardShareRef.current);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const change = event.key === 'ArrowUp' ? -KEYBOARD_STEP : KEYBOARD_STEP;
    setBoardShare(applyBoardShare(boardShareRef.current + change));
  }

  const [board, decisionPanel] = Children.toArray(children);

  return (
    <div
      className="right-column"
      ref={rightColumnRef}
      style={{ gridTemplateRows: `${boardShare}fr ${SEPARATOR_SIZE}px ${100 - boardShare}fr` }}
    >
      {board}
      <div
        className="panel-resizer"
        ref={separatorRef}
        role="separator"
        tabIndex={0}
        aria-label="Resize Jev board and decision panel"
        aria-orientation="horizontal"
        aria-valuemin={MIN_BOARD_SHARE}
        aria-valuemax={MAX_BOARD_SHARE}
        aria-valuenow={boardShare}
        aria-valuetext={`Jev board ${boardShare} percent, decision panel ${100 - boardShare} percent`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      />
      {decisionPanel}
    </div>
  );
}
