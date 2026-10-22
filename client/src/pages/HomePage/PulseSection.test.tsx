/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as HomeApiTypes from '../../lib/homeApi.js';
import type * as PulseModule from './PulseSection.js';
import { renderHome as renderWithRouter } from '../../test/homeRender.js';
import { makePulse } from '../../test/attentionFixtures.js';

const mockGetHomePulse = jest.fn<typeof HomeApiTypes.getHomePulse>();
jest.unstable_mockModule('../../lib/homeApi.js', () => ({
  getHomeWeek: jest.fn(),
  getHomePulse: mockGetHomePulse,
  getHomeSetup: jest.fn(),
}));

let PulseSection: typeof PulseModule.PulseSection;

function tile(id: string): HTMLElement {
  return screen.getByTestId(id);
}

function hrefOf(id: string): string | null | undefined {
  const el = tile(id);
  return (el.tagName === 'A' ? el : el.querySelector('a'))?.getAttribute('href');
}

beforeEach(async () => {
  if (!PulseSection) ({ PulseSection } = await import('./PulseSection.js'));
  mockGetHomePulse.mockReset();
});

describe('PulseSection', () => {
  it('shows a skeleton per tile while loading', () => {
    mockGetHomePulse.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PulseSection />);
    expect(screen.getByTestId('home-pulse-loading')).toBeInTheDocument();
    expect(screen.getByTestId('home-pulse')).toHaveAttribute('aria-busy', 'true');
  });

  it('D-03: the Left to spend figure is leftToSpend.expected, never an average of the range', async () => {
    // The average of best (900) and worst (100) would be 500.
    mockGetHomePulse.mockResolvedValue(
      makePulse({ leftToSpend: { expected: 200, best: 900, worst: 100, verdict: 'on_budget' } }),
    );
    renderWithRouter(<PulseSection />);

    const left = await waitFor(() => tile('home-pulse-left-to-spend'));
    expect(left).toHaveTextContent('200.00');
    expect(left).not.toHaveTextContent('500');
  });

  it('D-03: the verdict is shown only from the server, even when expected looks positive', async () => {
    mockGetHomePulse.mockResolvedValue(
      makePulse({ leftToSpend: { expected: 50, best: 60, worst: 40, verdict: 'over_budget' } }),
    );
    renderWithRouter(<PulseSection />);

    const left = await waitFor(() => tile('home-pulse-left-to-spend'));
    expect(left).toHaveTextContent('Over budget');
    expect(left).not.toHaveTextContent('On budget');
  });

  it('D-03: shows On budget with the server verdict', async () => {
    mockGetHomePulse.mockResolvedValue(makePulse());
    renderWithRouter(<PulseSection />);

    const left = await waitFor(() => tile('home-pulse-left-to-spend'));
    expect(left).toHaveTextContent('On budget');
  });

  it('D-03: Over budget with a minus sign when expected is below zero', async () => {
    mockGetHomePulse.mockResolvedValue(
      makePulse({
        leftToSpend: { expected: -2500, best: -1000, worst: -4000, verdict: 'over_budget' },
      }),
    );
    renderWithRouter(<PulseSection />);

    const left = await waitFor(() => tile('home-pulse-left-to-spend'));
    expect(left).toHaveTextContent('Over budget');
    expect(left.textContent).toMatch(/[-−]\s?€?\s?2,500\.00|[-−]2,500\.00/);
  });

  it('D-03: shows the signed range from worst to best', async () => {
    mockGetHomePulse.mockResolvedValue(
      makePulse({ leftToSpend: { expected: 100, best: 300, worst: -200, verdict: 'on_budget' } }),
    );
    renderWithRouter(<PulseSection />);

    const left = await waitFor(() => tile('home-pulse-left-to-spend'));
    expect(left.textContent).toMatch(/Range [-−]\D*200\.00 to \+\D*300\.00/);
  });

  it('D-03: no verdict without a funding source and a cost: en dash, hint and the Financing link', async () => {
    mockGetHomePulse.mockResolvedValue(
      makePulse({ leftToSpend: { expected: 0, best: 0, worst: 0, verdict: null } }),
    );
    renderWithRouter(<PulseSection />);

    const left = await waitFor(() => tile('home-pulse-left-to-spend'));
    expect(left).toHaveTextContent('–');
    expect(screen.getByRole('img', { name: 'No figure yet' })).toBeInTheDocument();
    expect(left).toHaveTextContent('Add a funding source and a cost to see this.');
    expect(left).not.toHaveTextContent('On budget');
    expect(left).not.toHaveTextContent('Over budget');
    expect(hrefOf('home-pulse-left-to-spend')).toBe('/budget/sources');
  });

  it('links the three tiles to Money overview, open invoices and the Tasks list', async () => {
    mockGetHomePulse.mockResolvedValue(makePulse());
    renderWithRouter(<PulseSection />);

    await waitFor(() => tile('home-pulse-progress'));
    expect(hrefOf('home-pulse-left-to-spend')).toBe('/budget/overview');
    expect(hrefOf('home-pulse-still-to-pay')).toBe('/budget/invoices?openOnly=true');
    expect(hrefOf('home-pulse-progress')).toBe('/project/work-items');
  });

  it('shows still to pay with the singular open-invoice wording and the progress figure', async () => {
    mockGetHomePulse.mockResolvedValue(
      makePulse({
        stillToPay: 4200,
        stillToPayCount: 1,
        progress: { total: 8, done: 2, inProgress: 3 },
      }),
    );
    renderWithRouter(<PulseSection />);

    const still = await waitFor(() => tile('home-pulse-still-to-pay'));
    expect(still).toHaveTextContent('4,200.00');
    expect(still).toHaveTextContent('1 open invoice');
    expect(still).not.toHaveTextContent('1 open invoices');
    const progress = tile('home-pulse-progress');
    expect(progress).toHaveTextContent('2 of 8 tasks done');
    expect(progress).toHaveTextContent('3 in progress');
  });

  it('uses the plural for zero open invoices', async () => {
    mockGetHomePulse.mockResolvedValue(makePulse({ stillToPayCount: 0 }));
    renderWithRouter(<PulseSection />);
    expect(await screen.findByText('0 open invoices')).toBeInTheDocument();
  });

  it('draws the progress bar width from done over total, and 0 without tasks', async () => {
    mockGetHomePulse.mockResolvedValue(
      makePulse({ progress: { total: 4, done: 1, inProgress: 0 } }),
    );
    const { unmount } = renderWithRouter(<PulseSection />);
    await waitFor(() => tile('home-pulse-progress'));
    let fill = tile('home-pulse-progress').querySelector('[style]') as HTMLElement;
    expect(fill.style.width).toBe('25%');
    unmount();

    mockGetHomePulse.mockResolvedValue(
      makePulse({ progress: { total: 0, done: 0, inProgress: 0 } }),
    );
    renderWithRouter(<PulseSection />);
    await waitFor(() => tile('home-pulse-progress'));
    fill = tile('home-pulse-progress').querySelector('[style]') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('shows an error with a retry that loads again', async () => {
    mockGetHomePulse.mockRejectedValueOnce(new Error('boom'));
    renderWithRouter(<PulseSection />);

    expect(await screen.findByText("Couldn't load Pulse.")).toBeInTheDocument();
    mockGetHomePulse.mockResolvedValue(makePulse());
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('home-pulse-still-to-pay')).toBeInTheDocument();
    expect(mockGetHomePulse).toHaveBeenCalledTimes(2);
  });
});
