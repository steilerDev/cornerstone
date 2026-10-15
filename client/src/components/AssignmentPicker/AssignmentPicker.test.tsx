/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { UserResponse, VendorListItem } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type { CompanyOption } from '../../objectForms/companyForm.js';
import type { SearchPickerCreateAction } from '../SearchPicker/SearchPicker.js';

const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: mockFetchVendor,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
}));

const { AssignmentPicker, encodeAssignment, decodeAssignment } =
  await import('./AssignmentPicker.js');

function user(id: string, displayName: string, deactivatedAt?: string): UserResponse {
  return {
    id,
    email: `${id}@example.com`,
    displayName,
    role: 'member',
    authProvider: 'local',
    oidcLinked: false,
    createdAt: '2024-01-01T00:00:00Z',
    ...(deactivatedAt ? { deactivatedAt } : {}),
  } as UserResponse;
}

function company(id: string, name: string, trade: VendorListItem['trade'] = null): VendorListItem {
  return { id, name, trade } as VendorListItem;
}

function listOf(vendors: VendorListItem[]) {
  return {
    vendors,
    pagination: { page: 1, pageSize: 50, totalItems: vendors.length, totalPages: 1 },
  } as Awaited<ReturnType<typeof VendorsApiTypes.fetchVendors>>;
}

const USERS = [
  user('u-1', 'Zoë Keller'),
  user('u-2', 'Ben Albrecht'),
  user('u-3', 'Old Timer', '2024-06-01T00:00:00Z'),
];

type Props = Partial<React.ComponentProps<typeof AssignmentPicker>>;

function Harness({ initial = '', onChange, ...rest }: Props & { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <AssignmentPicker
      users={USERS}
      {...rest}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('AssignmentPicker', () => {
  beforeEach(() => {
    mockFetchVendors.mockReset();
    mockFetchVendor.mockReset();
    mockFetchVendors.mockResolvedValue(
      listOf([
        company('v-1', 'Acme Roofing', {
          id: 't-1',
          name: 'Roofing',
          color: null,
          translationKey: null,
        } as VendorListItem['trade']),
        company('v-2', 'Birch Tiling'),
      ]),
    );
  });

  describe('encodeAssignment and decodeAssignment', () => {
    it('encodes a user, a company or nothing', () => {
      expect(encodeAssignment('u-1')).toBe('user:u-1');
      expect(encodeAssignment(undefined, 'v-1')).toBe('vendor:v-1');
      expect(encodeAssignment()).toBe('');
    });

    it('prefers the user when both are given', () => {
      expect(encodeAssignment('u-1', 'v-1')).toBe('user:u-1');
    });

    it('decodes each form back', () => {
      expect(decodeAssignment('user:u-1')).toEqual({ userId: 'u-1', vendorId: undefined });
      expect(decodeAssignment('vendor:v-1')).toEqual({ userId: undefined, vendorId: 'v-1' });
      expect(decodeAssignment('')).toEqual({ userId: undefined, vendorId: undefined });
      expect(decodeAssignment('garbage')).toEqual({ userId: undefined, vendorId: undefined });
    });
  });

  describe('options', () => {
    it('lists active people first, then companies, when focused empty', async () => {
      render(<Harness />);

      await userEvent.click(screen.getByRole('textbox'));

      const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
      expect(names).toEqual(['Zoë Keller', 'Ben Albrecht', 'Acme RoofingRoofing', 'Birch Tiling']);
      expect(mockFetchVendors).toHaveBeenCalledWith(
        { pageSize: 50 },
        { signal: expect.any(AbortSignal) },
      );
    });

    it('does not search companies before the picker is used', () => {
      render(<Harness />);
      expect(mockFetchVendors).not.toHaveBeenCalled();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('filters people with folding and sends the query to the company search', async () => {
      mockFetchVendors.mockResolvedValue(listOf([]));
      render(<Harness />);

      await userEvent.type(screen.getByRole('textbox'), 'zoe');

      expect(await screen.findByRole('option', { name: 'Zoë Keller' })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByRole('option', { name: 'Ben Albrecht' })).not.toBeInTheDocument(),
      );
      expect(mockFetchVendors).toHaveBeenCalledWith(
        { q: 'zoe', pageSize: 50 },
        { signal: expect.any(AbortSignal) },
      );
    });

    it('finds a company beyond the first page by typing', async () => {
      mockFetchVendors.mockImplementation(async (params) =>
        listOf(params?.q === 'zeta' ? [company('v-250', 'Zeta Tiling')] : []),
      );
      const onChange = jest.fn();
      render(<Harness onChange={onChange} />);

      await userEvent.type(screen.getByRole('textbox'), 'zeta');
      await userEvent.click(await screen.findByRole('option', { name: 'Zeta Tiling' }));

      expect(onChange).toHaveBeenCalledWith('vendor:v-250');
    });

    it('never lists a deactivated user', async () => {
      render(<Harness />);
      await userEvent.click(screen.getByRole('textbox'));
      await screen.findByRole('option', { name: 'Zoë Keller' });

      expect(screen.queryByRole('option', { name: 'Old Timer' })).not.toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('emits user:<id> for a person', async () => {
      const onChange = jest.fn();
      render(<Harness onChange={onChange} />);

      await userEvent.click(screen.getByRole('textbox'));
      await userEvent.click(await screen.findByRole('option', { name: 'Ben Albrecht' }));

      expect(onChange).toHaveBeenCalledWith('user:u-2');
      expect(screen.getByText('Ben Albrecht')).toBeInTheDocument();
    });

    it('emits vendor:<id> for a company and shows its name without a lookup', async () => {
      const onChange = jest.fn();
      render(<Harness onChange={onChange} />);

      await userEvent.click(screen.getByRole('textbox'));
      await userEvent.click(await screen.findByRole('option', { name: 'Birch Tiling' }));

      expect(onChange).toHaveBeenCalledWith('vendor:v-2');
      expect(screen.getByText('Birch Tiling')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('emits an empty string on clear and shows the input again', async () => {
      const onChange = jest.fn();
      render(<Harness initial="user:u-1" onChange={onChange} />);

      await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

      expect(onChange).toHaveBeenCalledWith('');
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('moves focus off body after a pick', async () => {
      render(<Harness />);

      await userEvent.click(screen.getByRole('textbox'));
      await userEvent.click(await screen.findByRole('option', { name: 'Ben Albrecht' }));

      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: 'Clear selection' }),
        ),
      );
    });
  });

  describe('preselected values', () => {
    it('shows an assigned person by name', () => {
      render(<Harness initial="user:u-1" />);
      expect(screen.getByText('Zoë Keller')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('still shows a deactivated assigned user as the title', () => {
      render(<Harness initial="user:u-3" />);
      expect(screen.getByText('Old Timer')).toBeInTheDocument();
    });

    it('shows the known company without any lookup', () => {
      render(<Harness initial="vendor:v-9" knownVendor={{ id: 'v-9', name: 'Cedar Glazing' }} />);
      expect(screen.getByText('Cedar Glazing')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('looks up a saved company outside the first page and shows its name', async () => {
      mockFetchVendor.mockResolvedValue(company('v-250', 'Zeta Tiling') as never);
      render(<Harness initial="vendor:v-250" />);

      expect(await screen.findByText('Zeta Tiling')).toBeInTheDocument();
      expect(mockFetchVendor).toHaveBeenCalledWith('v-250');
    });

    it('is disabled while the company is being looked up', () => {
      mockFetchVendor.mockReturnValue(new Promise(() => {}));
      render(<Harness initial="vendor:v-250" />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('keeps the value of an unknown company (404) instead of unassigning', async () => {
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      const onChange = jest.fn();
      render(<Harness initial="vendor:v-gone" onChange={onChange} />);

      await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());

      expect(onChange).not.toHaveBeenCalled();
    });

    it('is disabled when the disabled prop is set', () => {
      render(<Harness disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('passes the id to the input', () => {
      render(<Harness id="assignee" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('id', 'assignee');
    });
  });

  describe('create row', () => {
    function action(
      onCreate: (q: string) => Promise<CompanyOption | null>,
      over: Partial<SearchPickerCreateAction<CompanyOption>> = {},
    ): SearchPickerCreateAction<CompanyOption> {
      return { getLabel: (q) => `New company ${q}`, show: 'noExactMatch', onCreate, ...over };
    }

    it('shows no create row without createAction', async () => {
      mockFetchVendors.mockResolvedValue(listOf([]));
      render(<Harness />);
      await userEvent.type(screen.getByRole('textbox'), 'Fresh Co');
      await waitFor(() => expect(mockFetchVendors).toHaveBeenCalled());
      await screen.findByText('No matching items found');

      expect(screen.queryByRole('option', { name: /New company/ })).not.toBeInTheDocument();
    });

    it('maps the created company to vendor:<id> and shows its name', async () => {
      mockFetchVendors.mockResolvedValue(listOf([]));
      const onCreate = jest.fn(async (_query: string) => ({ id: 'v-new', name: 'Fresh Co' }));
      const onChange = jest.fn();
      render(<Harness createAction={action(onCreate)} onChange={onChange} />);

      await userEvent.type(screen.getByRole('textbox'), 'Fresh Co');
      await userEvent.click(await screen.findByRole('option', { name: 'New company Fresh Co' }));

      await waitFor(() => expect(onChange).toHaveBeenCalledWith('vendor:v-new'));
      expect(onCreate).toHaveBeenCalledWith('Fresh Co');
      expect(await screen.findByText('Fresh Co')).toBeInTheDocument();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('selects nothing when the create is cancelled', async () => {
      mockFetchVendors.mockResolvedValue(listOf([]));
      const onChange = jest.fn();
      render(<Harness createAction={action(async () => null)} onChange={onChange} />);

      await userEvent.type(screen.getByRole('textbox'), 'Fresh Co');
      await userEvent.click(await screen.findByRole('option', { name: 'New company Fresh Co' }));

      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('forwards show and showWhenEmpty to the picker', async () => {
      mockFetchVendors.mockResolvedValue(listOf([company('v-1', 'Fresh Co')]));
      render(
        <Harness
          createAction={action(async () => null, { show: 'always', showWhenEmpty: true })}
        />,
      );

      await userEvent.click(screen.getByRole('textbox'));

      const listbox = await screen.findByRole('listbox');
      expect(within(listbox).getByRole('option', { name: 'New company' })).toBeInTheDocument();
    });
  });
});
