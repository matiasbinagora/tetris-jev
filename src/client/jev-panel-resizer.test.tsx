/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JevPanelResizer } from './jev-panel-resizer';

afterEach(cleanup);

function renderResizer() {
  return render(
    <JevPanelResizer>
      <section aria-label="Jev board panel" />
      <section aria-label="Jev decision panel" />
    </JevPanelResizer>,
  );
}

function dispatchPointer(target: HTMLElement, type: string, pointerId: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientY: { value: clientY },
    button: { value: 0 },
  });
  fireEvent(target, event);
}

describe('Jev panel resizer', () => {
  it('starts with the approved 70/30 split and accessible separator values', () => {
    const { container } = renderResizer();
    const separator = screen.getByRole('separator', { name: 'Resize Jev board and decision panel' });

    expect(separator.getAttribute('aria-orientation')).toBe('horizontal');
    expect(separator.getAttribute('aria-valuenow')).toBe('70');
    expect(separator.getAttribute('aria-valuemin')).toBe('50');
    expect(separator.getAttribute('aria-valuemax')).toBe('80');
    expect(container.querySelector('.right-column')?.getAttribute('style')).toContain('70fr 24px 30fr');
  });

  it('adjusts with arrow keys in the requested direction and clamps at both bounds', () => {
    renderResizer();
    const separator = screen.getByRole('separator', { name: 'Resize Jev board and decision panel' });

    fireEvent.keyDown(separator, { key: 'ArrowUp' });
    expect(separator.getAttribute('aria-valuenow')).toBe('65');
    fireEvent.keyDown(separator, { key: 'ArrowDown' });
    expect(separator.getAttribute('aria-valuenow')).toBe('70');
    for (let step = 0; step < 8; step += 1) fireEvent.keyDown(separator, { key: 'ArrowUp' });
    expect(separator.getAttribute('aria-valuenow')).toBe('50');
    for (let step = 0; step < 20; step += 1) fireEvent.keyDown(separator, { key: 'ArrowDown' });
    expect(separator.getAttribute('aria-valuenow')).toBe('80');
  });

  it('tracks pointer drag within the right column and releases pointer capture', () => {
    const { container } = renderResizer();
    const rightColumn = container.querySelector('.right-column') as HTMLDivElement;
    const separator = screen.getByRole('separator', { name: 'Resize Jev board and decision panel' });
    vi.spyOn(rightColumn, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 500, bottom: 1000, width: 500, height: 1000, toJSON: () => ({}),
    });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperty(separator, 'setPointerCapture', { configurable: true, value: setPointerCapture });
    Object.defineProperty(separator, 'releasePointerCapture', { configurable: true, value: releasePointerCapture });

    dispatchPointer(separator, 'pointerdown', 7, 700);
    dispatchPointer(separator, 'pointermove', 7, 600);
    expect(Number(separator.getAttribute('aria-valuenow'))).toBeCloseTo(60, 0);
    dispatchPointer(separator, 'pointerup', 7, 600);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });
});
