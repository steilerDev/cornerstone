/**
 * E2E tests for the Invoices page summary cards (Issue #568)
 *
 * UAT Scenarios covered:
 * - "Paid" card includes both paid AND claimed invoice counts and amounts
 * - "Claimed" card shows only claimed invoices (subset view, unchanged)
 * - "Pending" card shows only pending invoices (unchanged)
 * - Given $1000 paid + $500 claimed, Paid card shows $1500 (acceptance criterion 5)
 * - No double-counting: claimed amount not duplicated
 * - Null/undefined amounts are handled gracefully
 */

import { test, expect } from '../../fixtures/auth.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — mock invoice data factories
// ─────────────────────────────────────────────────────────────────────────────

function makeInvoice(
  id: string,
  status: 'pending' | 'paid' | 'claimed',
  amount: number
) {
  return {
    id,
    invoiceNumber: `INV-${id}`,
    description: `Test invoice ${id}`,
    status,
    amount,
    createdAt: '2024-01-15T10:00:00Z',
  };
}

/**
 * Scenario: 2 paid ($500 each = $1000), 1 claimed ($500), 1 pending ($200)
 * Expected:
 *   Paid card  → count 3, amount $1500  (paid + claimed combined)
 *   Claimed card → count 1, amount $500  (claimed only)
 *   Pending card → count 1, amount $200  (pending only)
 */
function standardInvoicesResponse() {
  return [
    makeInvoice('001', 'paid', 500),
    makeInvoice('002', 'paid', 500),
    makeInvoice('003', 'claimed', 500),
    makeInvoice('004', 'pending', 200),
  ];
}

/**
 * Scenario matching acceptance criterion 5 exactly:
 *   Paid invoices total $1000, Claimed invoices total $500.
 *   Paid card must show $1500.
 */
function acceptanceCriterion5Response() {
  return [
    makeInvoice('ac5-001', 'paid', 600),
    makeInvoice('ac5-002', 'paid', 400),
    makeInvoice('ac5-003', 'claimed', 300),
    makeInvoice('ac5-004', 'claimed', 200),
  ];
}

/**
 * Edge case: invoice with null/missing amount — should be treated as $0
 * and not cause a crash or NaN in the totals.
 */
function nullAmountInvoicesResponse() {
  return [
    makeInvoice('null-001', 'paid', 100),
    // Simulate a claimed invoice where amount is missing/null from API
    { ...makeInvoice('null-002', 'claimed', 0), amount: null },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices summary cards — Issue #568', { tag: '@invoices' }, () => {

  /**
   * Core regression test for Issue #568.
   *
   * Verifies that the "Paid" card aggregates both paid ($1000) and
   * claimed ($500) invoices, yielding count=3 and total=$1500.
   * Simultaneously confirms the Claimed and Pending cards are unchanged.
   */
  test(
    'Paid card includes paid + claimed invoices; Claimed and Pending cards are independent',
    { tag: '@smoke' },
    async ({ page }) => {
      // Arrange: intercept the invoices API and return controlled test data
      await page.route(`${API.BASE_URL}/invoices`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(standardInvoicesResponse()),
        });
      });

      // Act: navigate to the invoices page
      await page.goto('/invoices');
      await page.waitForSelector('[data-testid="invoice-summary-cards"]');

      // ── Paid card assertions ──────────────────────────────────────────────
      // FIX (Issue #568): count must be 3 (2 paid + 1 claimed)
      const paidCount = page.getByTestId('summary-card-paid-count');
      const paidAmount = page.getByTestId('summary-card-paid-amount');

      await expect(paidCount).toHaveText('3');
      // $500 + $500 (paid) + $500 (claimed) = $1,500.00
      await expect(paidAmount).toHaveText('$1,500.00');

      // ── Claimed card assertions (subset — unchanged) ──────────────────────
      // Claimed card must still show ONLY the claimed subset.
      const claimedCount = page.getByTestId('summary-card-claimed-count');
      const claimedAmount = page.getByTestId('summary-card-claimed-amount');

      await expect(claimedCount).toHaveText('1');
      await expect(claimedAmount).toHaveText('$500.00');

      // ── Pending card assertions (unchanged) ──────────────────────────────
      const pendingCount = page.getByTestId('summary-card-pending-count');
      const pendingAmount = page.getByTestId('summary-card-pending-amount');

      await expect(pendingCount).toHaveText('1');
      await expect(pendingAmount).toHaveText('$200.00');
    }
  );

  /**
   * Directly tests acceptance criterion 5 from the issue:
   * "Given invoices with status 'paid' totaling $1000 and invoices with
   *  status 'claimed' totaling $500, the 'Paid' total shows $1500."
   */
  test(
    'Acceptance criterion 5: paid $1000 + claimed $500 = Paid card shows $1500',
    async ({ page }) => {
      // Arrange
      await page.route(`${API.BASE_URL}/invoices`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(acceptanceCriterion5Response()),
        });
      });

      // Act
      await page.goto('/invoices');
      await page.waitForSelector('[data-testid="invoice-summary-cards"]');

      // Assert: Paid card = $1000 paid + $500 claimed = $1500
      const paidCount = page.getByTestId('summary-card-paid-count');
      const paidAmount = page.getByTestId('summary-card-paid-amount');

      // 2 paid invoices + 2 claimed invoices = 4 total in Paid card
      await expect(paidCount).toHaveText('4');
      await expect(paidAmount).toHaveText('$1,500.00');

      // Claimed card still shows only its 2 claimed invoices ($500 total)
      const claimedCount = page.getByTestId('summary-card-claimed-count');
      const claimedAmount = page.getByTestId('summary-card-claimed-amount');

      await expect(claimedCount).toHaveText('2');
      await expect(claimedAmount).toHaveText('$500.00');

      // Pending card shows 0 (no pending invoices in this scenario)
      const pendingCount = page.getByTestId('summary-card-pending-count');
      await expect(pendingCount).toHaveText('0');
    }
  );

  /**
   * Edge case: invoices with null/undefined amounts should default to $0
   * and not produce NaN or crash the page.
   */
  test(
    'Handles null invoice amounts gracefully without NaN or errors',
    async ({ page }) => {
      // Arrange: one paid ($100) + one claimed with null amount
      await page.route(`${API.BASE_URL}/invoices`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(nullAmountInvoicesResponse()),
        });
      });

      // Act
      await page.goto('/invoices');
      await page.waitForSelector('[data-testid="invoice-summary-cards"]');

      // Assert: paid card = $100 (paid) + $0 (claimed, null→0) = $100
      const paidCount = page.getByTestId('summary-card-paid-count');
      const paidAmount = page.getByTestId('summary-card-paid-amount');

      // 1 paid + 1 claimed (null amount) = 2 total in Paid card
      await expect(paidCount).toHaveText('2');
      // Must NOT show NaN; should show $100.00
      await expect(paidAmount).toHaveText('$100.00');
      await expect(paidAmount).not.toContainText('NaN');

      // Claimed card: 1 invoice, $0 (null treated as 0)
      const claimedCount = page.getByTestId('summary-card-claimed-count');
      const claimedAmount = page.getByTestId('summary-card-claimed-amount');

      await expect(claimedCount).toHaveText('1');
      await expect(claimedAmount).toHaveText('$0.00');
      await expect(claimedAmount).not.toContainText('NaN');
    }
  );

});
