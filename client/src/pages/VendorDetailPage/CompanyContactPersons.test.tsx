/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { VendorContact } from '@cornerstone/shared';
import { ToastProvider, useToast } from '../../components/Toast/ToastContext.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as ApiTypes from '../../lib/vendorContactsApi.js';
import type * as UndoTypes from '../../lib/undoApi.js';
import type * as ListTypes from './CompanyContactPersons.js';

const mockCreate = jest.fn<typeof ApiTypes.createVendorContact>();
const mockUpdate = jest.fn<typeof ApiTypes.updateVendorContact>();
const mockDelete = jest.fn<typeof ApiTypes.deleteVendorContact>();
jest.unstable_mockModule('../../lib/vendorContactsApi.js', () => ({
  createVendorContact: mockCreate,
  updateVendorContact: mockUpdate,
  deleteVendorContact: mockDelete,
}));
const mockUndo = jest.fn<typeof UndoTypes.undoChange>();
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndo }));

let List: typeof ListTypes;
let media: MatchMediaControl;

const TOKEN = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

const person = (id: string, over: Partial<VendorContact> = {}): VendorContact => ({
  id,
  vendorId: 'v1',
  firstName: id,
  lastName: null,
  name: `Person ${id}`,
  role: null,
  phone: null,
  email: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const onChanged = jest.fn<() => Promise<unknown>>();

function ToastView() {
  const { toasts, undoToast } = useToast();
  return (
    <ul data-testid="toasts">
      {toasts.map((toast) => (
        <li key={toast.id}>
          <span>{toast.message}</span>
          {toast.variant === 'undo' && (
            <button type="button" data-testid="toast-undo" onClick={() => void undoToast(toast.id)}>
              Undo
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function renderList(contacts: VendorContact[]) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <List.CompanyContactPersons vendorId="v1" contacts={contacts} onChanged={onChanged} />
      </MemoryRouter>
      <ToastView />
    </ToastProvider>,
  );
}

beforeEach(async () => {
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockUndo.mockReset();
  onChanged.mockReset();
  onChanged.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue({ undo: TOKEN } as never);
  mockUndo.mockResolvedValue({ restored: [] } as never);
  mockCreate.mockResolvedValue(person('new'));
  mockUpdate.mockResolvedValue(person('c1'));
  media = installMatchMedia({ '(min-width: 768px)': true });
  if (!List) List = await import('./CompanyContactPersons.js');
});

afterEach(() => media.restore());

const FULL = person('c1', {
  firstName: 'Pat',
  lastName: 'Example',
  name: 'Pat Example',
  role: 'Foreman',
  phone: '+49 30 555-0142',
  email: 'pat@example.org',
});

describe('CompanyContactPersons', () => {
  it('shows the empty message and a New contact person button without contacts', () => {
    renderList([]);

    expect(screen.getByText(/No contact persons yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New contact person' })).toBeInTheDocument();
  });

  it('shows name, role, phone and e-mail links, and a Call button for a person with a number', () => {
    renderList([FULL]);

    const row = screen.getByTestId('company-contacts-row-c1');
    expect(row).toHaveTextContent('Pat Example');
    expect(row).toHaveTextContent('Foreman');
    expect(within(row).getByRole('link', { name: '+49 30 555-0142' })).toHaveAttribute(
      'href',
      'tel:+49305550142',
    );
    expect(within(row).getByRole('link', { name: 'pat@example.org' })).toHaveAttribute(
      'href',
      'mailto:pat@example.org',
    );
    expect(screen.getByTestId('company-contacts-call-c1')).toHaveAttribute(
      'href',
      'tel:+49305550142',
    );
    expect(screen.getByTestId('company-contacts-call-c1')).toHaveAccessibleName(
      'Call Pat Example on +49 30 555-0142',
    );
  });

  // Mutation: a Call button for a blank number is a dead control.
  it('shows "No phone number" and no Call button for a person without a number or with a blank one', () => {
    renderList([person('c2'), person('c3', { phone: '   ' })]);

    expect(screen.getByTestId('company-contacts-row-c2')).toHaveTextContent('No phone number');
    expect(screen.getByTestId('company-contacts-row-c3')).toHaveTextContent('No phone number');
    expect(screen.queryByTestId('company-contacts-call-c2')).toBeNull();
    expect(screen.queryByTestId('company-contacts-call-c3')).toBeNull();
  });

  it('opens the New dialog, creates a person and refreshes the page', async () => {
    const user = userEvent.setup();
    renderList([]);

    await user.click(screen.getByRole('button', { name: 'New contact person' }));
    await user.type(await screen.findByTestId('contact-person-first-name'), 'Casey');
    await user.click(screen.getByTestId('contact-person-form-save'));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith('v1', expect.objectContaining({ firstName: 'Casey' }));
    await waitFor(() => expect(screen.queryByTestId('contact-person-form-save')).toBeNull());
  });

  it('opens the Edit dialog with the person prefilled and PATCHes only the change', async () => {
    const user = userEvent.setup();
    renderList([FULL]);

    await user.click(screen.getByTestId('company-contacts-edit-c1'));
    expect(await screen.findByTestId('contact-person-first-name')).toHaveValue('Pat');
    await user.type(screen.getByTestId('contact-person-last-name'), 'son');
    await user.click(screen.getByTestId('contact-person-form-save'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('v1', 'c1', { lastName: 'Exampleson' }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('closes the dialog on Cancel without a request', async () => {
    const user = userEvent.setup();
    renderList([FULL]);
    await user.click(screen.getByTestId('company-contacts-edit-c1'));

    await user.click(await screen.findByTestId('contact-person-form-cancel'));

    expect(screen.queryByTestId('contact-person-first-name')).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // Mutation: dropping the refresh after Remove leaves the person in the page record.
  it('Remove deletes the person, refreshes the page and offers Undo through the toast', async () => {
    const user = userEvent.setup();
    renderList([FULL, person('c2')]);

    await user.click(screen.getByTestId('company-contacts-actions-c1'));
    await user.click(await screen.findByTestId('company-contacts-remove-c1'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('v1', 'c1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('toast-undo')).toBeInTheDocument();
  });

  it('Undo sends the removal token and refreshes the page again (restore)', async () => {
    const user = userEvent.setup();
    renderList([FULL]);
    await user.click(screen.getByTestId('company-contacts-actions-c1'));
    await user.click(await screen.findByTestId('company-contacts-remove-c1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    await user.click(await screen.findByTestId('toast-undo'));

    await waitFor(() => expect(mockUndo).toHaveBeenCalledWith('tok-1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
  });

  it('keeps the person and shows no Undo when the removal fails', async () => {
    const user = userEvent.setup();
    mockDelete.mockRejectedValue(new Error('net'));
    renderList([FULL]);

    await user.click(screen.getByTestId('company-contacts-actions-c1'));
    await user.click(await screen.findByTestId('company-contacts-remove-c1'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(screen.queryByTestId('toast-undo')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByTestId('company-contacts-row-c1')).toBeInTheDocument();
  });
});
