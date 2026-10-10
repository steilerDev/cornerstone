/**
 * @jest-environment jsdom
 */
// The compact (phone and tablet) variant of the top bar (#2207). The scrolled-heading hook and
// the house name are mocked so the bar's own wiring can be asserted.
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type * as TopBarTypes from './TopBar.js';

let mockHouseName: string | null;
let mockTitle: string | null;
const mockScrolled = jest.fn<(header: HTMLElement | null, resetKey: string) => string | null>();

jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useHouseName: () => ({ houseName: mockHouseName, setHouseName: () => {} }),
}));

jest.unstable_mockModule('../../hooks/useScrolledPastHeading.js', () => ({
  useScrolledPastHeading: (header: HTMLElement | null, resetKey: string) => {
    mockScrolled(header, resetKey);
    return mockTitle;
  },
}));

describe('TopBar variant="compact"', () => {
  let TopBarModule: typeof TopBarTypes;

  beforeEach(async () => {
    if (!TopBarModule) TopBarModule = await import('./TopBar.js');
    mockHouseName = null;
    mockTitle = null;
    mockScrolled.mockClear();
  });

  function renderCompact(slotRef: (el: HTMLDivElement | null) => void = () => {}) {
    const log = createRouterLog();
    return render(
      <RecordingRouter entries={['/project/work-items']} log={log}>
        <TopBarModule.TopBar breadcrumbSlotRef={slotRef} variant="compact" />
      </RecordingRouter>,
    );
  }

  it('is the single banner, carrying the compact modifier', () => {
    renderCompact();
    const banner = screen.getByRole('banner');
    expect(banner).toBe(screen.getByTestId('top-bar'));
    expect(banner).toHaveClass('topBar', 'compact');
    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });

  it('hands the breadcrumb slot to the callback ref and puts it directly before the house name', () => {
    const slotRef = jest.fn<(el: HTMLDivElement | null) => void>();
    renderCompact(slotRef);
    const slot = screen.getByTestId('top-bar-slot');
    expect(slotRef.mock.calls.some(([el]) => el === slot)).toBe(true);
    expect(slot).toBeEmptyDOMElement();
    expect(slot.nextElementSibling).toBe(screen.getByTestId('top-bar-house-name'));
  });

  it('shows the house name, falling back to the app name', () => {
    mockHouseName = 'Synthetic Villa';
    const { unmount } = renderCompact();
    expect(screen.getByTestId('top-bar-house-name')).toHaveTextContent('Synthetic Villa');
    unmount();

    mockHouseName = null;
    renderCompact();
    expect(screen.getByTestId('top-bar-house-name')).toHaveTextContent('Cornerstone');
  });

  it('keeps the title empty and hidden until the heading has scrolled away', () => {
    renderCompact();
    const title = screen.getByTestId('top-bar-title');
    expect(title).toBeEmptyDOMElement();
    expect(title).toHaveAttribute('data-visible', 'false');
    expect(title).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the scrolled-past heading as the visible, aria-hidden title', () => {
    mockTitle = 'Tasks';
    renderCompact();
    const title = screen.getByTestId('top-bar-title');
    expect(title).toHaveTextContent('Tasks');
    expect(title).toHaveAttribute('data-visible', 'true');
    expect(title).toHaveAttribute('aria-hidden', 'true');
  });

  it('feeds the hook the header element and the location key', () => {
    renderCompact();
    const [header, key] = mockScrolled.mock.calls.at(-1)!;
    expect(header).toBe(screen.getByTestId('top-bar'));
    expect(key).toEqual(expect.any(String));
  });

  it('offers a disabled Search icon button named Search', () => {
    renderCompact();
    const search = screen.getByRole('button', { name: 'Search' });
    expect(search).toBe(screen.getByTestId('top-bar-search'));
    expect(search).toHaveAttribute('aria-disabled', 'true');
    expect(search).toHaveAttribute('type', 'button');
    expect(search.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has none of the desktop controls (New, attention, user menu, shortcut hint)', () => {
    renderCompact();
    for (const id of ['top-bar-new', 'top-bar-attention', 'user-menu-trigger']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByText('Ctrl K')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
