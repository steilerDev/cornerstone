/**
 * Component POM for the cost line form (#2235): an ObjectForm (`Modal` from 768px, full-screen
 * `Sheet` below) with test id `cost-line-form`, opened from "Add cost line" or a row's ⋯ menu.
 *
 * Titles: "New cost line", "Edit cost line", "Assign cost line". Essentials first: Description,
 * Belongs to (only on an offer/invoice, when assigning, and when editing), the existing-line
 * picker (offer/invoice, once a target is set), Quantity / Unit / Unit price (unit pricing, the
 * default) or Amount (direct), and Entered as (Net default | Gross) with the live result line.
 * Behind "More details": Pricing, Cost category, Basis, Funding source, Company.
 *
 * Basis is a select while the line is an Estimate; once linked it is the read-only text
 * `cost-line-basis-locked` ("Offer" | "Invoice") with the reason beneath it.
 */

import type { Locator, Page } from '@playwright/test';
import { ObjectFormDialog } from './ObjectFormDialog.js';
import { SearchPickerControl } from './SearchPickerControl.js';

export type CostLineFormTitle = 'New cost line' | 'Edit cost line' | 'Assign cost line';

export class CostLineFormDialog extends ObjectFormDialog {
  readonly description: Locator;
  readonly quantity: Locator;
  readonly unit: Locator;
  readonly unitPrice: Locator;
  /** Direct amount (Pricing = Direct amount) or the amount of an existing line. */
  readonly amount: Locator;
  readonly enteredNet: Locator;
  readonly enteredGross: Locator;
  /** The live "Gross €x (net … + VAT …)" line. */
  readonly result: Locator;
  readonly pricing: Locator;
  readonly category: Locator;
  readonly basis: Locator;
  readonly basisLocked: Locator;
  readonly fundingSource: Locator;
  /** Belongs to: the task/purchase search picker. */
  readonly target: SearchPickerControl;
  /** "Line" field on an offer/invoice: pick an existing unlinked line instead of a new one. */
  readonly existingLine: Locator;

  constructor(page: Page, title: CostLineFormTitle = 'New cost line') {
    super(page, title, 'cost-line-form');
    this.description = this.field('description');
    this.quantity = this.field('quantity');
    this.unit = this.field('unit');
    this.unitPrice = this.field('unitPrice');
    this.amount = this.dialog.getByTestId('cost-line-amount');
    this.enteredNet = this.dialog.getByTestId('cost-line-entered-net');
    this.enteredGross = this.dialog.getByTestId('cost-line-entered-gross');
    this.result = this.dialog.getByTestId('cost-line-result');
    this.pricing = this.field('pricing');
    this.category = this.field('budgetCategoryId');
    this.basis = this.dialog.getByTestId('cost-line-basis');
    this.basisLocked = this.dialog.getByTestId('cost-line-basis-locked');
    this.fundingSource = this.field('budgetSourceId');
    this.target = new SearchPickerControl(page, 'target', this.dialog);
    this.existingLine = this.dialog.getByTestId('cost-line-existing');
  }

  /**
   * Change "Belongs to" of an existing line: open More details (the field is not essential when
   * editing), clear the current task/purchase and pick the new one by keyboard.
   */
  async changeTarget(name: string): Promise<void> {
    await this.expandMoreDetails();
    const clear = this.dialog.getByRole('button', { name: 'Clear selection' });
    if ((await clear.count()) > 0) await clear.first().click();
    await this.target.pick(name);
  }

  /** Fill a unit-priced line (the default pricing) and leave the dialog open. */
  async fillUnitPriced(values: {
    description: string;
    quantity: string;
    unit?: string;
    unitPrice: string;
  }): Promise<void> {
    await this.description.fill(values.description);
    await this.quantity.fill(values.quantity);
    if (values.unit !== undefined) await this.unit.fill(values.unit);
    await this.unitPrice.fill(values.unitPrice);
  }

  /** Switch to a direct amount (under "More details") and type it. */
  async fillDirect(description: string, amount: string): Promise<void> {
    await this.description.fill(description);
    await this.expandMoreDetails();
    await this.pricing.selectOption('direct');
    await this.amount.fill(amount);
  }
}
