/**
 * @jest-environment jsdom
 *
 * The purchase page's Timing tab (#2249): the Delivery card first, then the Waits for list. Both
 * are covered per module; here they are stubs that expose what the panel hands them.
 */
import { jest, describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import enCommon from '../../i18n/en/common.json';
import enHouseholdItems from '../../i18n/en/householdItems.json';
import { makePurchasePage } from '../../test/purchasePageFixtures.js';

jest.unstable_mockModule('./PurchaseDeliveryCard.js', () => ({
  PurchaseDeliveryCard: (props: { purchase: { id: string }; refresh: () => void }) => (
    <button
      type="button"
      data-testid="stub-delivery"
      data-id={props.purchase.id}
      onClick={props.refresh}
    />
  ),
}));
jest.unstable_mockModule('./PurchaseWaitsForList.js', () => ({
  PurchaseWaitsForList: (props: {
    purchase: { id: string };
    refresh: () => void;
    originState: { origin: { to: string } };
  }) => (
    <button
      type="button"
      data-testid="stub-waits"
      data-id={props.purchase.id}
      data-origin={props.originState.origin.to}
      onClick={props.refresh}
    />
  ),
}));

const { PurchaseTimingPanel, default: DefaultPanel } = await import('./PurchaseTimingPanel.js');

const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/household-items/hi-1?tab=timing', name: 'Sample sofa' } };

function renderPanel() {
  return render(
    <PurchaseTimingPanel
      purchase={makePurchasePage()}
      revision={0}
      refresh={refresh}
      originState={ORIGIN}
      headingRef={{ current: null }}
    />,
  );
}

describe('PurchaseTimingPanel', () => {
  it('exports the panel as the default too', () => {
    expect(DefaultPanel).toBe(PurchaseTimingPanel);
  });

  it('shows the Delivery card, then Waits for, both for the purchase', () => {
    renderPanel();
    const panel = screen.getByTestId('purchase-timing-panel');
    const delivery = screen.getByTestId('stub-delivery');
    const waits = screen.getByTestId('stub-waits');
    expect(panel).toContainElement(delivery);
    expect(panel).toContainElement(waits);
    expect(delivery.compareDocumentPosition(waits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(delivery).toHaveAttribute('data-id', 'hi-1');
    expect(waits).toHaveAttribute('data-id', 'hi-1');
  });

  it('hands Waits for the origin state and both the page refresh', () => {
    renderPanel();
    expect(screen.getByTestId('stub-waits')).toHaveAttribute('data-origin', ORIGIN.origin.to);
    screen.getByTestId('stub-delivery').click();
    screen.getByTestId('stub-waits').click();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  describe('dependency error banner (#2254)', () => {
    const renderWith = (depError: string | null, onDepErrorDismiss?: () => void) =>
      render(
        <PurchaseTimingPanel
          purchase={makePurchasePage()}
          revision={0}
          refresh={refresh}
          originState={ORIGIN}
          headingRef={{ current: null }}
          depError={depError}
          onDepErrorDismiss={onDepErrorDismiss}
        />,
      );

    it('names the titles the New purchase form could not add, above the Delivery card', () => {
      renderWith('Alpha, Beta');
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent("Couldn't add these dependencies: Alpha, Beta");
      expect(enHouseholdItems.purchasePage.timing.depError).toBe(
        "Couldn't add these dependencies: {{titles}}",
      );
      const delivery = screen.getByTestId('stub-delivery');
      expect(
        alert.compareDocumentPosition(delivery) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('Close calls onDepErrorDismiss exactly once', () => {
      const dismiss = jest.fn<() => void>();
      renderWith('Alpha', dismiss);
      const button = screen.getByTestId('purchase-dep-error-dismiss');
      expect(button).toHaveTextContent(enCommon.button.close);
      fireEvent.click(button);
      expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('is absent without a depError', () => {
      renderWith(null);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByTestId('purchase-dep-error-dismiss')).toBeNull();
    });

    it('is absent by default and Close without a handler is harmless', () => {
      renderPanel();
      expect(screen.queryByRole('alert')).toBeNull();
      const { unmount } = renderWith('Alpha');
      expect(() => fireEvent.click(screen.getByTestId('purchase-dep-error-dismiss'))).not.toThrow();
      unmount();
    });
  });
});
