/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MatchApp } from './match-app';

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (matchMediaDescriptor) Object.defineProperty(window, 'matchMedia', matchMediaDescriptor);
  else Reflect.deleteProperty(window, 'matchMedia');
});

function mockJevDecisionRequest() {
  const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { candidates: Array<{ id: string }> };
    const probability = 1 / body.candidates.length;
    return Response.json({
      choice: body.candidates[0]!.id,
      probabilities: Object.fromEntries(body.candidates.map(({ id }) => [id, probability])),
    });
  });
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('crypto', {
    randomUUID: () => `landing-test-match-${Math.random()}`,
    getRandomValues: (values: Uint32Array) => {
      values[0] = 987654321;
      return values;
    },
  });
  return fetcher;
}

async function startMatch() {
  mockJevDecisionRequest();
  render(<MatchApp />);
  fireEvent.click(screen.getByRole('button', { name: /start match/i }));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return screen.getByRole('img', { name: /jev tetris board/i });
}

function activeVisibleCells(board: HTMLElement): number[] {
  return Array.from(board.querySelectorAll('.board__cell'))
    .flatMap((cell, index) => cell.classList.contains('board__cell--active') ? [index] : []);
}

describe('Jev landing presentation', () => {
  it('shows a midpoint and selected landing before locking the board', async () => {
    vi.useFakeTimers();
    const board = await startMatch();

    expect(board.getAttribute('data-landing-stage')).toBe('1');
    expect(screen.getByText(/JEV 01/)).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(board.getAttribute('data-landing-stage')).toBe('1');
    expect(screen.getByText(/JEV 01/)).not.toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(board.getAttribute('data-landing-stage')).toBe('2');
    expect(screen.getByText(/JEV 01/)).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(board.getAttribute('data-landing-stage')).toBeNull();
    expect(screen.getByText(/JEV 02/)).not.toBeNull();
  });

  it('holds the current landing stage while the match is paused', async () => {
    vi.useFakeTimers();
    const board = await startMatch();
    expect(board.getAttribute('data-landing-stage')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(board.getAttribute('data-landing-stage')).toBe('1');
    expect(screen.getByText(/JEV 01/)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(board.getAttribute('data-landing-stage')).toBe('2');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(board.getAttribute('data-landing-stage')).toBeNull();
    expect(screen.getByText(/JEV 02/)).not.toBeNull();
  });

  it('keeps human controls active while Jev animates', async () => {
    vi.useFakeTimers();
    await startMatch();
    const humanBoard = screen.getByRole('img', { name: /human tetris board/i });
    const controls = screen.getByRole('group', { name: 'Human game board controls' });
    controls.focus();
    const before = activeVisibleCells(humanBoard);

    fireEvent.keyDown(controls, { key: 'ArrowLeft' });

    expect(activeVisibleCells(humanBoard)).toEqual(before.map((index) => index - 1));
    expect(screen.getByRole('img', { name: /jev tetris board/i }).getAttribute('data-landing-stage')).toBe('1');
  });

  it('applies the selected landing immediately when reduced motion is preferred', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true, media: '(prefers-reduced-motion: reduce)' })),
    });
    const board = await startMatch();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(board.getAttribute('data-landing-stage')).toBeNull();
    expect(screen.getByText(/JEV 02/)).not.toBeNull();
  });

  it('does not let a previous landing timer advance a restarted match', async () => {
    vi.useFakeTimers();
    mockJevDecisionRequest();
    render(<MatchApp />);
    fireEvent.click(screen.getByRole('button', { name: /start match/i }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    const board = screen.getByRole('img', { name: /jev tetris board/i });
    expect(board.getAttribute('data-landing-stage')).toBe('1');

    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    fireEvent.click(screen.getByRole('button', { name: /new match/i }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    const restartedBoard = screen.getByRole('img', { name: /jev tetris board/i });
    expect(restartedBoard.getAttribute('data-landing-stage')).toBe('1');
    expect(screen.getByText(/JEV 01/)).not.toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(199); });
    expect(restartedBoard.getAttribute('data-landing-stage')).toBe('1');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(restartedBoard.getAttribute('data-landing-stage')).toBe('1');
    await act(async () => { await vi.advanceTimersByTimeAsync(99); });
    expect(restartedBoard.getAttribute('data-landing-stage')).toBe('1');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(restartedBoard.getAttribute('data-landing-stage')).toBe('2');
    expect(screen.getByText(/JEV 01/)).not.toBeNull();
  });
});
