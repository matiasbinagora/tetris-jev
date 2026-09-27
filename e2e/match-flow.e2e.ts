import { expect, test, type Page } from '@playwright/test';

interface JevDecisionRequest {
  seed: number;
  candidates: Array<{ id: string }>;
}

interface MockDecisionResponse {
  status: number;
  body: Record<string, unknown>;
}

type DecisionResponder = (request: JevDecisionRequest, requestNumber: number) => MockDecisionResponse;

async function mockJevDecisionRoute(page: Page, respond: DecisionResponder): Promise<JevDecisionRequest[]> {
  const requests: JevDecisionRequest[] = [];
  await page.route('**/api/jev/decision', async (route) => {
    const request = route.request().postDataJSON() as JevDecisionRequest;
    requests.push(request);
    const response = respond(request, requests.length);
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    });
  });
  return requests;
}

function successfulChoice(request: JevDecisionRequest): MockDecisionResponse {
  const probabilities = Object.fromEntries(
    request.candidates.map(({ id }) => [id, 1 / request.candidates.length]),
  );
  return {
    status: 200,
    body: { choice: request.candidates[0].id, probabilities },
  };
}

test('starts a match, retries the same Jev decision, advances a round, pauses, resumes, and restarts', async ({ page }) => {
  const requests = await mockJevDecisionRoute(page, (request, requestNumber) =>
    requestNumber === 1
      ? { status: 502, body: { error: 'jev_request_failed' } }
      : successfulChoice(request),
  );

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ready' })).toBeVisible();
  await page.getByRole('button', { name: /start match/i }).click();
  await expect(page.getByRole('heading', { name: 'Retry required' })).toBeVisible();
  expect(requests).toHaveLength(1);

  await page.getByRole('button', { name: 'Retry Jev' }).click();
  await expect(page.getByRole('region', { name: 'Jev decision facts' })).toBeVisible();
  await expect(page.getByText('Selected', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[1])).toBe(JSON.stringify(requests[0]));

  const humanControls = page.getByRole('group', { name: 'Human game board controls' });
  await humanControls.press('Space');
  await expect(page.locator('.round-indicator')).toHaveText('ROUND 02');
  await expect(page.getByText('Waiting for you', { exact: true })).toBeVisible();
  await expect.poll(() => requests.length).toBe(3);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('heading', { name: 'Playing' })).toBeVisible();

  const originalSeed = requests[0].seed;
  await page.getByRole('button', { name: 'New match' }).click();
  await expect(page.locator('.round-indicator')).toHaveText('ROUND 01');
  await expect(page.getByText('Waiting for you', { exact: true })).toBeVisible();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3].seed).not.toBe(originalSeed);
});

test('finishes a match after the human uses hard drop through the shared rounds', async ({ page }) => {
  const requests = await mockJevDecisionRoute(page, successfulChoice);

  await page.goto('/');
  await page.getByRole('button', { name: /start match/i }).click();
  await expect(page.getByText('Waiting for you', { exact: true })).toBeVisible();

  const humanControls = page.getByRole('group', { name: 'Human game board controls' });
  const finished = page.getByRole('heading', { name: 'Finished' });
  for (let round = 0; round < 30 && !(await finished.isVisible().catch(() => false)); round += 1) {
    const currentRound = await page.locator('.round-indicator').textContent();
    await humanControls.press('Space');
    await expect.poll(async () => {
      if (await finished.isVisible().catch(() => false)) return 'Finished';
      return page.locator('.round-indicator').textContent();
    }).not.toBe(currentRound);
  }

  await expect(finished).toBeVisible();
  await expect(page.getByText(/You win this match\.|Jev wins this match\.|The match ended in a draw\./)).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
});
