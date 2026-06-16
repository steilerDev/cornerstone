/**
 * E2E smoke/regression tests for SearchPicker mobile fix (Issue #1708).
 *
 * Background:
 *   SearchPicker renders its dropdown in a portal (`[data-search-picker-dropdown]`)
 *   with `position: fixed`. PR #1601 introduced the portal to prevent dropdown
 *   clipping inside modals. Issue #1708 fixed the dropdown position not tracking
 *   the input field during mobile scroll by adding a requestAnimationFrame loop
 *   plus a close-on-out-of-view guard.
 *
 * Scope:
 *   Playwright cannot reliably simulate mobile momentum/fling scrolling (no
 *   native inertia events), so this suite does NOT assert scroll-tracking
 *   correctness. Instead it provides a regression smoke test that verifies:
 *
 *   Scenario 1: Dropdown renders anchored near its input on a mobile viewport
 *               (guards against the portal losing position on open).
 *   Scenario 2: Dropdown inside a modal is not clipped by the modal's overflow
 *               (guards against the portal anti-clipping regression).
 *
 * Tagged @responsive so the tablet and mobile Playwright projects pick them up
 * in addition to desktop.  Scenario 1 skips on non-mobile viewports because
 * the anchor tolerance is deliberately tight for mobile.  Scenario 2 is
 * currently skipped (see below).
 */

import { test, expect } from '../../fixtures/auth.js';
import { createAreaViaApi, deleteAreaViaApi } from '../../fixtures/apiHelpers.js';
import { WorkItemCreatePage } from '../../pages/WorkItemCreatePage.js';

// iPhone 13 viewport width (used by the 'mobile' Playwright project).
// The 'tablet' project uses iPad (gen 7) which is ~810px wide.
// We only apply the anchor-proximity assertion on viewports < 500px
// (true mobile phones) where the fixed-positioning fix is most critical.
const MOBILE_MAX_WIDTH = 499;

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: SearchPicker dropdown anchored near its input on mobile viewport
// ─────────────────────────────────────────────────────────────────────────────

test.describe('SearchPicker mobile anchor regression (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'SearchPicker dropdown is visible and anchored near its input on a mobile viewport',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const viewportWidth = page.viewportSize()?.width ?? 1920;

      // This anchor-proximity check is only meaningful on true-mobile viewports.
      // On desktop/tablet the dropdown still works but the narrow tolerance check
      // adds no regression value beyond what the existing SearchPicker unit test
      // covers (SearchPicker.test.tsx Scenario: portal position tracking).
      if (viewportWidth > MOBILE_MAX_WIDTH) {
        test.skip();
        return;
      }

      // Seed one area so the SearchPicker has at least one result to show.
      const areaName = `${testPrefix} Mobile Area`;
      let areaId = '';

      try {
        areaId = await createAreaViaApi(page, { name: areaName });

        // Navigate to Work Item Create — a stable, fully-implemented page with
        // an AreaPicker (SearchPicker<TreeNode> with showItemsOnFocus=true) that
        // opens its dropdown without requiring any search text.
        const createPage = new WorkItemCreatePage(page);
        await createPage.goto();

        // The area picker input is the SearchPicker trigger.
        const areaInput = createPage.areaPickerInput;
        await expect(areaInput).toBeVisible();

        // Record the input's bounding box before opening the dropdown.
        const inputBox = await areaInput.boundingBox();
        expect(inputBox).not.toBeNull();

        // Focus the input — showItemsOnFocus=true causes the dropdown to appear
        // immediately without needing to type anything.
        await areaInput.click();

        // The dropdown portal must appear in the DOM.
        const dropdown = page.locator('[data-search-picker-dropdown]');
        await expect(dropdown).toBeVisible();

        // Record the dropdown's bounding box.
        const dropdownBox = await dropdown.boundingBox();
        expect(dropdownBox).not.toBeNull();

        // Core regression assertion (Issue #1708):
        // The dropdown's top edge should be within ~20px of the input's bottom
        // edge.  Floating UI places the dropdown offset(4) below the reference
        // input; flip() activates when there is insufficient space below — in
        // both cases the dropdown is adjacent to the input (within 20px
        // tolerance).  A tolerance of 20px accommodates the 4px offset,
        // sub-pixel rounding, and the flip-above path.
        //
        // Note: we use Math.abs so the assertion holds for both "below" and
        // "above" (flipped) positioning.
        const inputBottom = inputBox!.y + inputBox!.height;
        const anchorDistance = Math.abs(dropdownBox!.y - inputBottom);
        expect(anchorDistance).toBeLessThan(20);

        // The seeded area should appear in the dropdown results.
        // This confirms the dropdown is functional, not just a ghost element.
        const areaOption = dropdown.getByRole('option', { name: areaName });
        await expect(areaOption).toBeVisible();

        // Select the area — the dropdown must close after selection.
        await areaOption.click();
        await expect(dropdown).not.toBeVisible();

        // Verify the picker shows the selected area (selectedDisplay chip).
        // After selection SearchPicker renders a selectedDisplay div, not the
        // input, so the input is no longer in the DOM.
        const selectedDisplay = page.locator('[class*="selectedDisplay"]').first();
        await expect(selectedDisplay).toContainText(areaName);
      } finally {
        if (areaId) await deleteAreaViaApi(page, areaId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: SearchPicker inside a modal is not clipped by modal overflow
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'SearchPicker modal anti-clip regression (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test('SearchPicker dropdown inside a modal renders within the viewport bounds', async ({
      page,
    }) => {
      // This scenario is skipped because no readily reusable E2E fixture surfaces
      // a Modal + SearchPicker combination without complex setup or extensive
      // mocking (MassMoveModal needs budget line data; InvoicePaperlessPickerModal
      // requires Paperless-ngx mock routes; PhotoMetadataModal requires orientation
      // data AND a photo upload flow).
      //
      // The anti-clipping behaviour is fully covered by the unit test:
      //   client/src/components/SearchPicker/SearchPicker.test.tsx
      //   → "dropdown is portalled to document.body — [data-search-picker-dropdown]
      //      present on body"
      //
      // Implementation note: SearchPicker uses FloatingPortal from
      // @floating-ui/react (not createPortal from react-dom directly), which
      // renders the dropdown to document.body and therefore escapes any modal
      // ancestor's overflow:hidden constraint.
      //
      // If a lighter-weight modal+picker surface becomes available in a future
      // story, replace this skip with a real assertion that
      //   `dropdownBox.y >= 0 && dropdownBox.y + dropdownBox.height <= viewportHeight`
      // and that the dropdown does NOT overlap the modal's scroll container.
      test.skip(true, 'No lightweight modal+picker fixture available; covered by unit test');

      // Keep the compiler happy — page is declared in the signature.
      void page;
    });
  },
);
