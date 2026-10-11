import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  RealLocationContext,
  RealLocationKeyContext,
  useRealLocation,
  useRealLocationKey,
} from './realLocation.js';

function Probe() {
  return <span data-testid="key">{useRealLocationKey()}</span>;
}

describe('useRealLocationKey', () => {
  it('returns the provided real key', () => {
    render(
      <MemoryRouter>
        <RealLocationKeyContext value="real-key">
          <Probe />
        </RealLocationKeyContext>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('key').textContent).toBe('real-key');
  });

  it('falls back to the router location key without a provider', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/x', key: 'loc-key' }]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('key').textContent).toBe('loc-key');
  });
});

function LocationProbe() {
  return <output data-testid="loc">{JSON.stringify(useRealLocation())}</output>;
}

describe('useRealLocation', () => {
  it('returns the provided real location in full (path, search, hash, key)', () => {
    const real = {
      pathname: '/project/work-items/new',
      search: '?areaId=x',
      hash: '#h',
      key: 'rk',
    };
    render(
      <MemoryRouter initialEntries={['/project/work-items']}>
        <RealLocationContext value={real}>
          <LocationProbe />
        </RealLocationContext>
      </MemoryRouter>,
    );
    expect(JSON.parse(screen.getByTestId('loc').textContent ?? '{}')).toEqual(real);
  });

  it('falls back to the router location without a provider', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/x', search: '?q=1', hash: '#t', key: 'lk' }]}>
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(JSON.parse(screen.getByTestId('loc').textContent ?? '{}')).toEqual({
      pathname: '/x',
      search: '?q=1',
      hash: '#t',
      key: 'lk',
    });
  });
});
