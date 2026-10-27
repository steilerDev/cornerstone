/**
 * Page Object Model for the New funding source and New grant dialogs (#2242): the shared
 * ObjectForm, a Modal from 768 px and a full-screen Sheet below. Opened in place by the App-root
 * FinancingCreateProvider (Financing page buttons, New menu, `?create=1&kind=source|grant`).
 *
 * - Funding source (test id `source-form`, title "New funding source"): Name `#name`, Type
 *   `#sourceType` (Bank loan · Credit line · Savings · Other: Own funds cannot be created),
 *   Amount `#totalAmount`, Interest rate `#interestRate`, Status `#status`; behind More details
 *   Terms `#terms`, Reference `#reference`, Contact address `#contactAddress`, Notes `#notes`.
 * - Grant (test id `grant-form`, title "New grant"): Name `#name`, Rate (%) `#reductionValue`,
 *   Eligible costs up to `#maximumAmount`, "Eligible tasks and purchases" multi-picker `#items`
 *   (chips `grant-form-items-chip-<id>`, `-remove-<id>`, status `grant-form-items-status`), no
 *   type selector and no provider; behind More details Status `#applicationStatus`, Deadline
 *   `#applicationDeadline`, Cost categories `#categories` (`grant-form-categories-*`), Description,
 *   Eligibility, Notes. Save with no items shows "Choose at least one task or purchase".
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';

export type FinancingFormKind = 'source' | 'grant';

export class FinancingFormDialog extends ObjectFormDialog {
  readonly kind: FinancingFormKind;
  readonly name: Locator;
  // Funding source
  readonly sourceType: Locator;
  readonly amount: Locator;
  readonly interestRate: Locator;
  readonly sourceStatus: Locator;
  // Grant
  readonly rate: Locator;
  readonly cap: Locator;
  readonly items: EntityPickerControl;
  readonly itemChips: Locator;
  readonly itemsStatus: Locator;
  readonly categories: EntityPickerControl;
  readonly grantStatus: Locator;
  readonly deadline: Locator;

  constructor(page: Page, kind: FinancingFormKind) {
    super(
      page,
      kind === 'source' ? 'New funding source' : 'New grant',
      kind === 'source' ? 'source-form' : 'grant-form',
    );
    this.kind = kind;
    this.name = this.dialog.locator('#name');
    this.sourceType = this.dialog.locator('#sourceType');
    this.amount = this.dialog.locator('#totalAmount');
    this.interestRate = this.dialog.locator('#interestRate');
    this.sourceStatus = this.dialog.locator('#status');
    this.rate = this.dialog.locator('#reductionValue');
    this.cap = this.dialog.locator('#maximumAmount');
    this.items = new EntityPickerControl(page, 'items', this.dialog);
    this.itemChips = this.dialog.getByTestId('grant-form-items-chips');
    this.itemsStatus = this.dialog.getByTestId('grant-form-items-status');
    this.categories = new EntityPickerControl(page, 'categories', this.dialog);
    this.grantStatus = this.dialog.locator('#applicationStatus');
    this.deadline = this.dialog.locator('#applicationDeadline');
  }

  itemChip(entityId: string): Locator {
    return this.dialog.locator(
      `[data-testid^="grant-form-items-chip-"][data-testid$="${entityId}"]`,
    );
  }

  /** Fill a funding source form (name and amount are required). */
  async fillSource(data: {
    name: string;
    amount: number | string;
    type?: string;
    interestRate?: number | string;
  }): Promise<void> {
    await this.name.fill(data.name);
    if (data.type !== undefined) await this.sourceType.selectOption(data.type);
    await this.amount.fill(String(data.amount));
    if (data.interestRate !== undefined) await this.interestRate.fill(String(data.interestRate));
  }

  /** Fill the essential fields of a grant (items are picked separately). */
  async fillGrant(data: {
    name: string;
    rate: number | string;
    cap?: number | string;
  }): Promise<void> {
    await this.name.fill(data.name);
    await this.rate.fill(String(data.rate));
    if (data.cap !== undefined) await this.cap.fill(String(data.cap));
  }

  /** Pick tasks / purchases into the items multi-picker (keys only). */
  async pickItems(titles: readonly string[]): Promise<void> {
    for (const title of titles) await this.items.pick(title);
    await expect(this.itemsStatus).toContainText(`${titles.length} selected`);
  }
}
