/**
 * @jest-environment jsdom
 */
/**
 * EntityMultiPicker (#2242, D4, S7): add-mode EntityPicker plus removable chips.
 *
 * Mutations these tests catch: a pick not appended or appended twice; chosen ids left in the
 * results; focus lost after Remove (it must go to the next chip, else the input); the count not
 * announced; `invalid` not reaching the input; a chosen special option offered again.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { VendorListItem } from '@cornerstone/shared';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as MultiModule from './EntityMultiPicker.js';
import type { EntityOption } from './types.js';

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
  fetchVendor: mockFetchVendor,
}));

const company = (id: string, name: string) => ({ id, name, trade: null }) as VendorListItem;
const listOf = (vendors: VendorListItem[]) =>
  vendors as Awaited<ReturnType<typeof VendorsApiTypes.searchCompanies>>;

describe('EntityMultiPicker', () => {
  let Module: typeof MultiModule;
  const onChangeSpy = jest.fn<(next: readonly EntityOption[]) => void>();

  beforeEach(async () => {
    mockSearchCompanies.mockReset();
    mockFetchVendor.mockReset();
    onChangeSpy.mockReset();
    mockSearchCompanies.mockResolvedValue(
      listOf([
        company('v-1', 'Acme Roofing'),
        company('v-2', 'Birch Tiling'),
        company('v-3', 'Cedar'),
      ]),
    );
    if (!Module) Module = await import('./EntityMultiPicker.js');
  });

  function Harness({
    initial = [],
    excludeIds,
    invalid,
    describedBy,
    specialOptions,
    id,
    noneLabel,
  }: {
    id?: string;
    noneLabel?: string;
    initial?: EntityOption[];
    excludeIds?: string[];
    invalid?: boolean;
    describedBy?: string;
    specialOptions?: { id: string; label: string }[];
  }) {
    const [value, setValue] = useState<readonly EntityOption[]>(initial);
    return (
      <Module.EntityMultiPicker
        value={value}
        onChange={(next) => {
          onChangeSpy(next);
          setValue(next);
        }}
        picker={{ kind: 'company', create: 'off', specialOptions, noneLabel }}
        id={id}
        excludeIds={excludeIds}
        removeLabel={(option) => `Remove ${option.label}`}
        countLabel={(count) => `${count} selected`}
        invalid={invalid}
        describedBy={describedBy}
        testId="multi"
      />
    );
  }

  const input = () => screen.getByRole('textbox');
  const optionNames = async () =>
    (await screen.findAllByRole('option')).map((option) => option.textContent);

  it('appends a pick as a chip and keeps the input empty and focused', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(input());
    await user.click(await screen.findByRole('option', { name: /Acme Roofing/ }));

    expect(onChangeSpy).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'v-1', label: 'Acme Roofing' }),
    ]);
    expect(screen.getByTestId('multi-chip-v-1')).toHaveTextContent('Acme Roofing');
    expect(input()).toHaveValue('');
    await waitFor(() => expect(input()).toHaveFocus());
  });

  it('leaves chosen ids and excluded ids out of the results (no duplicate pick possible)', async () => {
    const user = userEvent.setup();
    render(<Harness excludeIds={['v-3']} />);

    await user.click(input());
    await user.click(await screen.findByRole('option', { name: /Acme Roofing/ }));
    await user.click(input());

    await waitFor(async () => expect(await optionNames()).toEqual(['Birch Tiling']));
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('announces the count through its own status region, empty while nothing is chosen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByTestId('multi-status')).toHaveTextContent('');
    expect(screen.getByTestId('multi-status')).toHaveAttribute('role', 'status');

    await user.click(input());
    await user.click(await screen.findByRole('option', { name: /Acme Roofing/ }));
    await user.click(input());
    await user.click(await screen.findByRole('option', { name: /Birch Tiling/ }));

    expect(screen.getByTestId('multi-status')).toHaveTextContent('2 selected');
  });

  it('Remove drops the chip and moves focus to the next chip', async () => {
    const user = userEvent.setup();
    const initial = [
      { id: 'v-1', label: 'Acme Roofing' },
      { id: 'v-2', label: 'Birch Tiling' },
      { id: 'v-3', label: 'Cedar' },
    ];
    render(<Harness initial={initial} />);

    await user.click(screen.getByRole('button', { name: 'Remove Acme Roofing' }));

    expect(screen.queryByTestId('multi-chip-v-1')).toBeNull();
    expect(onChangeSpy).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'v-2' }),
      expect.objectContaining({ id: 'v-3' }),
    ]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Birch Tiling' })).toHaveFocus(),
    );
  });

  it('Remove on the last chip moves focus to the previous chip, and on the only chip to the input', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { id: 'v-1', label: 'Acme Roofing' },
          { id: 'v-2', label: 'Birch Tiling' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Birch Tiling' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Acme Roofing' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'Remove Acme Roofing' }));
    await waitFor(() => expect(input()).toHaveFocus());
    expect(screen.queryByTestId('multi-chips')).toBeNull();
  });

  it('sets aria-invalid and aria-describedby on the input only when asked', () => {
    const { rerender } = render(<Harness />);
    expect(input()).not.toHaveAttribute('aria-invalid');
    expect(input()).not.toHaveAttribute('aria-describedby');
    rerender(<Harness invalid describedBy="err-1" />);
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveAttribute('aria-describedby', 'err-1');
  });

  it('a special option becomes a chip of its own and is not offered again', async () => {
    const user = userEvent.setup();
    render(<Harness specialOptions={[{ id: '__none__', label: 'No category' }]} />);

    await user.click(input());
    await user.click(await screen.findByRole('option', { name: /No category/ }));

    expect(onChangeSpy).toHaveBeenLastCalledWith([{ id: '__none__', label: 'No category' }]);
    expect(within(screen.getByTestId('multi-chips')).getByText('No category')).toBeInTheDocument();
    await user.click(input());
    await waitFor(async () =>
      expect((await optionNames()).some((name) => /No category/.test(name ?? ''))).toBe(false),
    );
  });

  it('uses the id the host passes for the input, and picking the "none" row adds no chip', async () => {
    const user = userEvent.setup();
    render(<Harness id="items-field" noneLabel="Nothing" />);
    expect(input()).toHaveAttribute('id', 'items-field');

    await user.click(input());
    await user.click(await screen.findByRole('option', { name: /Nothing/ }));

    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('multi-chips')).toBeNull();
  });

  it('shows the kind word of a chip when the option has one', () => {
    render(<Harness initial={[{ id: 'wi-1', label: 'Roof', kindWord: 'Task' }]} />);
    expect(screen.getByTestId('multi-chip-wi-1')).toHaveTextContent('TaskRoof');
  });
});
