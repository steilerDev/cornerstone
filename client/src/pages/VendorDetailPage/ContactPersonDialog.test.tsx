/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { VendorContact } from '@cornerstone/shared';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as ApiTypes from '../../lib/vendorContactsApi.js';
import type * as DialogTypes from './ContactPersonDialog.js';

const mockCreate = jest.fn<typeof ApiTypes.createVendorContact>();
const mockUpdate = jest.fn<typeof ApiTypes.updateVendorContact>();
jest.unstable_mockModule('../../lib/vendorContactsApi.js', () => ({
  createVendorContact: mockCreate,
  updateVendorContact: mockUpdate,
  deleteVendorContact: jest.fn(),
}));

let Dialog: typeof DialogTypes;
let media: MatchMediaControl;

const contact: VendorContact = {
  id: 'c1',
  vendorId: 'v1',
  firstName: 'Pat',
  lastName: 'Example',
  name: 'Pat Example',
  role: null,
  phone: null,
  email: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(async () => {
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockCreate.mockResolvedValue({ ...contact, id: 'new', name: 'Casey' });
  mockUpdate.mockResolvedValue(contact);
  media = installMatchMedia({ '(min-width: 768px)': true });
  if (!Dialog) Dialog = await import('./ContactPersonDialog.js');
});

afterEach(() => media.restore());

function renderDialog(target: DialogTypes.ContactPersonDialogProps['target']) {
  const onSaved = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const onClose = jest.fn();
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  const openerRef = createRef<HTMLElement>() as { current: HTMLElement | null };
  openerRef.current = opener;
  render(
    <MemoryRouter>
      <Dialog.ContactPersonDialog
        vendorId="v1"
        target={target}
        onSaved={onSaved}
        onClose={onClose}
        openerRef={openerRef}
      />
    </MemoryRouter>,
  );
  return { onSaved, onClose, opener };
}

describe('ContactPersonDialog', () => {
  it('creates a contact person: posts the typed name, refreshes the page and closes', async () => {
    const user = userEvent.setup();
    const { onSaved, onClose } = renderDialog({ mode: 'create' });

    await user.type(screen.getByTestId('contact-person-first-name'), 'Casey');
    await user.click(screen.getByTestId('contact-person-form-save'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith('v1', expect.objectContaining({ firstName: 'Casey' }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('shows the name rule and posts nothing when both names are empty', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ mode: 'create' });

    await user.click(screen.getByTestId('contact-person-form-save'));

    expect(await screen.findByText('Enter a first or last name.')).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('edits a contact person with its values prefilled and sends only the change', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ mode: 'edit', contact });
    expect(screen.getByTestId('contact-person-first-name')).toHaveValue('Pat');

    await user.type(screen.getByTestId('contact-person-last-name'), 'son');
    await user.click(screen.getByTestId('contact-person-form-save'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalledWith('v1', 'c1', { lastName: 'Exampleson' });
  });

  it('Cancel closes without a request', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ mode: 'create' });

    await user.click(screen.getByTestId('contact-person-form-cancel'));

    expect(onClose).toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
