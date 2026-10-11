/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandSearchProvider } from './CommandSearchContext.js';
import type { CommandSearchOpenOptions } from './CommandSearchContext.js';
import { CreateMenuProvider } from '../CreateMenu/CreateMenuContext.js';
import { SearchEverywhereRow } from './SearchEverywhereRow.js';
import type { SearchEverywhereRowProps } from './SearchEverywhereRow.js';

function withProvider(props: SearchEverywhereRowProps) {
  const onOpen = jest.fn<(o: CommandSearchOpenOptions) => void>();
  render(
    <MemoryRouter>
      <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={jest.fn()}>
        <CommandSearchProvider isOpen={false} onOpen={onOpen} onClose={jest.fn()}>
          <SearchEverywhereRow {...props} />
        </CommandSearchProvider>
      </CreateMenuProvider>
    </MemoryRouter>,
  );
  return onOpen;
}

describe('SearchEverywhereRow', () => {
  it('renders the sentence with the trimmed draft as label and title', () => {
    withProvider({ query: '  roof tiles ' });
    const row = screen.getByTestId('search-everywhere-row');
    expect(row).toHaveTextContent('Search everywhere for “roof tiles”');
    expect(row).toHaveAttribute('title', 'Search everywhere for “roof tiles”');
    expect(row).toHaveAttribute('aria-haspopup', 'dialog');
    expect(row).toHaveAttribute('type', 'button');
  });

  it('keeps the whole sentence in the DOM for long drafts (truncation is CSS only)', () => {
    const long = 'x'.repeat(90);
    withProvider({ query: long });
    expect(screen.getByTestId('search-everywhere-row').textContent).toContain(long);
  });

  it.each(['', ' ', 'a', ' a '])('renders nothing for the draft %p', (query) => {
    withProvider({ query });
    expect(screen.queryByTestId('search-everywhere-row')).toBeNull();
  });

  it('renders for exactly two characters', () => {
    withProvider({ query: 'ab' });
    expect(screen.getByTestId('search-everywhere-row')).toBeInTheDocument();
  });

  it('renders nothing outside a provider', () => {
    render(<SearchEverywhereRow query="roof" />);
    expect(screen.queryByTestId('search-everywhere-row')).toBeNull();
  });

  it('opens the search with the trimmed text and the return target on click', () => {
    const returnFocusRef = createRef<HTMLElement>();
    const onOpen = withProvider({ query: ' roof ', returnFocusRef });
    fireEvent.click(screen.getByTestId('search-everywhere-row'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    const options = onOpen.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    expect(options?.query).toBe('roof');
    expect(options?.returnFocusRef).toBe(returnFocusRef);
  });

  it('uses a custom test id', () => {
    withProvider({ query: 'roof', testId: 'custom-row' });
    expect(screen.getByTestId('custom-row')).toBeInTheDocument();
  });

  it('hides its glyph from assistive technology', () => {
    withProvider({ query: 'roof' });
    expect(screen.getByTestId('search-everywhere-row').querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
