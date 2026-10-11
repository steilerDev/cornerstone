import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RealLocationKeyContext, useRealLocationKey } from './realLocation.js';

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
