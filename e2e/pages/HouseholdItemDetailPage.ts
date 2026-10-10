/**
 * Page Object Model for the Household Item Detail page (/project/household-items/:id)
 *
 * EPIC-04 Story 4.5: Detail Page
 *
 * The page renders:
 * - Breadcrumbs (Story #2202): trail "Purchases" + optional "Back to {origin}" (see `breadcrumbs`)
 * - h1 with the item name (inline-editable via autosave)
 * - An "Edit" button (navigates to /project/household-items/:id/edit)
 * - A status chip (StatusMenu, testid purchase-status) showing and changing the current status
 * - Fields: category, area (EPIC-18, replaces room), vendor, URL, quantity, description, dates
 * - Budget section: budget lines, subsidies, planned/actual totals
 * - Work Item Dependencies section: link HI to work items or milestones for scheduling
 * - Documents section: LinkedDocumentsSection (Paperless-ngx integration)
 * - Delete button with confirmation modal
 *
 * Key DOM observations from source code:
 * - h1 is the item name (autosave inline editable via contentEditable)
 * - Edit button navigates to /project/household-items/:id/edit
 * - Delete confirmation is the ConfirmDialog (role="alertdialog", testid prefix purchase-delete)
 * - Budget section h2: "Budget" (rendered conditionally based on budget lines)
 * - Documents section uses LinkedDocumentsSection (same as work items, invoices)
 *
 * fix/1278: areaBreadcrumb and its Tooltip/tabIndex have been removed from the detail header.
 * areaBreadcrumbNav is retained in the POM for negative assertions only (must NOT be visible).
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';

export class HouseholdItemDetailPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly breadcrumbs: BreadcrumbsBar;
  readonly editButton: Locator;

  // Area breadcrumb nav locator (kept for negative assertions after fix/1278)
  // fix/1278: the breadcrumb has been REMOVED from the HouseholdItemDetailPage header.
  // areaBreadcrumbNav is retained so Scenario 2 and 5 tests can assert not.toBeVisible().
  readonly areaBreadcrumbNav: Locator;

  // Content sections
  readonly budgetSection: Locator;
  readonly documentsSection: Locator;
  readonly documentsHeading: Locator;

  // Delete (#2209: the dialog is the shared ConfirmDialog — role="alertdialog", rendered in a portal)
  readonly deleteButton: Locator;
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  // #2209: the header status chip (StatusMenu) and the dependency-removal ConfirmDialog
  readonly statusMenu: StatusMenuControl;
  readonly dependencyRemoveDialog: ConfirmDialogControl;

  constructor(page: Page) {
    this.page = page;

    // h1 heading — the item name (editable)
    this.heading = page.getByRole('heading', { level: 1 });

    // Story #2202: the swapping back/"To Schedule" buttons are gone; the shared
    // Breadcrumbs row (trail + origin-aware Back) replaces them.
    this.breadcrumbs = new BreadcrumbsBar(page);

    // Edit button — located in the pageActions area; class="editButton"
    // Multiple "Edit" buttons may exist (budget line edit). Use first() to get the page-level one.
    this.editButton = page.locator('[class*="editButton"]').first();

    // fix/1278: breadcrumb removed from HouseholdItemDetailPage header.
    // areaBreadcrumbNav retained for negative assertions (must NOT be visible).
    this.areaBreadcrumbNav = page.getByRole('navigation', { name: /area path/i });

    // Budget section — scoped by h2 heading text (mirrors WorkItemDetailPage.ts pattern)
    this.budgetSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });

    // Documents section
    this.documentsHeading = page.getByRole('heading', { level: 2, name: 'Documents', exact: true });
    this.documentsSection = page.getByRole('region', { name: 'Documents', exact: true });

    // Delete confirmation modal
    // #2209: the shared ConfirmDialog (role="alertdialog", title "Delete <name>?", action "Delete")
    this.deleteButton = page.getByRole('button', { name: 'Delete Item', exact: true });
    this.deleteModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('purchase-delete-cancel') });
    this.deleteConfirmButton = this.deleteModal.getByTestId('purchase-delete-confirm');
    this.deleteCancelButton = this.deleteModal.getByTestId('purchase-delete-cancel');
    this.statusMenu = new StatusMenuControl(page, 'purchase-status');
    this.dependencyRemoveDialog = new ConfirmDialogControl(page, 'purchase-dependency-remove');
  }

  /**
   * Navigate to the household item detail page.
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(routeUrl('householdItem', { id }));
    await this.heading.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Get the heading text (item name).
   */
  async getHeadingText(): Promise<string> {
    return (await this.heading.textContent()) ?? '';
  }
}
