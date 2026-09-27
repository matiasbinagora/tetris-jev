/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchApp } from './match-app';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockJevDecisionRequest() {
  const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      candidates: Array<{ id: string }>;
    };
    const probability = 1 / body.candidates.length;
    return Response.json({
      choice: body.candidates[0].id,
      probabilities: Object.fromEntries(body.candidates.map(({ id }) => [id, probability])),
    });
  });
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('crypto', { randomUUID: () => 'ui-test-match' });
  return fetcher;
}

function activeVisibleCells(board: HTMLElement): number[] {
  return Array.from(board.querySelectorAll('.board__cell'))
    .flatMap((cell, index) => cell.classList.contains('board__cell--active') ? [index] : []);
}

describe('MatchApp keyboard focus boundary', () => {
  it('starts from native keyboard activation, handles game keys only on the human board, and prevents scrolling', async () => {
    const fetcher = mockJevDecisionRequest();
    const user = userEvent.setup();
    render(<MatchApp />);

    const board = screen.getByRole('group', { name: 'Human game board controls' });
    expect(board.getAttribute('tabindex')).toBe('0');

    await user.tab();
    expect(document.activeElement).toBe(board);
    await user.tab();
    const startButton = screen.getByRole('button', { name: /start match/i });
    expect(document.activeElement).toBe(startButton);
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Waiting for you')).not.toBeNull();
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    board.focus();

    const humanBoard = screen.getByRole('img', { name: /human tetris board/i });
    for (let index = 0; index < 2; index += 1) {
      fireEvent.keyDown(board, { key: 'ArrowDown' });
    }
    const beforeMove = activeVisibleCells(humanBoard);
    expect(beforeMove.length).toBeGreaterThan(0);
    const leftEvent = createEvent.keyDown(board, { key: 'ArrowLeft' });
    fireEvent(board, leftEvent);
    expect(leftEvent.defaultPrevented).toBe(true);
    const afterMove = activeVisibleCells(humanBoard);
    expect(afterMove).toEqual(beforeMove.map((index) => index - 1));

    const downEvent = createEvent.keyDown(board, { key: 'ArrowDown' });
    fireEvent(board, downEvent);
    expect(downEvent.defaultPrevented).toBe(true);
    const afterSoftDrop = activeVisibleCells(humanBoard);

    const pauseButton = screen.getByRole('button', { name: /pause/i });
    pauseButton.focus();
    const outsideEvent = createEvent.keyDown(pauseButton, { key: 'ArrowLeft' });
    fireEvent(pauseButton, outsideEvent);
    expect(outsideEvent.defaultPrevented).toBe(false);
    expect(activeVisibleCells(humanBoard)).toEqual(afterSoftDrop);
  });
});
