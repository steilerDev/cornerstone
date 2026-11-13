/**
 * @jest-environment jsdom
 *
 * The Delivery card of the purchase page's Timing tab (#2249, D3/D11): the dates in read mode,
 * the late reason (a static row, never a live region), edit validation and saving only the
 * changed dates.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { HouseholdItemPageDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makePurchasePage } from '../../test/purchasePageFixtures.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as CardModule from './PurchaseDeliveryCard.js';

const mockUpdate = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();
const realLocalDate = await import('../../lib/localDate.js');

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  updateHouseholdItem: mockUpdate,
}));
jest.unstable_mockModule('../../lib/localDate.js', () => ({
  ...realLocalDate,
  todayLocalIsoDate: () => '2026-04-10',
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Card: typeof CardModule;
const refresh = jest.fn<() => Promise<void>>();

function renderCard(purchase: HouseholdItemPageDetail = makePurchasePage()) {
  return render(
    <MemoryRouter>
      <Card.PurchaseDeliveryCard purchase={purchase} refresh={refresh} />
    </MemoryRouter>,
  );
}

async function edit() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('section-purchase-delivery-edit'));
  return user;
}
const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByTestId('section-purchase-delivery-save'));
const type = async (user: ReturnType<typeof userEvent.setup>, testId: string, value: string) => {
  const input = screen.getByTestId(testId);
  await user.clear(input);
  if (value) await user.type(input, value);
};

const DATED = {
  orderDate: '2026-02-01',
  earliestDeliveryDate: '2026-03-01',
  latestDeliveryDate: '2026-03-20',
  targetDeliveryDate: '2026-03-10',
  actualDeliveryDate: '2026-03-12',
} as const;

describe('PurchaseDeliveryCard', () => {
  beforeEach(async () => {
    mockUpdate.mockReset();
    refresh.mockReset();
    mockUpdate.mockResolvedValue({} as never);
    refresh.mockResolvedValue(undefined);
    if (!Card) Card = await import('./PurchaseDeliveryCard.js');
  });

  it('exports the card as the default too', () => {
    expect(Card.default).toBe(Card.PurchaseDeliveryCard);
  });

  describe('read mode', () => {
    it('shows the five dates in order with their labels', () => {
      renderCard(makePurchasePage({ ...DATED, status: 'arrived' }));
      expect(screen.getByRole('heading', { name: 'Delivery' })).toBeInTheDocument();
      const rows = [
        ['ordered', 'Ordered on', /Feb 1, 2026/],
        ['earliest', 'Earliest delivery', /Mar 1, 2026/],
        ['latest', 'Latest delivery', /Mar 20, 2026/],
        ['target', 'Target delivery', /Mar 10, 2026/],
        ['delivered', 'Delivered on', /Mar 12, 2026/],
      ] as const;
      for (const [id, label, date] of rows) {
        expect(screen.getByText(label)).toBeInTheDocument();
        expect(screen.getByTestId(`purchase-delivery-${id}`)).toHaveTextContent(date);
      }
    });

    it('shows "Not set" for every missing date', () => {
      renderCard();
      for (const id of ['ordered', 'earliest', 'latest', 'target', 'delivered']) {
        expect(screen.getByTestId(`purchase-delivery-${id}`)).toHaveTextContent('Not set');
      }
    });

    it('shows no late row for a purchase that is not late', () => {
      renderCard(makePurchasePage(DATED));
      expect(screen.queryByTestId('purchase-late-reason')).toBeNull();
    });
  });

  describe('late reason', () => {
    it('names the passed latest delivery date, with the Late badge and its days', () => {
      renderCard(
        makePurchasePage({
          status: 'purchased',
          isLate: true,
          earliestDeliveryDate: '2026-03-01',
          latestDeliveryDate: '2026-03-20',
        }),
      );
      const reason = screen.getByTestId('purchase-late-reason');
      expect(reason).toHaveTextContent(
        'The latest delivery date (Mar 20, 2026) has passed and nothing has arrived.',
      );
      expect(reason).toHaveTextContent(/Late/);
      expect(reason).toHaveTextContent('21');
    });

    it('names the passed target date when there is no latest date', () => {
      renderCard(
        makePurchasePage({
          status: 'purchased',
          isLate: true,
          earliestDeliveryDate: '2026-03-01',
          targetDeliveryDate: '2026-03-05',
        }),
      );
      expect(screen.getByTestId('purchase-late-reason')).toHaveTextContent(
        'The target delivery date (Mar 5, 2026) has passed and nothing has arrived.',
      );
    });

    it('is generic when no date has passed (a predecessor pushed the delivery)', () => {
      renderCard(
        makePurchasePage({
          status: 'purchased',
          isLate: true,
          earliestDeliveryDate: '2026-03-01',
          latestDeliveryDate: '2026-06-01',
        }),
      );
      expect(screen.getByTestId('purchase-late-reason')).toHaveTextContent(
        'Late: the delivery is now expected after its planned window.',
      );
    });

    it('is a static paragraph, never a live region or alert', () => {
      renderCard(
        makePurchasePage({ status: 'purchased', isLate: true, latestDeliveryDate: '2026-03-20' }),
      );
      const reason = screen.getByTestId('purchase-late-reason');
      expect(reason.tagName).toBe('P');
      expect(reason).not.toHaveAttribute('role');
      expect(reason).not.toHaveAttribute('aria-live');
      expect(within(reason).queryByRole('status')).toBeNull();
    });

    it('is gone once the purchase is delivered', () => {
      renderCard(
        makePurchasePage({
          status: 'arrived',
          isLate: true,
          latestDeliveryDate: '2026-03-20',
          actualDeliveryDate: '2026-03-25',
        }),
      );
      expect(screen.queryByTestId('purchase-late-reason')).toBeNull();
    });
  });

  describe('edit mode', () => {
    it('opens with the four dates filled and focuses Ordered on', async () => {
      renderCard(makePurchasePage(DATED));
      await edit();
      expect(screen.getByTestId('purchase-ordered-input')).toHaveValue('2026-02-01');
      expect(screen.getByTestId('purchase-earliest-input')).toHaveValue('2026-03-01');
      expect(screen.getByTestId('purchase-latest-input')).toHaveValue('2026-03-20');
      expect(screen.getByTestId('purchase-delivered-input')).toHaveValue('2026-03-12');
      expect(screen.getByTestId('purchase-ordered-input')).toHaveFocus();
    });

    it('does not offer the computed target date for editing', async () => {
      renderCard(makePurchasePage(DATED));
      await edit();
      expect(screen.queryByLabelText('Target delivery')).toBeNull();
    });

    it('sends only the changed date and refreshes the page', async () => {
      renderCard(makePurchasePage(DATED));
      const user = await edit();
      await type(user, 'purchase-latest-input', '2026-03-25');
      await save(user);
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith('hi-1', { latestDeliveryDate: '2026-03-25' }),
      );
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('sends each of the four dates under its own field', async () => {
      renderCard();
      const user = await edit();
      await type(user, 'purchase-ordered-input', '2026-02-01');
      await type(user, 'purchase-earliest-input', '2026-03-01');
      await type(user, 'purchase-latest-input', '2026-03-20');
      await type(user, 'purchase-delivered-input', '2026-03-12');
      await save(user);
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith('hi-1', {
          orderDate: '2026-02-01',
          earliestDeliveryDate: '2026-03-01',
          latestDeliveryDate: '2026-03-20',
          actualDeliveryDate: '2026-03-12',
        }),
      );
    });

    it('sends an emptied date as null', async () => {
      renderCard(makePurchasePage(DATED));
      const user = await edit();
      await type(user, 'purchase-ordered-input', '');
      await type(user, 'purchase-earliest-input', '');
      await type(user, 'purchase-latest-input', '');
      await type(user, 'purchase-delivered-input', '');
      await save(user);
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith('hi-1', {
          orderDate: null,
          earliestDeliveryDate: null,
          latestDeliveryDate: null,
          actualDeliveryDate: null,
        }),
      );
    });

    it('refuses a latest delivery before the earliest, with a field error', async () => {
      renderCard(makePurchasePage(DATED));
      const user = await edit();
      await type(user, 'purchase-latest-input', '2026-02-20');
      await save(user);
      expect(
        await screen.findByText("Latest delivery can't be before earliest delivery."),
      ).toBeInTheDocument();
      expect(screen.getByTestId('purchase-latest-input')).toHaveAttribute('aria-invalid', 'true');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('refuses a delivered date before the order date, with a field error', async () => {
      renderCard(makePurchasePage(DATED));
      const user = await edit();
      await type(user, 'purchase-delivered-input', '2026-01-15');
      await save(user);
      expect(
        await screen.findByText("The delivery date can't be before the order date."),
      ).toBeInTheDocument();
      expect(screen.getByTestId('purchase-delivered-input')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('accepts a window with only one bound and a delivery without an order date', async () => {
      renderCard();
      const user = await edit();
      await type(user, 'purchase-latest-input', '2026-03-20');
      await type(user, 'purchase-delivered-input', '2026-03-12');
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    });

    it('shows the translated server error and keeps the editor open', async () => {
      mockUpdate.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderCard();
      const user = await edit();
      await type(user, 'purchase-ordered-input', '2026-02-01');
      await save(user);
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('purchase-ordered-input')).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('shows the fallback sentence for a network failure', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('down'));
      renderCard();
      const user = await edit();
      await type(user, 'purchase-ordered-input', '2026-02-01');
      await save(user);
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the dates.");
    });

    it('returns focus to the Edit button after Save', async () => {
      renderCard();
      const user = await edit();
      await type(user, 'purchase-ordered-input', '2026-02-01');
      await save(user);
      await waitFor(() => expect(screen.queryByTestId('purchase-ordered-input')).toBeNull());
      expect(screen.getByTestId('section-purchase-delivery-edit')).toHaveFocus();
    });
  });
});
