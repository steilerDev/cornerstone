/**
 * Accessibility helpers (Story #2261, EPIC-21 Phase P6).
 *
 * - `expectNoAxeViolations`: axe-core with the WCAG 2.0/2.1 A + AA tag set. No rule is disabled
 *   and nothing is excluded: a finding is fixed in the app, not hidden here.
 * - `expectTouchTargets`: every interactive element has a hit area of at least 44 x 44 px
 *   (WCAG 2.5.5, phone width). Exemptions are listed once, in `TOUCH_TARGET_EXEMPTIONS`.
 * - `expectNoHorizontalOverflow`: no sideways page scroll (WCAG 1.4.10 reflow; 320 px is the
 *   equivalent of 1280 px at 400% zoom).
 * - `expectVisibleFocusWhileTabbing`: every keyboard stop shows a focus indicator (WCAG 2.4.7).
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { settleTransitions } from './darkMode.js';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Minimum hit area in CSS px (`--touch-target-min`). */
export const TOUCH_TARGET_MIN = 44;

/**
 * The only elements the touch-target check skips. Each entry cites WCAG 2.5.5 (Target Size):
 * a) inline links inside a run of prose (the "inline" exception),
 * b) elements inside the Gantt SVG canvas and the calendar month grid: position and span encode
 *    dates, so the size is essential to the information (the "essential" exception).
 *    Week-view calendar items are NOT exempt; they reach 44 px through touchSized,
 * c) the skip link while it is visually hidden (it is not a target until it has focus),
 * d) the BudgetBar chart (data-chart="budget-bar"): segment width encodes the amount (essential);
 *    segments are aria-hidden pointer shortcuts and the focusable bar is the keyboard path.
 */
export const TOUCH_TARGET_EXEMPTIONS = [
  'a: a with display inline whose parent block has text beyond the link (inline in prose)',
  'b: elements inside the Gantt SVG canvas or the calendar month grid (essential, position and span encode dates)',
  'c: the visually hidden skip link while unfocused',
  'd: the BudgetBar chart (data-chart="budget-bar"): segment width encodes the amount (essential); segments are aria-hidden pointer shortcuts and the focusable bar is the keyboard path',
] as const;

export interface A11yScanOptions {
  /** Names the page, theme and project in a failure report. */
  label: string;
  /** Limit the scan to a subtree (an open dialog). */
  include?: string;
}

/** Runs axe and asserts zero violations. The report lists id, impact, help and selectors only. */
export async function expectNoAxeViolations(page: Page, options: A11yScanOptions): Promise<void> {
  await settleTransitions(page);
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (options.include) builder = builder.include(options.include);
  const { violations } = await builder.analyze();
  const report = violations.map(
    (v) =>
      `${options.label}: ${v.id} (${v.impact ?? 'n/a'}) ${v.help}\n` +
      v.nodes.map((n) => `    ${n.target.join(' ')}`).join('\n'),
  );
  expect(report, `axe violations\n${report.join('\n')}`).toEqual([]);
}

/** Every visible interactive element has a hit area of at least 44 x 44 px. */
export async function expectTouchTargets(page: Page, options: { label: string }): Promise<void> {
  await settleTransitions(page);
  const offenders = await page.evaluate((min) => {
    const SELECTOR = [
      'a[href]',
      'button',
      'input:not([type=hidden])',
      'select',
      'textarea',
      'summary',
      '[role=button]',
      '[role=link]',
      '[role=tab]',
      '[role=menuitem]',
      '[role=menuitemradio]',
      '[role=checkbox]',
      '[role=radio]',
      '[role=switch]',
      '[role=option]',
      '[role=combobox]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const describe = (el: Element): string => {
      const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 30);
      const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}[${label}]`;
    };

    const hiddenSubtree = (el: Element): boolean => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (node.getAttribute('aria-hidden') === 'true') return true;
        if (node.hasAttribute('inert')) return true;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return true;
      }
      return false;
    };

    // Hit area: the larger of the element's box and its absolutely positioned ::before/::after.
    // An overlay counts only when it can take the tap: it is skipped when it has pointer-events:none,
    // or when the host is both its containing block and overflow-clipped. A static host's overflow
    // does not clip an absolutely positioned overlay anchored to an ancestor.
    const effectiveSize = (el: Element): { width: number; height: number } => {
      let box = el.getBoundingClientRect();
      if (
        el instanceof HTMLInputElement &&
        (el.type === 'checkbox' || el.type === 'radio') &&
        el.labels &&
        el.labels.length > 0
      ) {
        box = el.labels[0]!.getBoundingClientRect();
      }
      let width = box.width;
      let height = box.height;
      const host = getComputedStyle(el);
      const hostIsContainingBlock =
        host.position !== 'static' ||
        host.transform !== 'none' ||
        host.filter !== 'none' ||
        /paint|layout|strict|content/.test(host.contain);
      const hostClips =
        host.overflow !== 'visible' || host.overflowX !== 'visible' || host.overflowY !== 'visible';
      for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(el, pseudo);
        if (style.pointerEvents === 'none') continue;
        if (hostIsContainingBlock && hostClips) continue;
        if (style.position !== 'absolute' || style.content === 'none' || style.content === '') {
          continue;
        }
        width = Math.max(width, parseFloat(style.width) || 0);
        height = Math.max(height, parseFloat(style.height) || 0);
      }
      return { width, height };
    };

    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll(SELECTOR))) {
      if (hiddenSubtree(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Exemption (c), WCAG 2.5.5: the visually hidden skip link while unfocused
      if (el instanceof HTMLAnchorElement && el.getAttribute('href') === '#main-content') {
        if (document.activeElement !== el) continue;
      }
      // Exemption (b), WCAG 2.5.5 (essential): Gantt bar and calendar month-grid item
      // position and span encode dates
      if (el.closest('[data-testid="gantt-svg"]')) continue;
      if (el.closest('[data-testid="calendar-month-grid"]')) continue;
      // Exemption (d), WCAG 2.5.5 (essential)
      if (el.closest('[data-chart="budget-bar"]')) continue;
      // Exemption (a), WCAG 2.5.5 (inline): a link inside a run of prose
      if (el instanceof HTMLAnchorElement && getComputedStyle(el).display === 'inline') {
        const parent = el.parentElement;
        const parentText = (parent?.textContent ?? '').trim();
        if (parent && parentText.length > (el.textContent ?? '').trim().length) continue;
      }
      const size = effectiveSize(el);
      // Sub-pixel tolerance for fractional layout
      if (size.width < min - 0.5 || size.height < min - 0.5) {
        found.push(`${describe(el)} ${Math.round(size.width)}x${Math.round(size.height)}`);
      }
    }
    return found;
  }, TOUCH_TARGET_MIN);
  expect(offenders, `${options.label}: targets below 44x44\n${offenders.join('\n')}`).toEqual([]);
}

/** The page does not scroll sideways. */
export async function expectNoHorizontalOverflow(
  page: Page,
  options: { label?: string } = {},
): Promise<void> {
  await settleTransitions(page);
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    if (root.scrollWidth <= root.clientWidth) return null;
    const widest = Array.from(document.body.querySelectorAll('*'))
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter((entry) => entry.right > root.clientWidth + 0.5)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5)
      .map((entry) => {
        const cls = typeof entry.el.className === 'string' ? entry.el.className.split(' ')[0] : '';
        return `${entry.el.tagName.toLowerCase()}${cls ? '.' + cls : ''} right=${Math.round(entry.right)}`;
      });
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, widest };
  });
  expect(
    overflow,
    `${options.label ?? 'page'}: horizontal overflow ${JSON.stringify(overflow)}`,
  ).toBeNull();
}

/**
 * Tab through the page. For each stop the focused element (and two ancestors) must look
 * different focused than blurred. Stops early when focus returns to body or loops.
 */
export async function expectVisibleFocusWhileTabbing(
  page: Page,
  options: { stops?: number; label?: string } = {},
): Promise<void> {
  const stops = options.stops ?? 40;
  const failures: string[] = [];

  // Style snapshot of the element and two ancestors; runs in the page against a handle
  const snapshot = (el: Element): string => {
    const props = [
      'outlineStyle',
      'outlineWidth',
      'outlineColor',
      'boxShadow',
      'borderColor',
      'backgroundColor',
      'textDecorationLine',
    ] as const;
    const out: string[] = [];
    let node: Element | null = el;
    for (let depth = 0; depth < 3 && node; depth += 1, node = node.parentElement) {
      for (const pseudo of [null, '::after', '::before'] as const) {
        const style = pseudo ? getComputedStyle(node, pseudo) : getComputedStyle(node);
        for (const prop of props) out.push(style[prop]);
      }
    }
    return out.join('|');
  };

  const visited = new Set<string>();
  for (let i = 0; i < stops; i += 1) {
    await page.keyboard.press('Tab');
    const handle = await page.evaluateHandle(() =>
      document.activeElement === document.body ? null : document.activeElement,
    );
    const element = handle.asElement();
    if (!element) {
      await handle.dispose();
      break;
    }
    const id = await element.evaluate((el) => {
      const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
      const text = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 30);
      const path: number[] = [];
      for (let node: Element | null = el; node?.parentElement; node = node.parentElement) {
        path.push(Array.from(node.parentElement.children).indexOf(node));
      }
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}[${text}]@${path.join('.')}`;
    });
    if (visited.has(id)) {
      await handle.dispose();
      break;
    }
    visited.add(id);

    await settleTransitions(page);
    const focused = await element.evaluate(snapshot);
    await element.evaluate((el) => (el as HTMLElement).blur());
    await settleTransitions(page);
    const blurred = await element.evaluate(snapshot);
    if (focused === blurred) failures.push(id);
    // Restore focus with keyboard semantics and carry on from this stop
    await element.evaluate((el) =>
      (el as HTMLElement).focus({ focusVisible: true } as FocusOptions),
    );
    await handle.dispose();
  }
  expect(failures, `${options.label ?? 'page'}: focus stops without a visible indicator`).toEqual(
    [],
  );
}
