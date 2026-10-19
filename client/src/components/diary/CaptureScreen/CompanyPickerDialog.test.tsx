import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installMatchMedia } from '../../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../../test/matchMediaControl.js';
import type * as DialogModule from './CompanyPickerDialog.js';
import type * as VendorsApiTypes from '../../../lib/vendorsApi.js';

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
let mockIsCreating = false;

jest.unstable_mockModule('../../../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
}));
jest.unstable_mockModule('../../../objectForms/useCompanyCreateAction.js', () => ({
  useCompanyCreateAction: () => ({ createAction: undefined, isCreating: mockIsCreating }),
}));

const WIDE = '(min-width: 768px)';
let CompanyPickerDialog: typeof DialogModule.CompanyPickerDialog;
let media: MatchMediaControl;

beforeEach(async () => {
  mockIsCreating = false;
  mockSearchCompanies.mockReset();
  mockSearchCompanies.mockResolvedValue([
    { id: 'c1', name: 'Alpha Build' },
    { id: 'c2', name: 'Beta Roofing' },
  ] as never);
  media = installMatchMedia();
  if (!CompanyPickerDialog) ({ CompanyPickerDialog } = await import('./CompanyPickerDialog.js'));
});

afterEach(() => {
  media.restore();
});

function setup(open = true) {
  const onClose = jest.fn();
  const onPick = jest.fn();
  const view = render(<CompanyPickerDialog open={open} onClose={onClose} onPick={onPick} />);
  return { onClose, onPick, ...view };
}

describe('CompanyPickerDialog', () => {
  it('renders a modal from 768px with the company search', async () => {
    media.set(WIDE, true);
    setup();

    expect(await screen.findByRole('dialog', { name: 'Choose a company' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Company name')).toBeInTheDocument();
  });

  it('renders nothing from 768px while closed', () => {
    media.set(WIDE, true);
    setup(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the bottom sheet below 768px', async () => {
    setup();

    expect(await screen.findByTestId('capture-company-sheet')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Company name')).toBeInTheDocument();
  });

  it('does not mount the search while the sheet is closed', () => {
    setup(false);

    expect(screen.queryByPlaceholderText('Company name')).not.toBeInTheDocument();
  });

  it('hands the picked company over and closes', async () => {
    const user = userEvent.setup();
    media.set(WIDE, true);
    const { onPick, onClose } = setup();

    await user.click(await screen.findByPlaceholderText('Company name'));
    await user.click(await screen.findByText('Beta Roofing'));

    expect(onPick).toHaveBeenCalledWith({ id: 'c2', name: 'Beta Roofing' });
    expect(onClose).toHaveBeenCalled();
  });

  it('searches companies as the person types', async () => {
    const user = userEvent.setup();
    media.set(WIDE, true);
    setup();

    await user.type(await screen.findByPlaceholderText('Company name'), 'Alp');

    await waitFor(() =>
      expect(mockSearchCompanies).toHaveBeenLastCalledWith('Alp', expect.any(AbortSignal)),
    );
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    media.set(WIDE, true);
    const { onClose } = setup();
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('cannot be dismissed with Escape while a company is being created', async () => {
    const user = userEvent.setup();
    mockIsCreating = true;
    media.set(WIDE, true);
    const { onClose } = setup();
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });
});
