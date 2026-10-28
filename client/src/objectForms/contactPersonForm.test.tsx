/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { VendorContact } from '@cornerstone/shared';
import type * as ApiTypes from '../lib/vendorContactsApi.js';
import type * as FormTypes from './contactPersonForm.js';

const mockCreate = jest.fn<typeof ApiTypes.createVendorContact>();
const mockUpdate = jest.fn<typeof ApiTypes.updateVendorContact>();
jest.unstable_mockModule('../lib/vendorContactsApi.js', () => ({
  createVendorContact: mockCreate,
  updateVendorContact: mockUpdate,
  deleteVendorContact: jest.fn(),
}));

let Form: typeof FormTypes;

const contact = (over: Partial<VendorContact> = {}): VendorContact => ({
  id: 'c1',
  vendorId: 'v1',
  firstName: 'Pat',
  lastName: 'Example',
  name: 'Pat Example',
  role: 'Foreman',
  phone: '555-0100',
  email: 'pat@example.org',
  notes: 'Calls back',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const onSaved = jest.fn<() => Promise<unknown>>();

function schemaOf(options: FormTypes.ContactPersonFormMode) {
  return renderHook(
    () => Form.useContactPersonFormSchema({ ...options, vendorId: 'v1', onSaved }),
    { wrapper: MemoryRouter },
  ).result.current;
}

beforeEach(async () => {
  mockCreate.mockReset();
  mockUpdate.mockReset();
  onSaved.mockReset();
  onSaved.mockResolvedValue(undefined);
  mockCreate.mockResolvedValue(contact({ id: 'new', name: 'Stored Name' }));
  mockUpdate.mockResolvedValue(contact({ name: 'Updated Name' }));
  if (!Form) Form = await import('./contactPersonForm.js');
});

describe('contactPersonForm', () => {
  describe('schema', () => {
    it('is New contact person in create mode with empty values and the API body keys as fields', () => {
      const schema = schemaOf({ mode: 'create' });

      expect(schema.id).toBe('contact-person');
      expect(schema.title).toBe('New contact person');
      expect(schema.fields.map((f) => f.name)).toEqual([
        'firstName',
        'lastName',
        'role',
        'phone',
        'email',
        'notes',
      ]);
      expect(Object.values(schema.initialValues ?? {})).toEqual(['', '', '', '', '', '']);
      expect(schema.fields.filter((f) => f.essential).map((f) => f.name)).toEqual([
        'firstName',
        'lastName',
      ]);
    });

    it('prefills the stored values in edit mode, null as empty, with the edit title', () => {
      const schema = schemaOf({
        mode: 'edit',
        contact: contact({ lastName: null, role: null, phone: null }),
      });

      expect(schema.title).toBe('Edit contact person');
      expect(schema.initialValues).toEqual({
        firstName: 'Pat',
        lastName: '',
        role: '',
        phone: '',
        email: 'pat@example.org',
        notes: 'Calls back',
      });
    });

    it('types phone as tel and e-mail as email with autocomplete tokens', () => {
      const fields = schemaOf({ mode: 'create' }).fields;

      expect(fields.find((f) => f.name === 'phone')).toMatchObject({
        kind: 'tel',
        autoComplete: 'tel',
      });
      expect(fields.find((f) => f.name === 'email')).toMatchObject({
        kind: 'email',
        autoComplete: 'email',
      });
    });
  });

  describe('validation', () => {
    const errorsFor = (values: Record<string, unknown>) =>
      schemaOf({ mode: 'create' }).validate(values);

    // Mutation: requiring both names contradicts the server rule (a first OR a last name).
    it('needs a first or a last name, measured after trimming', () => {
      const message = 'Enter a first or last name.';
      expect(errorsFor({})).toEqual({ firstName: message });
      expect(errorsFor({ firstName: '  ', lastName: '' })).toEqual({ firstName: message });
      expect(errorsFor({ firstName: 'Pat' })).toEqual({});
      expect(errorsFor({ lastName: 'Example' })).toEqual({});
    });

    it('rejects a malformed e-mail and accepts a blank or valid one', () => {
      expect(errorsFor({ firstName: 'Pat', email: 'nope' })).toEqual({
        email: 'Enter a valid e-mail address.',
      });
      expect(errorsFor({ firstName: 'Pat', email: '' })).toEqual({});
      expect(errorsFor({ firstName: 'Pat', email: 'a@b.co' })).toEqual({});
    });

    it('reports the name and e-mail problems together', () => {
      expect(Object.keys(errorsFor({ email: 'nope' })).sort()).toEqual(['email', 'firstName']);
    });
  });

  describe('submit, create', () => {
    it('trims the values, sends blanks as null, refreshes the page and labels the stored name', async () => {
      const result = await schemaOf({ mode: 'create' }).submit({
        firstName: '  Pat ',
        lastName: '',
        role: '   ',
        phone: ' 555-0100 ',
        email: '',
        notes: ' hi ',
      });

      expect(mockCreate).toHaveBeenCalledWith('v1', {
        firstName: 'Pat',
        lastName: null,
        role: null,
        phone: '555-0100',
        email: null,
        notes: 'hi',
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'new', href: '/companies/v1', label: 'Stored Name' });
    });

    it('treats a non-string value as empty', async () => {
      await schemaOf({ mode: 'create' }).submit({ firstName: 'Pat', role: 5 });

      expect(mockCreate.mock.calls[0]![1]).toMatchObject({ role: null });
    });

    it('does not refresh when the request fails', async () => {
      mockCreate.mockRejectedValue(new Error('boom'));

      await expect(schemaOf({ mode: 'create' }).submit({ firstName: 'Pat' })).rejects.toThrow(
        'boom',
      );

      expect(onSaved).not.toHaveBeenCalled();
    });
  });

  describe('submit, edit', () => {
    const same = {
      firstName: 'Pat',
      lastName: 'Example',
      role: 'Foreman',
      phone: '555-0100',
      email: 'pat@example.org',
      notes: 'Calls back',
    };

    // Mutation: sending the whole form overwrites fields another editor changed meanwhile.
    it('PATCHes only the changed fields, trimmed', async () => {
      const result = await schemaOf({ mode: 'edit', contact: contact() }).submit({
        ...same,
        phone: ' 555-0199 ',
        notes: '',
      });

      expect(mockUpdate).toHaveBeenCalledWith('v1', 'c1', { phone: '555-0199', notes: null });
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'c1', href: '/companies/v1', label: 'Updated Name' });
    });

    it('sends no request when nothing changed, still refreshes, and labels the existing name', async () => {
      const result = await schemaOf({ mode: 'edit', contact: contact() }).submit({
        ...same,
        phone: ' 555-0100  ',
      });

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(result.label).toBe('Pat Example');
    });

    it('treats a stored null and a blank input as unchanged', async () => {
      await schemaOf({ mode: 'edit', contact: contact({ lastName: null, role: null }) }).submit({
        ...same,
        lastName: '',
        role: '  ',
      });

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
