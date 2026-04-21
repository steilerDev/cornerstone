/**
 * Page Object Model for the Household Item Detail page (/project/household-items/:id)
 *
 * EPIC-04 Story 4.5: Detail Page
 *
 * The page renders:
 * - A back link "← Household Items" navigating to /project/household-items
 * - h1 with the item name (inline-editable via autosave)
 * - An "Edit" button (navigates to /project/household-items/:id/edit)
 * - A status badge showing current status
 * - Fields: category, area (EPIC-18, replaces room), vendor, URL, quantity, description, dates
 * - Budget section: budget lines, subsidies, planned/actual totals
 * - Work Item Dependencies section: link HI to work items or milestones for scheduling
 * - Documents section: LinkedDocumentsSection (Paperless-ngx integration)
 * - Delete button with confirmation modal
 *
 * Key DOM observations from source code:
 * - h1 is the item name (autosave inline editable via contentEditable)
 * - Back link is a <Link> (not a button) with text "← Household Items"
 * - Edit button navigates to /project/household-items/:id/edit
 * - Delete confirmation modal uses role="dialog"
 * - Budget section h2: "Budget" (rendered conditionally based on budget lines)
 * - Documents section uses LinkedDocumentsSection (same as work items, invoices)
 *
 * fix/1278: areaBreadcrumb and its Tooltip/tabIndex have been removed from the detail header.
 * areaBreadcrumbNav is retained in the POM for negative assertions only (must NOT be visible).
 */

import type { Page, Locator } from '@playwright/test';

export class HouseholdItemDetailPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly backLink: Locator;
  readonly editButton: Locator;

  // Area breadcrumb nav locator (kept for negative assertions after fix/1278)
  // fix/1278: the breadcrumb has been REMOVED from the HouseholdItemDetailPage header.
  // areaBreadcrumbNav is retained so Scenario 2 and 5 tests can assert not.toBeVisible().
  readonly areaBreadcrumbNav: Locator;

  // Content sections
  readonly budgetSection: Locator;
  readonly documentsSection: Locator;
  readonly documentsHeading: Locator;

  // Delete
  readonly deleteModal: Locator;

  constructor(page: Page) {
    this.page = page;

    // h1 heading — the item name (editable)
    this.heading = page.getByRole('heading', { level: 1 });

    // Back button navigates to the household items list.
    // NOTE: The AppShell sidebar also has a "Household Items" nav link.
    // The back button is in a navButtons container above the heading.
    // Scope to the navButtons container to avoid matching sidebar links.
    this.backLink = page.locator('[class*="navButtons"]').getByRole('button', {
      name: /back to household items/i,
    });

    // Edit button — located in the pageActions area; class="editButton"
    // Multiple "Edit" buttons may exist (budget line edit). Use first() to get the page-level one.
    this.editButton = page.locator('[class*="editButton"]').first();

    // fix/1278: breadcrumb removed from HouseholdItemDetailPage header.
    // areaBreadcrumbNav retained for negative assertions (must NOT be visible).
    this.areaBreadcrumbNav = page.getByRole('navigation', { name: /area path/i });

    // Budget section
    this.budgetSection = page.locator('[class*="budgetSection"], [class*="budget"]').first();

    // Documents section
    this.documentsHeading = page.getByRole('heading', { level: 2, name: 'Documents', exact: true });
    this.documentsSection = page.getByRole('region', { name: 'Documents', exact: true });

    // Delete confirmation modal
    this.deleteModal = page.locator('[role="dialog"]');
  }

  /**
   * Navigate to the household item detail page.
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(`/project/household-items/${id}`);
    await this.heading.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Get the heading text (item name).
   */
  async getHeadingText(): Promise<string> {
    return (await this.heading.textContent()) ?? '';
  }
}
