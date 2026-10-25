/**
 * Component POM for the shared `EntityPicker` (#2236): the one picker for companies, "Who"
 * (companies + household members), areas, orientations, trades, categories and tasks.
 *
 * It is a `SearchPicker` underneath (see `SearchPickerControl`), with these additions:
 * - grouped results (Who: "Companies" then "Household members"): each group is `role="group"`
 *   named by its heading; headings are not options, so ArrowDown never lands on one;
 * - area rows show the full path (`Ground floor › Hallway`): ancestors carry a `pathSegment`
 *   CSS-module class (muted), the last level `pathLast` (semibold); the option's accessible name
 *   is the names joined with ", ";
 * - a selected chip may carry a suffix ("Company", "Household member");
 * - the inline create row reads "New <kind word> <typed text>" and is the last option.
 *
 * Everything reaches rows by keyboard (`arrowTo`), never `.focus()`: the keyboard path is what
 * users take, and the picker ignores ArrowDown while a search is loading.
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { SearchPickerControl } from './SearchPickerControl.js';

/** The word the create row uses per kind ("New area Sunroom"). */
export type EntityKindWord = 'company' | 'area' | 'orientation' | 'trade' | 'category';

export class EntityPickerControl extends SearchPickerControl {
  constructor(page: Page, inputId: string | Locator, scope?: Locator) {
    super(page, inputId, scope);
  }

  /** The group wrapper whose heading reads `name` ("Companies", "Household members"). */
  group(name: string): Locator {
    return this.dropdown.getByRole('group', { name, exact: true });
  }

  /** The heading text node of a group (not an option). */
  groupHeading(name: string): Locator {
    return this.group(name).locator('[class*="groupHeading"]');
  }

  /** The option rows inside one group. */
  optionsInGroup(name: string): Locator {
    return this.group(name).getByRole('option');
  }

  /** The option whose accessible name is exactly `name` (areas: "Ground floor, Hallway"). */
  optionNamed(name: string): Locator {
    return this.dropdown.getByRole('option', { name, exact: true });
  }

  /** The create row ("New trade Plumbing"). Without `text`, any create row of the kind. */
  createOption(kindWord: EntityKindWord, text?: string): Locator {
    const name =
      text === undefined
        ? new RegExp(`^New ${kindWord} `)
        : new RegExp(`^New ${kindWord} ${escapeRegExp(text)}$`);
    return this.dropdown.getByRole('option', { name });
  }

  /** The muted ancestor levels inside an option's area path. */
  pathAncestors(option: Locator): Locator {
    return option.locator('[class*="pathSegment"]');
  }

  /** The last (semibold) level of an option's area path. */
  pathLast(option: Locator): Locator {
    return option.locator('[class*="pathLast"]');
  }

  /** The suffix next to the selected chip's title ("Company", "Household member"). */
  selectedSuffix(): Locator {
    return this.selectedDisplay().locator('[class*="selectedSuffix"]');
  }

  /**
   * Move focus to `option` with ArrowDown (retrying while the list settles: a search answer can
   * re-render the rows and swallow a key) and return once it holds focus.
   */
  async arrowTo(option: Locator): Promise<void> {
    await expect(option).toBeVisible();
    const isFocused = () =>
      option.evaluate((el) => el === document.activeElement).catch(() => false);
    await expect(async () => {
      // A long unfiltered list (a trade picker re-opened after its create dialog) needs many
      // presses: walk it inside one attempt instead of one press per retry
      for (let step = 0; step < 40 && !(await isFocused()); step++) {
        if (await this.page.evaluate(() => document.activeElement === document.body)) {
          await this.input.click();
        }
        await this.page.keyboard.press('ArrowDown');
      }
      expect(await isFocused()).toBe(true);
    }).toPass();
  }

  /** Arrow to `option` and activate it with Enter. */
  async choose(option: Locator): Promise<void> {
    await this.arrowTo(option);
    await this.page.keyboard.press('Enter');
    await expect(this.dropdown).toBeHidden();
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
