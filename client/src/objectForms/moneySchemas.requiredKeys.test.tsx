/**
 * @jest-environment jsdom
 */
/**
 * AC4a (#2255): every key the API requires on create is covered by the quick-create schema.
 *
 * The API-required keys are read from wiki/API-Contract.md (POST /api/vendors, POST
 * /api/vendors/:vendorId/contacts, POST /api/budget-sources, POST /api/subsidy-programs). For
 * each endpoint the test checks (a) every required key is a `required: true` field, or a
 * submit-time constant that no field offers (`reductionType`), and (b) a submit of minimal valid
 * values reaches the API mock with every required key defined.
 *
 * Mutations these tests catch: a required key removed from the table's schema (field dropped or
 * `required` turned off); a constant dropped from the create payload (`reductionType`); a
 * required value not sent (e.g. `sourceType` omitted when the select is untouched); the contact
 * rule changed to "both names" or "no names".
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ObjectFormSchema, ObjectFormValues } from '../components/ObjectForm/types.js';
import type { EntityOption } from '../components/EntityPicker/types.js';
import { makeLocaleContextMock } from '../test/photoSpotFixtures.js';
import type * as CompanyTypes from './companyForm.js';
import type * as ContactTypes from './contactPersonForm.js';
import type * as FundingTypes from './fundingSourceForm.js';
import type * as GrantTypes from './grantForm.js';

type Body = Record<string, unknown>;

const mockCreateVendor = jest.fn<(body: Body) => Promise<unknown>>();
const mockCreateContact = jest.fn<(vendorId: string, body: Body) => Promise<unknown>>();
const mockCreateSource = jest.fn<(body: Body) => Promise<unknown>>();
const mockCreateGrant = jest.fn<(body: Body) => Promise<unknown>>();

jest.unstable_mockModule('../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  createVendor: mockCreateVendor,
  searchCompanies: jest.fn(),
  fetchVendor: jest.fn(),
}));
jest.unstable_mockModule('../lib/vendorContactsApi.js', () => ({
  createVendorContact: mockCreateContact,
  updateVendorContact: jest.fn(),
  deleteVendorContact: jest.fn(),
}));
jest.unstable_mockModule('../lib/budgetSourcesApi.js', () => ({
  createBudgetSource: mockCreateSource,
}));
jest.unstable_mockModule('../lib/subsidyProgramsApi.js', () => ({
  createSubsidyProgram: mockCreateGrant,
  fetchSubsidyPrograms: jest.fn(),
}));
jest.unstable_mockModule('../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: [], isLoading: false, isInitialLoading: false, error: null }),
}));
jest.unstable_mockModule('../components/EntityPicker/EntityMultiPicker.js', () => ({
  EntityMultiPicker: () => null,
}));

/** API-required keys per endpoint, from wiki/API-Contract.md. */
const API_REQUIRED = {
  vendors: ['name'],
  budgetSources: ['name', 'sourceType', 'totalAmount'],
  subsidyPrograms: ['name', 'reductionType', 'reductionValue'],
} as const;

const taskOption = (): EntityOption => ({
  id: 'work_item:wi-1',
  label: 'Roof',
  itemType: 'work_item',
  entityId: 'wi-1',
});

let Company: typeof CompanyTypes;
let Contact: typeof ContactTypes;
let Funding: typeof FundingTypes;
let Grant: typeof GrantTypes;

beforeEach(async () => {
  for (const mock of [mockCreateVendor, mockCreateContact, mockCreateSource, mockCreateGrant]) {
    mock.mockReset();
    mock.mockResolvedValue({ id: 'new-1', name: 'Synthetic' });
  }
  if (!Company) {
    Company = await import('./companyForm.js');
    Contact = await import('./contactPersonForm.js');
    Funding = await import('./fundingSourceForm.js');
    Grant = await import('./grantForm.js');
  }
});

function schemaOf(useSchema: () => ObjectFormSchema): ObjectFormSchema {
  return renderHook(useSchema, { wrapper: MemoryRouter }).result.current;
}

/** The names of fields flagged `required: true`. */
const requiredFields = (schema: ObjectFormSchema) =>
  schema.fields.filter((field) => field.required === true).map((field) => field.name);

describe('AC4a: every API-required key is covered by the create schema', () => {
  describe('POST /api/vendors', () => {
    const schema = () => schemaOf(() => Company.useCompanyFormSchema());

    it.each(API_REQUIRED.vendors)('%s is a required field', (key) => {
      expect(requiredFields(schema())).toContain(key);
    });

    it('a submit of the minimal valid values sends every required key', async () => {
      const s = schema();
      expect(s.validate({ ...s.initialValues, name: 'Sample Roofing Co' })).toEqual({});

      await s.submit({ ...s.initialValues, name: 'Sample Roofing Co' });

      const body = mockCreateVendor.mock.calls[0]![0];
      for (const key of API_REQUIRED.vendors) {
        expect(body).toHaveProperty(key);
        expect(body[key]).toBeDefined();
        expect(body[key]).not.toBeNull();
      }
    });
  });

  describe('POST /api/vendors/:vendorId/contacts (first or last name)', () => {
    const schema = () =>
      schemaOf(() =>
        Contact.useContactPersonFormSchema({
          mode: 'create',
          vendorId: 'v-1',
          onSaved: async () => undefined,
        }),
      );
    const values = (over: ObjectFormValues) => ({ ...schema().initialValues, ...over });

    it('rejects both names empty and accepts either one alone', () => {
      expect(Object.keys(schema().validate(values({})))).toContain('firstName');
      expect(schema().validate(values({ firstName: 'Pat' }))).toEqual({});
      expect(schema().validate(values({ lastName: 'Example' }))).toEqual({});
    });

    it('a last name alone is sent as lastName', async () => {
      await schema().submit(values({ lastName: 'Example' }));

      const body = mockCreateContact.mock.calls[0]![1];
      expect(mockCreateContact.mock.calls[0]![0]).toBe('v-1');
      expect(body).toHaveProperty('lastName', 'Example');
    });

    it('a first name alone is sent as firstName', async () => {
      await schema().submit(values({ firstName: 'Pat' }));

      expect(mockCreateContact.mock.calls[0]![1]).toHaveProperty('firstName', 'Pat');
    });
  });

  describe('POST /api/budget-sources', () => {
    const schema = () => schemaOf(() => Funding.useFundingSourceFormSchema());

    it.each(API_REQUIRED.budgetSources)('%s is a required field', (key) => {
      expect(requiredFields(schema())).toContain(key);
    });

    it('a submit of the minimal valid values sends every required key', async () => {
      const s = schema();
      const minimal = { ...s.initialValues, name: 'Loan Alpha', totalAmount: '50000' };
      expect(s.validate(minimal)).toEqual({});

      await s.submit(minimal);

      const body = mockCreateSource.mock.calls[0]![0];
      for (const key of API_REQUIRED.budgetSources) {
        expect(body).toHaveProperty(key);
        expect(body[key]).toBeDefined();
      }
      expect(body.sourceType).not.toBe('discretionary');
      expect(body.totalAmount).toBe(50000);
    });

    it('a blank required key does not validate', () => {
      const s = schema();
      expect(s.validate({ ...s.initialValues, totalAmount: '10' })).toHaveProperty('name');
      expect(s.validate({ ...s.initialValues, name: 'x' })).toHaveProperty('totalAmount');
    });
  });

  describe('POST /api/subsidy-programs', () => {
    const schema = () => schemaOf(() => Grant.useGrantFormSchema());

    it.each(['name', 'reductionValue'])('%s is a required field', (key) => {
      expect(API_REQUIRED.subsidyPrograms).toContain(key);
      expect(requiredFields(schema())).toContain(key);
    });

    it('reductionType is no field, and a submit constant', async () => {
      const s = schema();
      expect(API_REQUIRED.subsidyPrograms).toContain('reductionType');
      expect(s.fields.map((field) => field.name)).not.toContain('reductionType');
      const minimal = {
        ...s.initialValues,
        name: 'Energy grant',
        reductionValue: '30',
        items: [taskOption()],
      };
      expect(s.validate(minimal)).toEqual({});

      await s.submit(minimal);

      const body = mockCreateGrant.mock.calls[0]![0];
      for (const key of API_REQUIRED.subsidyPrograms) {
        expect(body).toHaveProperty(key);
        expect(body[key]).toBeDefined();
      }
      expect(body.reductionType).toBe('percentage');
      expect(body.reductionValue).toBe(30);
    });
  });

  it('every table key is checked: the table is not empty and has the contract keys', () => {
    expect(API_REQUIRED.vendors).toEqual(['name']);
    expect(API_REQUIRED.budgetSources).toEqual(['name', 'sourceType', 'totalAmount']);
    expect(API_REQUIRED.subsidyPrograms).toEqual(['name', 'reductionType', 'reductionValue']);
  });
});
