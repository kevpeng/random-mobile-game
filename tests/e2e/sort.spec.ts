import { expect, test, type Page } from '@playwright/test';
import { applyMove, colorsOf, lastWinnable, moveCount, solve, type SortPuzzle } from '../../src/sort/game';

async function savedPuzzle(page: Page): Promise<{ puzzle: SortPuzzle; stacks: number[][] }> {
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('sort:game:v1');
    return raw && JSON.parse(raw).puzzle;
  });
  return page.evaluate(() => JSON.parse(localStorage.getItem('sort:game:v1')!));
}

async function tapTube(page: Page, i: number) {
  const box = (await page.locator(`[data-tube="${i}"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.up();
}

test('home → sort, pick up, move, undo, solve', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'test-results/sort-00-home.png' });
  await page.locator('.game-card', { hasText: 'Sort' }).click();
  await expect(page.locator('.ball')).toHaveCount(28); // Medium: 7 colours × 4
  const { puzzle, stacks } = await savedPuzzle(page);
  const cap = puzzle.config.height;
  await page.screenshot({ path: 'test-results/sort-01-start.png' });

  // Clock waits for the first move.
  await page.waitForTimeout(1200);
  await expect(page.locator('.timer')).toContainText('0:00');

  // Tapping a tube lifts it (and starts the clock); tapping again puts it back.
  await tapTube(page, 0);
  await expect(page.locator('.tube--sel')).toHaveCount(1);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/sort-02-lifted.png' });
  await tapTube(page, 0);
  await expect(page.locator('.tube--sel')).toHaveCount(0);

  // A legal move into an empty tube, then undo.
  const empty = stacks.findIndex((s) => s.length === 0);
  await tapTube(page, 0);
  await tapTube(page, empty);
  await expect(page.locator('.timer small')).toHaveText('1 move');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.timer small')).toHaveText('2 moves');

  // Hint highlights two tubes.
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('.tube--hint')).toHaveCount(2);

  // Solve with the solver's move list.
  let cs = colorsOf(puzzle, stacks);
  const path = solve(cs, cap)!;
  for (const [f, t] of path) {
    await tapTube(page, f);
    await tapTube(page, t);
    cs = applyMove(cs, f, t, moveCount(cs, f, t, cap));
  }
  const win = page.getByRole('dialog', { name: 'Solved' });
  await expect(win).toBeVisible();
  await expect(win.locator('.win__time')).toHaveText(/^\d+:\d\d$/);
  await expect(win.locator('.win__meta')).toContainText('moves');
  await expect(page.locator('.timer')).not.toContainText('0:00');
  const stopped = await page.locator('.timer').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('.timer')).toHaveText(stopped!);
  await page.screenshot({ path: 'test-results/sort-03-win.png' });
  await page.getByRole('button', { name: 'Next puzzle' }).click();
  await expect(page.getByRole('dialog', { name: 'Solved' })).toHaveCount(0);
});

test('sort menu presets and back to home', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Sort' }).click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/sort-04-menu.png' });
  await page.locator('.presets .size', { hasText: 'Expert' }).click();
  await expect(page.locator('.ball')).toHaveCount(60);
  await expect(page.locator('.tube')).toHaveCount(14);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/sort-05-expert.png' });
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.game-card')).toHaveCount(3);
});

test('sort dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Sort' }).click();
  await expect(page.locator('.ball').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/sort-06-dark.png' });
});

test('out of moves shows the fail screen; undo and restart clear it', async ({ page }) => {
  // Colours per tube: [0] [1] [2,2] [0,3] [1,3], height 2 — no useful move left.
  const colors = [0, 1, 2, 2, 0, 3, 1, 3];
  const stuck = [[0], [1], [2, 3], [4, 5], [6, 7]];
  const initial = [[0, 1], [2, 3], [4, 5], [6, 7], []];
  await page.goto('/');
  await page.evaluate(
    (game) => {
      localStorage.setItem('sort:game:v1', JSON.stringify(game));
      localStorage.setItem('puzzles:route:v1', JSON.stringify({ route: 'sort' }));
    },
    {
      puzzle: { config: { colors: 4, height: 2, empty: 1 }, colors, stacks: initial, seed: 1 },
      stacks: stuck,
      history: [initial],
      moves: 5,
      won: false,
    },
  );
  await page.reload();
  const fail = page.getByRole('dialog', { name: 'No moves left' });
  await expect(fail).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/sort-07-stuck.png' });

  await fail.getByRole('button', { name: 'Undo last move' }).click();
  await expect(fail).toHaveCount(0);

  // Back into the stuck position via storage, then Restart.
  await page.evaluate((s) => {
    const g = JSON.parse(localStorage.getItem('sort:game:v1')!);
    localStorage.setItem('sort:game:v1', JSON.stringify({ ...g, stacks: s, history: [] }));
  }, stuck);
  await page.reload();
  await expect(fail).toBeVisible();
  await expect(fail.getByRole('button', { name: 'Undo last move' })).toHaveCount(0);
  await fail.getByRole('button', { name: 'Restart' }).click();
  await expect(fail).toHaveCount(0);
  await expect(page.locator('.timer small')).toHaveText('0 moves');
  await expect(page.locator('.timer')).toContainText('0:00');
});

test('moves use one consistent rise → slide → drop path with fixed timing', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Sort' }).click();
  await expect(page.locator('.ball')).toHaveCount(28);
  const { stacks } = await savedPuzzle(page);

  const path = (id: number) =>
    page.evaluate((id) => {
      const el = document.querySelector<HTMLElement>(`.ball[data-id="${id}"]`)!;
      const effect = el.getAnimations()[0].effect as KeyframeEffect;
      const pts = effect.getKeyframes().map((k) => {
        const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(String(k.transform))!; // ignores scale()
        return { x: Number(m[1]), y: Number(m[2]) };
      });
      return { duration: effect.getTiming().duration, delay: effect.getTiming().delay, pts };
    }, id);

  const straightSegments = (pts: { x: number; y: number }[]) =>
    pts.slice(1).every((p, i) => Math.abs(p.x - pts[i].x) < 0.5 || Math.abs(p.y - pts[i].y) < 0.5);

  // Medium: 5 tubes on the top row, 4 below; both empty tubes are on the bottom row.
  const empty = stacks.findIndex((s) => s.length === 0);
  const topOf = (t: number) => stacks[t][stacks[t].length - 1];

  // 1) Same row (bottom-row tube 5 → empty): already lifted, so slide + drop only.
  await tapTube(page, 5);
  await page.waitForTimeout(300);
  await tapTube(page, empty);
  let a = await path(topOf(5));
  expect(a.duration).toBe(270); // 150 slide + 120 drop
  expect(a.delay).toBe(0); // no stagger
  expect(a.pts).toHaveLength(3);
  expect(straightSegments(a.pts)).toBe(true);
  expect(a.pts[2].y).toBeGreaterThan(a.pts[1].y); // ends dropping down

  // 2) Undo: not lifted, so it rises first — same shape, fixed timing.
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Undo' }).click();
  a = await path(topOf(5));
  expect(a.duration).toBe(360); // 90 rise + 150 slide + 120 drop
  expect(a.pts).toHaveLength(4);
  expect(straightSegments(a.pts)).toBe(true);

  // 3) Across rows (top-row tube 0 → bottom-row empty): slides along the top rail,
  //    then drops straight down — no diagonal.
  await page.waitForTimeout(400);
  await tapTube(page, 0);
  await page.waitForTimeout(300);
  await tapTube(page, empty);
  a = await path(topOf(0));
  expect(a.duration).toBe(270);
  expect(straightSegments(a.pts)).toBe(true);
});

test('drag and drop: valid drop moves, invalid or empty-space drop returns', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Sort' }).click();
  await expect(page.locator('.ball')).toHaveCount(28);
  const { puzzle, stacks } = await savedPuzzle(page);
  const cs = colorsOf(puzzle, stacks);
  const center = async (i: number, fy = 0.7) => {
    const b = (await page.locator(`[data-tube="${i}"]`).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height * fy };
  };
  const dragTo = async (from: number, to: { x: number; y: number }) => {
    const a = await center(from);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
  };
  const moves = page.locator('.timer small');

  // 1) Invalid target: a full tube whose top colour differs → shakes, returns home.
  const src = 0;
  const bad = cs.findIndex((s, i) => i !== src && s.length === 4 && s[3] !== cs[src][3]);
  await dragTo(src, await center(bad));
  await expect(page.locator('.tube--target')).toHaveCount(0); // not highlighted
  await page.mouse.up();
  await expect(page.locator('.tube--sel')).toHaveCount(0);
  await expect(moves).toHaveText('0 moves');

  // 2) Released over empty space → returns home, no move.
  await page.waitForTimeout(300);
  const box = (await page.locator('.tubes-wrap').boundingBox())!;
  await dragTo(src, { x: box.x + 4, y: box.y + 4 });
  await page.mouse.up();
  await expect(page.locator('.tube--sel')).toHaveCount(0);
  await expect(moves).toHaveText('0 moves');

  // 3) Valid target (an empty tube) is highlighted while hovering, and the drop moves the run.
  await page.waitForTimeout(300);
  const empty = cs.findIndex((s) => s.length === 0);
  const topId = stacks[src][stacks[src].length - 1];
  await dragTo(src, await center(empty));
  await expect(page.locator(`[data-tube="${empty}"].tube--target`)).toHaveCount(1);
  await page.screenshot({ path: 'test-results/sort-08-dragging.png' });
  await page.mouse.up();
  await expect(moves).toHaveText('1 move');
  await expect(page.locator('.tube--target')).toHaveCount(0);
  const saved = await savedPuzzle(page);
  expect(saved.stacks[empty]).toContain(topId);

  // The ball lands exactly in its slot once the animation ends.
  await page.waitForTimeout(400);
  const landed = await page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`.ball[data-id="${id}"]`)!;
    return { anims: el.getAnimations().length, z: el.style.zIndex, t: el.style.transform };
  }, topId);
  expect(landed.anims).toBe(0);
  expect(landed.z).toBe('');
  expect(landed.t).not.toContain('scale');

  // 4) Tap-tap still works alongside dragging (into the other empty tube).
  const empty2 = cs.findIndex((s, i) => s.length === 0 && i !== empty);
  await tapTube(page, empty);
  await tapTube(page, empty2);
  await expect(moves).toHaveText('2 moves');
});

test('dead end (moves left, but unwinnable) gets the full-screen dead-end dialog', async ({ page }) => {
  // 3 colours, height 3, one spare tube; colours per piece id:
  const colors = [0, 0, 1, 0, 2, 1, 1, 2, 2];
  const initial = [[0, 1, 2], [3, 4, 5], [6, 7, 8], []];
  const afterOne = [[0, 1], [3, 4, 5], [6, 7, 8], [2]];
  const dead = [[0, 1], [3, 4], [6, 7, 8], [2, 5]];
  const back = lastWinnable([initial, afterOne].map((s) => colorsOf({ colors }, s)), 3);

  await page.goto('/');
  await page.evaluate(
    (game) => {
      localStorage.setItem('sort:game:v1', JSON.stringify(game));
      localStorage.setItem('puzzles:route:v1', JSON.stringify({ route: 'sort' }));
    },
    {
      puzzle: { config: { colors: 3, height: 3, empty: 1 }, colors, stacks: initial, seed: 1 },
      stacks: dead,
      history: [initial, afterOne],
      moves: 2,
      won: false,
      elapsed: 12_000,
    },
  );
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Dead end' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('none of them can sort the tubes');
  await expect(dialog).toContainText('0:12 · 2 moves');
  // Clock is stopped while stuck.
  await page.waitForTimeout(1200);
  await expect(page.locator('.timer')).toContainText('0:12');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/sort-09-deadend.png' });

  if (back !== null && back > 1) {
    await dialog.getByRole('button', { name: /Back to last winnable/ }).click();
  } else {
    await expect(dialog.getByRole('button', { name: /Back to last winnable/ })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Undo last move' }).click();
  }
  await expect(dialog).toHaveCount(0);

  // New puzzle from the dialog works too.
  await page.evaluate((s) => {
    const g = JSON.parse(localStorage.getItem('sort:game:v1')!);
    localStorage.setItem('sort:game:v1', JSON.stringify({ ...g, stacks: s, history: [g.puzzle.stacks] }));
  }, dead);
  await page.reload();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'New puzzle' }).click();
  await expect(dialog).toHaveCount(0);
});
