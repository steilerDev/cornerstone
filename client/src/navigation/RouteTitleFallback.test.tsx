/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { act, render } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import type * as RouteTitleFallbackTypes from './RouteTitleFallback.js';

const houseState: { name: string | null } = { name: null };
jest.unstable_mockModule('../contexts/HouseNameContext.js', () => ({
  useHouseName: () => ({ houseName: houseState.name, setHouseName: () => {} }),
}));

let RouteTitleFallback: typeof RouteTitleFallbackTypes.RouteTitleFallback;

beforeAll(async () => {
  ({ RouteTitleFallback } = await import('./RouteTitleFallback.js'));
});

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <RouteTitleFallback />
    </MemoryRouter>,
  );
}

describe('RouteTitleFallback', () => {
  beforeEach(() => {
    houseState.name = null;
    document.title = 'initial';
  });

  it('renders nothing', () => {
    const { container } = renderAt('/budget/invoices');

    expect(container).toBeEmptyDOMElement();
  });

  it('sets "<section> · <house>" inside a section', () => {
    houseState.name = 'Synthetic House';

    renderAt('/budget/invoices');

    expect(document.title).toBe('Money · Synthetic House');
  });

  it('falls back to the product name without a house name', () => {
    renderAt('/budget/invoices');

    expect(document.title).toBe('Money · Cornerstone');
  });

  it('uses only the product name on a page outside every section', () => {
    renderAt('/login');

    expect(document.title).toBe('Cornerstone');
  });

  it('uses only the house name on an unmatched path', () => {
    houseState.name = 'Synthetic House';

    renderAt('/no/such/page');

    expect(document.title).toBe('Synthetic House');
  });

  it('follows navigation to another section', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/project/work-items']}>
        <RouteTitleFallback />
        <Link to="/project/household-items">go</Link>
      </MemoryRouter>,
    );
    expect(document.title).toBe('Tasks · Cornerstone');

    act(() => {
      getByText('go').click();
    });

    expect(document.title).toBe('Purchases · Cornerstone');
  });
});
