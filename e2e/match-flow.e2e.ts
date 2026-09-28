import { expect, test, type Page } from '@playwright/test';

interface JevDecisionRequest { seed: number; sequenceIndex: number; candidates: Array<{ id: string }> }
interface MockDecisionResponse { status: number; body: Record<string, unknown> }
type DecisionResponder = (request: JevDecisionRequest, requestNumber: number) => MockDecisionResponse | Promise<MockDecisionResponse>;

async function mockJevDecisionRoute(page: Page, respond: DecisionResponder): Promise<JevDecisionRequest[]> {
  const requests: JevDecisionRequest[] = [];
  await page.route('**/api/jev/decision', async (route) => {
    const request = route.request().postDataJSON() as JevDecisionRequest;
    requests.push(request);
    const response = await respond(request, requests.length);
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) });
  });
  return requests;
}

function successfulChoice(request: JevDecisionRequest): MockDecisionResponse {
  const probabilities = Object.fromEntries(request.candidates.map(({ id }) => [id, 1 / request.candidates.length]));
  return { status: 200, body: { choice: request.candidates[0].id, probabilities } };
}

test('resizes Jev panels by dragging and keyboard without changing the human column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const humanArea = page.locator('.player-area--human');
  const humanBefore = await humanArea.boundingBox();
  const rightColumn = page.locator('.right-column');
  const separator = page.getByRole('separator', { name: 'Resize Jev board and decision panel' });
  await expect(separator).toHaveAttribute('aria-valuenow', '70');
  const bounds = await separator.boundingBox();
  if (!bounds) throw new Error('Panel separator has no layout bounds.');
  const dividerX = bounds.x + bounds.width / 2;
  const dividerY = bounds.y + bounds.height / 2;
  await page.mouse.move(dividerX, dividerY);
  await page.mouse.down();
  await page.mouse.move(dividerX, dividerY - 90, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => separator.getAttribute('aria-valuenow').then(Number)).toBeLessThan(70);
  const draggedShare = Number(await separator.getAttribute('aria-valuenow'));
  expect(draggedShare).toBeGreaterThanOrEqual(50);
  expect(draggedShare).toBeLessThanOrEqual(80);
  await expect.poll(() => rightColumn.evaluate((node) => Number.parseFloat((node as HTMLElement).style.gridTemplateRows)))
    .toBeCloseTo(draggedShare, 2);
  expect(await humanArea.boundingBox()).toEqual(humanBefore);

  await separator.focus();
  await page.keyboard.press('ArrowUp');
  expect(Number(await separator.getAttribute('aria-valuenow'))).toBe(Math.max(50, draggedShare - 5));
  for (let step = 0; step < 20; step += 1) await page.keyboard.press('ArrowDown');
  await expect(separator).toHaveAttribute('aria-valuenow', '80');
  await expect(separator).toHaveAttribute('aria-valuetext', 'Jev board 80 percent, decision panel 20 percent');
});

test('hides the separator when the right panels stack on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 950, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('separator', { name: 'Resize Jev board and decision panel' })).toBeHidden();
  await expect(page.getByRole('heading', { name: "Jev's board" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ready' })).toBeVisible();
  await expect(page.locator('.right-column')).toHaveCSS('display', 'flex');
});

test('keeps human controls live during Jev latency and starts Jev next piece independently', async ({ page }) => {
  let release!: () => void;
  const decisionGate = new Promise<void>((resolve) => { release = resolve; });
  const requests = await mockJevDecisionRoute(page, async (request, number) => {
    if (number === 1) await decisionGate;
    return successfulChoice(request);
  });

  await page.goto('/');
  await page.getByRole('button', { name: /start match/i }).click();
  await expect(page.getByRole('heading', { name: 'Jev deciding' })).toBeVisible();
  const humanControls = page.getByRole('group', { name: 'Human game board controls' });
  await humanControls.press('Space');
  await expect(page.locator('.round-indicator')).toContainText('HUMAN 02');
  await expect(page.locator('.round-indicator')).toContainText('JEV 01');
  await expect(page.locator('.round-indicator')).toContainText('You +1');

  release();
  await expect(page.getByRole('region', { name: 'Jev decision facts' })).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.locator('.round-indicator')).toContainText('JEV 02');
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(2);
  expect(requests[0].sequenceIndex).toBe(0);
  expect(requests[1].sequenceIndex).toBe(1);
});

test('allows manual pause during Jev request and applies the retained decision on resume', async ({ page }) => {
  let release!: () => void;
  const decisionGate = new Promise<void>((resolve) => { release = resolve; });
  const requests = await mockJevDecisionRoute(page, async (request, number) => {
    if (number === 1) await decisionGate;
    return successfulChoice(request);
  });

  await page.goto('/');
  await page.getByRole('button', { name: /start match/i }).click();
  await expect(page.getByRole('heading', { name: 'Jev deciding' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  release();
  await expect(page.getByText('Jev’s response will apply when you resume.')).toBeVisible();
  await expect(page.locator('.round-indicator')).toContainText('JEV 01');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.round-indicator')).toContainText('JEV 02');
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(2);
});

test('retry resubmits the identical Jev snapshot while the human can keep playing', async ({ page }) => {
  const requests = await mockJevDecisionRoute(page, (request, number) =>
    number === 1 ? { status: 502, body: { error: 'jev_request_failed' } } : successfulChoice(request),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /start match/i }).click();
  await expect(page.getByRole('heading', { name: 'Retry required' })).toBeVisible();
  await page.getByRole('group', { name: 'Human game board controls' }).press('Space');
  await expect(page.locator('.round-indicator')).toContainText('HUMAN 02');
  await page.getByRole('button', { name: 'Retry Jev' }).click();
  await expect(page.locator('.round-indicator')).toContainText('JEV 02');
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[1])).toBe(JSON.stringify(requests[0]));
});

test('waits for Jev to pass the human survived-piece count after the human tops out', async ({ page }) => {
  await mockJevDecisionRoute(page, successfulChoice);
  await page.goto('/');
  await page.getByRole('button', { name: /start match/i }).click();
  const humanControls = page.getByRole('group', { name: 'Human game board controls' });
  const humanTopOut = page.locator('.player-area--human .status-pill').getByText('Topped out');
  for (let piece = 0; piece < 40 && !(await humanTopOut.isVisible().catch(() => false)); piece += 1) {
    await humanControls.press('Space');
  }
  await expect(humanTopOut).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Finished' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Jev wins this match.')).toBeVisible();
});

test('restores play focus after Start and Resume and accepts keys away from the board', async ({ page }) => {
  await mockJevDecisionRoute(page, successfulChoice);
  await page.goto('/');

  const humanControls = page.getByRole('group', { name: 'Human game board controls' });
  await page.getByRole('button', { name: /start match/i }).click();
  await expect(humanControls).toBeFocused();
  await expect(humanControls).toHaveCSS('outline-style', 'solid');

  const leftmostActiveColumn = () => humanControls.locator('.board__cell--active').evaluateAll((cells) =>
    Math.min(...cells.map((cell) => Array.from(cell.parentElement!.children).indexOf(cell) % 10)),
  );
  const beforeMove = await leftmostActiveColumn();
  await page.getByRole('heading', { name: 'Your board' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(leftmostActiveColumn).toBe(beforeMove - 1);

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(humanControls).toBeFocused();
});

test('preserves native Space activation for the Start button', async ({ page }) => {
  await mockJevDecisionRoute(page, successfulChoice);
  await page.goto('/');

  const humanControls = page.getByRole('group', { name: 'Human game board controls' });
  const startButton = page.getByRole('button', { name: /start match/i });
  await startButton.focus();
  await page.keyboard.press('Space');
  await expect(humanControls).toBeFocused();
});
