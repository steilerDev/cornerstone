import { jest, describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { PhotoSpotPhoto } from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import type { SpotHistoryList as SpotHistoryListType } from './SpotHistoryList.js';
import { makeSpotPhoto, makeLocaleContextMock, localeState } from '../../test/photoSpotFixtures.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let SpotHistoryList: typeof SpotHistoryListType;

beforeAll(async () => {
  ({ SpotHistoryList } = await import('./SpotHistoryList.js'));
});

afterEach(() => {
  localeState.resolvedLocale = 'en';
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

function photo(id: string, title: string | null, type: PhotoSpotPhoto['diaryEntry']['entryType']) {
  return makeSpotPhoto(id, {
    diaryEntry: { id: `e-${id}`, entryType: type, title, entryDate: '2026-09-11' },
  });
}

const PHOTOS = [
  photo('p1', 'Plastering done', 'daily_log'),
  photo('p2', null, 'issue'),
  photo('p3', '   ', 'site_visit'),
];

describe('SpotHistoryList', () => {
  it('renders items in the order of the photos prop', () => {
    render(<SpotHistoryList photos={PHOTOS} currentIndex={0} onSelect={() => {}} />);
    const ids = screen.getAllByRole('button').map((b) => b.getAttribute('data-testid'));
    expect(ids).toEqual(['spot-history-item-p1', 'spot-history-item-p2', 'spot-history-item-p3']);
  });

  it('marks only the current item with aria-current', () => {
    render(<SpotHistoryList photos={PHOTOS} currentIndex={1} onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).not.toHaveAttribute('aria-current');
    expect(buttons[1]).toHaveAttribute('aria-current', 'true');
    expect(buttons[2]).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the clicked index', () => {
    const onSelect = jest.fn();
    render(<SpotHistoryList photos={PHOTOS} currentIndex={0} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('spot-history-item-p3'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('shows "Daily log – Title" on line two when the entry has a title', () => {
    render(<SpotHistoryList photos={PHOTOS} currentIndex={0} onSelect={() => {}} />);
    expect(screen.getByText('Daily log – Plastering done')).toBeInTheDocument();
    expect(screen.getAllByText('Sep 11, 2026')).toHaveLength(3);
  });

  it('shows only the type when the title is null or blank', () => {
    render(<SpotHistoryList photos={PHOTOS} currentIndex={0} onSelect={() => {}} />);
    expect(screen.getByText('Defect')).toBeInTheDocument();
    expect(screen.getByText('Site visit')).toBeInTheDocument();
  });

  it('builds the accessible name with long date, type and title (or without title)', () => {
    render(<SpotHistoryList photos={PHOTOS} currentIndex={0} onSelect={() => {}} />);
    expect(screen.getByTestId('spot-history-item-p1')).toHaveAttribute(
      'aria-label',
      'September 11, 2026, Daily log: Plastering done',
    );
    expect(screen.getByTestId('spot-history-item-p2')).toHaveAttribute(
      'aria-label',
      'September 11, 2026, Defect',
    );
  });

  it('localizes the entry type and the date in German', async () => {
    localeState.resolvedLocale = 'de';
    await i18n.changeLanguage('de');
    try {
      render(<SpotHistoryList photos={[PHOTOS[1]!]} currentIndex={0} onSelect={() => {}} />);
      expect(screen.getByTestId('spot-history-item-p2')).toHaveAttribute(
        'aria-label',
        '11. September 2026, Mangel',
      );
      expect(screen.queryByText('Defect')).not.toBeInTheDocument();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('scrolls the current item into view when scrollIntoView exists', () => {
    const scrollIntoView = jest.fn();
    (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView = scrollIntoView;

    const { rerender } = render(
      <SpotHistoryList photos={PHOTOS} currentIndex={0} onSelect={() => {}} />,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });

    scrollIntoView.mockClear();
    rerender(<SpotHistoryList photos={PHOTOS} currentIndex={2} onSelect={() => {}} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does not crash when scrollIntoView is undefined (jsdom)', () => {
    expect(() =>
      render(<SpotHistoryList photos={PHOTOS} currentIndex={0} onSelect={() => {}} />),
    ).not.toThrow();
  });

  it('uses instant scrolling when the user prefers reduced motion', () => {
    const scrollIntoView = jest.fn();
    (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView = scrollIntoView;
    const original = window.matchMedia;
    window.matchMedia = jest.fn(() => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    try {
      render(<SpotHistoryList photos={PHOTOS} currentIndex={0} onSelect={() => {}} />);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
    } finally {
      window.matchMedia = original;
    }
  });
});
