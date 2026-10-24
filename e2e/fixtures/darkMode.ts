/**
 * Dark mode helpers: switch the theme the way the app does (`data-theme` on <html>) and assert a
 * surface is legible, i.e. its text colour has at least WCAG AA contrast (4.5:1) against the first
 * opaque background found walking up from the element.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export async function enableDarkTheme(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settleTransitions(page);
}

/** Wait for colour transitions to finish so computed colours are the final ones. */
export async function settleTransitions(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

/** The page body background is dark and the element's text reads against its own surface. */
export async function expectLegibleInDark(element: Locator, minRatio = 4.5): Promise<void> {
  await element
    .page()
    .evaluate(() =>
      Promise.all(
        document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      ),
    )
    .catch(() => undefined);
  const result = await element.evaluate((el) => {
    const parse = (value: string): [number, number, number, number] | null => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1]!
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
    };
    const luminance = ([r, g, b]: [number, number, number, number]) => {
      const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    let background: [number, number, number, number] | null = null;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg[3] >= 0.99) {
        background = bg;
        break;
      }
    }
    const text = parse(getComputedStyle(el).color);
    if (!background || !text) return { ratio: 0, pageLuminance: 1 };
    const l1 = luminance(text);
    const l2 = luminance(background);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const page = parse(getComputedStyle(document.body).backgroundColor);
    return { ratio, pageLuminance: page ? luminance(page) : 1 };
  });
  expect(result.pageLuminance, 'the page background is dark').toBeLessThan(0.2);
  expect(result.ratio, `text/background contrast of ${element}`).toBeGreaterThanOrEqual(minRatio);
}
