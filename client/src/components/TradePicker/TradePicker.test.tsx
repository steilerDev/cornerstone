/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TradeResponse } from '@cornerstone/shared';
import { TradePicker } from './TradePicker.js';

const make = (id: string, name: string, translationKey: string | null = null): TradeResponse => ({
  id,
  name,
  color: null,
  description: null,
  translationKey,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const TRADES = [
  make('t-plumb', 'Sanitär', 'trades.plumbing'),
  make('t-roof', 'Roofing'),
  make('t-tile', 'Tiling'),
];

function renderPicker(props: Partial<React.ComponentProps<typeof TradePicker>> = {}) {
  const onChange = jest.fn();
  const onSelectItem = jest.fn();
  render(
    <TradePicker
      trades={TRADES}
      value=""
      onChange={onChange}
      onSelectItem={onSelectItem}
      placeholder="Search trades"
      {...props}
    />,
  );
  return { onChange, onSelectItem, input: screen.getByPlaceholderText('Search trades') };
}

describe('TradePicker', () => {
  it('lists every trade on focus, using the translated name for built-in trades', async () => {
    const user = userEvent.setup();
    const { input } = renderPicker();

    await user.click(input);

    expect(await screen.findByRole('option', { name: 'Plumbing' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Roofing' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tiling' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Sanitär' })).not.toBeInTheDocument();
  });

  it('filters by the typed text against the stored and the translated name', async () => {
    const user = userEvent.setup();
    const { input } = renderPicker();

    await user.type(input, 'sanit');
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Roofing' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('option', { name: 'Plumbing' })).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'plumb');
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Roofing' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('option', { name: 'Plumbing' })).toBeInTheDocument();
  });

  describe('excludeIds (#2213)', () => {
    it('does not offer an excluded trade on focus', async () => {
      const user = userEvent.setup();
      const { input } = renderPicker({ excludeIds: ['t-roof'] });

      await user.click(input);

      expect(await screen.findByRole('option', { name: 'Plumbing' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Tiling' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Roofing' })).not.toBeInTheDocument();
    });

    it('does not offer an excluded trade when its name is typed', async () => {
      const user = userEvent.setup();
      const { input } = renderPicker({ excludeIds: ['t-roof'] });

      await user.type(input, 'roof');

      expect(await screen.findByText('No matching items found')).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Roofing' })).not.toBeInTheDocument();
    });

    it('hides every excluded trade, including a translated built-in', async () => {
      const user = userEvent.setup();
      const { input } = renderPicker({ excludeIds: ['t-plumb', 't-tile'] });

      await user.click(input);

      expect(await screen.findByRole('option', { name: 'Roofing' })).toBeInTheDocument();
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });

    it('offers everything when no id is excluded', async () => {
      const user = userEvent.setup();
      const { input } = renderPicker();

      await user.click(input);

      await screen.findByRole('option', { name: 'Roofing' });
      expect(screen.getAllByRole('option')).toHaveLength(3);
    });
  });

  it('reports the picked trade through onChange and onSelectItem', async () => {
    const user = userEvent.setup();
    const { input, onChange, onSelectItem } = renderPicker();

    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Tiling' }));

    expect(onChange).toHaveBeenCalledWith('t-tile');
    expect(onSelectItem).toHaveBeenCalledWith({ id: 't-tile', label: 'Tiling' });
  });

  it('is disabled when asked to be', () => {
    const { input } = renderPicker({ disabled: true });
    expect(input).toBeDisabled();
  });
});
