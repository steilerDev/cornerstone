/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TipModule from './NetAmountTip.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  LocaleProvider: ({ children }: { children: unknown }) => children,
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
}));

let NetAmountTip: (typeof TipModule)['NetAmountTip'];

beforeEach(async () => {
  ({ NetAmountTip } = (await import('./NetAmountTip.js')) as typeof TipModule);
});

function setup() {
  render(<NetAmountTip gross={119} net={100} vatRate={0.19} name="Hallway tiles" testId="g" />);
}

const tip = () => screen.getByRole('tooltip');

describe('NetAmountTip', () => {
  it('shows the gross amount and a labelled info button described by the tip', () => {
    setup();
    expect(screen.getByTestId('g')).toHaveTextContent('€119.00');
    const button = screen.getByRole('button', { name: /Hallway tiles/ });
    expect(button).toHaveAttribute('aria-describedby', tip().id);
    expect(tip()).toHaveTextContent('€100.00');
    expect(tip()).toHaveTextContent('19%');
  });

  it('opens on hover, focus and click and closes on Escape', async () => {
    setup();
    const button = screen.getByRole('button', { name: /Hallway tiles/ });
    const open = () => tip().className.includes('visible');
    expect(open()).toBe(false);
    await userEvent.hover(button);
    expect(open()).toBe(true);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(open()).toBe(false);
    fireEvent.click(button);
    expect(open()).toBe(true);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(open()).toBe(false);
  });

  it('right-aligns the bubble', () => {
    setup();
    expect(tip().className).toContain('alignEnd');
  });
});
