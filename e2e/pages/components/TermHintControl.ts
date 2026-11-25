/**
 * Component POM for the in-place term definitions (#2258): the underlined `TermHint` (a focusable
 * term with a tooltip) and the `TermHintPopover` (an ⓘ button that opens a non-modal panel).
 *
 * - Underlined hint: `term(scope, 'Allocated')` is the focusable text span; `bubble(term)` is its
 *   `role="tooltip"` bubble. The bubble is always in the DOM and is shown with `opacity`, so
 *   "visible" is asserted with `toHaveCSS('opacity', '1')` (`toBeVisible()` also passes at 0).
 * - Popover: `explainButton(scope)` is the ⓘ button (accessible name "Explain these terms", or
 *   "Explain “<term>”" for a single term); `popover` is the dialog named "What these terms mean".
 * - Chips (`Badge`) carry the definition as a native `title`; assert it with `toHaveAttribute`.
 */

import type { Locator, Page } from '@playwright/test';

export const TERM_HINT_PANEL_NAME = 'What these terms mean';

function exactText(label: string): RegExp {
  return new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

export class TermHintControl {
  readonly page: Page;
  /** The open popover panel (AnchoredPanel, role dialog). */
  readonly popover: Locator;

  constructor(page: Page) {
    this.page = page;
    this.popover = page.getByRole('dialog', { name: TERM_HINT_PANEL_NAME });
  }

  /** The focusable underlined term whose text is exactly `label`, inside `scope`. */
  term(scope: Locator, label: string): Locator {
    return scope.locator('[tabindex="0"]').filter({ hasText: exactText(label) });
  }

  /** The tooltip bubble of an underlined term. */
  bubble(term: Locator): Locator {
    return term.locator('xpath=parent::span/following-sibling::span[@role="tooltip"]');
  }

  /** The ⓘ button inside `scope`; `name` narrows it to one accessible name. */
  explainButton(scope: Locator, name: string | RegExp = /^Explain/): Locator {
    return scope.getByRole('button', { name });
  }

  /** A `<dt>` of the popover's list with its `<dd>` definition. */
  popoverEntry(term: string): { name: Locator; definition: Locator } {
    const name = this.popover.locator('dt').filter({ hasText: exactText(term) });
    return { name, definition: name.locator('xpath=following-sibling::dd[1]') };
  }
}
