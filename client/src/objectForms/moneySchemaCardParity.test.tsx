/**
 * @jest-environment jsdom
 *
 * AC4 (#2255): a field shared by a quick-create dialog and a page card is the same schema field.
 * For the company, funding source and grant forms, each case renders the dialog (ObjectForm on
 * the schema) and the card in edit mode, then compares the accessible name, the `maxLength`, the
 * hint text and the error text on the same invalid input. Every value is also pinned against
 * the en locale, never only dialog against card.
 *
 * Mutations these tests catch: a card that re-implements a label, limit, hint or message; a
 * card dropping a schema `maxLength` or `hint`; a validator rule applied in one surface only.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BudgetSource, SubsidyProgram, VendorDetail } from '@cornerstone/shared';
import enBudget from '../i18n/en/budget.json';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../test/photoSpotFixtures.js';
import type { SectionCardController } from '../components/SectionCard/SectionCard.js';
import type { ObjectFormSchema } from '../components/ObjectForm/types.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';
import type * as CompanyFormTypes from './companyForm.js';
import type * as FundingFormTypes from './fundingSourceForm.js';
import type * as GrantFormTypes from './grantForm.js';
import type * as CompanyCardsTypes from '../pages/VendorDetailPage/CompanyDetailCards.js';
import type * as FundingCardTypes from '../pages/BudgetSourcesPage/FundingSourceDetailsSection.js';
import type * as GrantCardTypes from '../pages/SubsidyProgramsPage/GrantDetailsSection.js';

jest.unstable_mockModule('../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: [], isLoading: false, isInitialLoading: false, error: null }),
}));
jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  searchCompanies: jest.fn(),
  fetchVendor: jest.fn(),
}));
jest.unstable_mockModule('../lib/budgetSourcesApi.js', () => ({
  createBudgetSource: jest.fn(),
  updateBudgetSource: jest.fn(),
}));
jest.unstable_mockModule('../lib/subsidyProgramsApi.js', () => ({
  createSubsidyProgram: jest.fn(),
  updateSubsidyProgram: jest.fn(),
  fetchSubsidyPrograms: jest.fn(),
}));
jest.unstable_mockModule('../components/EntityPicker/EntityMultiPicker.js', () => ({
  EntityMultiPicker: () => null,
}));

let ObjectFormModule: typeof ObjectFormTypes;
let CompanyForm: typeof CompanyFormTypes;
let FundingForm: typeof FundingFormTypes;
let GrantForm: typeof GrantFormTypes;
let CompanyCards: typeof CompanyCardsTypes;
let FundingCard: typeof FundingCardTypes;
let GrantCard: typeof GrantCardTypes;
let media: MatchMediaControl;

interface Observed {
  readonly name: string;
  readonly error: string | null;
  readonly hint: string | null;
  readonly maxLength: string | null;
}

/** Accessible name, wired error and hint text, and the maxlength of one control. */
function observe(control: HTMLElement): Observed {
  const label = (control as HTMLInputElement).labels?.[0];
  expect(label).toBeDefined();
  const ids = control.getAttribute('aria-describedby')?.split(' ') ?? [];
  const text = (suffix: string) => {
    const id = ids.find((candidate) => candidate.endsWith(suffix));
    return id ? (document.getElementById(id)?.textContent ?? null) : null;
  };
  return {
    name: label!.textContent ?? '',
    error: text('-error'),
    hint: text('-hint'),
    maxLength: control.getAttribute('maxlength'),
  };
}

function DialogHost({ useSchema }: { useSchema: () => ObjectFormSchema }) {
  const schema = useSchema();
  return <ObjectFormModule.ObjectForm schema={schema} onCreated={() => {}} onCancel={() => {}} />;
}

const renderDialog = (useSchema: () => ObjectFormSchema) =>
  render(
    <MemoryRouter>
      <DialogHost useSchema={useSchema} />
    </MemoryRouter>,
  );

const setValue = (control: HTMLElement, value: string) =>
  fireEvent.change(control, { target: { value } });

beforeEach(async () => {
  media = installMatchMedia({ '(min-width: 768px)': true });
  if (!ObjectFormModule) {
    ObjectFormModule = await import('../components/ObjectForm/ObjectForm.js');
    CompanyForm = await import('./companyForm.js');
    FundingForm = await import('./fundingSourceForm.js');
    GrantForm = await import('./grantForm.js');
    CompanyCards = await import('../pages/VendorDetailPage/CompanyDetailCards.js');
    FundingCard = await import('../pages/BudgetSourcesPage/FundingSourceDetailsSection.js');
    GrantCard = await import('../pages/SubsidyProgramsPage/GrantDetailsSection.js');
  }
});

afterEach(() => {
  cleanup();
  media.restore();
});

const noAsterisk = (name: string) => name.replace(/\s*\(required\)\s*$/, '').trim();

describe('company: dialog and cards share the same fields (AC4)', () => {
  const vendor = {
    id: 'v1',
    name: 'Sample Roofing Co',
    trade: null,
    phone: '555-0100',
    email: 'office@sample.example',
    address: '1 Sample Street',
    notes: 'Calls back',
    createdBy: null,
  } as unknown as VendorDetail;

  const FIELDS = {
    name: { dialog: 'company-name-input', card: 'company-field-name' },
    email: { dialog: 'company-email-input', card: 'company-field-email' },
    phone: { dialog: 'company-phone-input', card: 'company-field-phone' },
    address: { dialog: 'company-address-input', card: 'company-field-address' },
    notes: { dialog: 'company-notes-input', card: 'company-field-notes' },
  } as const;
  type Key = keyof typeof FIELDS;
  const KEYS = Object.keys(FIELDS) as Key[];

  async function observeDialog(): Promise<Record<Key, Observed>> {
    const user = userEvent.setup();
    renderDialog(() => CompanyForm.useCompanyFormSchema());
    setValue(screen.getByTestId(FIELDS.email.dialog), 'nope');
    await user.click(screen.getByTestId('object-form-save'));
    await screen.findByText(enBudget.companies.form.nameRequired);
    const out = {} as Record<Key, Observed>;
    for (const key of KEYS) out[key] = observe(screen.getByTestId(FIELDS[key].dialog));
    cleanup();
    return out;
  }

  async function observeCards(): Promise<Record<Key, Observed>> {
    const user = userEvent.setup();
    render(
      <CompanyCards.CompanyDetailCards
        vendor={vendor}
        onSaved={async () => undefined}
        phoneCardRef={createRef<SectionCardController>()}
      />,
    );
    await user.click(screen.getByTestId('company-phone-email-edit'));
    await user.click(screen.getByTestId('company-address-edit'));
    await user.click(screen.getByTestId('company-about-edit'));
    setValue(screen.getByTestId(FIELDS.name.card), '');
    setValue(screen.getByTestId(FIELDS.email.card), 'nope');
    await user.click(screen.getByTestId('company-about-save'));
    await user.click(screen.getByTestId('company-phone-email-save'));
    await screen.findByText(enBudget.companies.form.nameRequired);
    await screen.findByText(enBudget.companies.form.emailInvalid);
    const out = {} as Record<Key, Observed>;
    for (const key of KEYS) out[key] = observe(screen.getByTestId(FIELDS[key].card));
    return out;
  }

  it('name, email, phone, address and notes agree on label, limit, hint and error, and match en', async () => {
    const dialog = await observeDialog();
    const card = await observeCards();

    for (const key of KEYS) {
      expect({ key, ...card[key] }).toEqual({ key, ...dialog[key] });
    }
    expect(noAsterisk(dialog.name.name)).toBe(enBudget.companies.form.name);
    expect(noAsterisk(dialog.email.name)).toBe(enBudget.companies.form.email);
    expect(noAsterisk(dialog.phone.name)).toBe(enBudget.companies.form.phone);
    expect(noAsterisk(dialog.address.name)).toBe(enBudget.companies.form.address);
    expect(noAsterisk(dialog.notes.name)).toBe(enBudget.companies.form.notes);
    expect(dialog.name.error).toBe(enBudget.companies.form.nameRequired);
    expect(dialog.email.error).toBe(enBudget.companies.form.emailInvalid);
    expect(dialog.name.maxLength).toBe('200');
    expect(dialog.phone.maxLength).toBe('50');
    expect(dialog.email.maxLength).toBe('255');
    expect(dialog.address.maxLength).toBe('500');
    expect(dialog.notes.maxLength).toBe('10000');
  });
});

describe('funding source: dialog and card share the same fields (AC4)', () => {
  const source = {
    id: 'bs-1',
    name: 'Loan Alpha',
    sourceType: 'bank_loan',
    status: 'active',
    isDiscretionary: false,
    totalAmount: 50000,
    interestRate: 3.5,
    terms: null,
    reference: null,
    contactAddress: null,
    notes: null,
  } as unknown as BudgetSource;

  const IDS = {
    name: { card: 'source-field-name' },
    totalAmount: { card: 'source-field-amount' },
    interestRate: { card: 'source-field-interest-rate' },
  } as const;
  type Key = keyof typeof IDS;
  const KEYS = Object.keys(IDS) as Key[];

  it('name, amount (0 on a loan) and interest rate agree on label, hint and error, and match en', async () => {
    const user = userEvent.setup();
    renderDialog(() => FundingForm.useFundingSourceFormSchema());
    const dialogControl = (name: Key) => document.querySelector(`[name="${name}"]`) as HTMLElement;
    setValue(dialogControl('totalAmount'), '0');
    setValue(dialogControl('interestRate'), '101');
    await user.click(screen.getByTestId('object-form-save'));
    await screen.findByText(enBudget.financing.errors.nameRequired);
    const dialog = {} as Record<Key, Observed>;
    for (const key of KEYS) dialog[key] = observe(dialogControl(key));
    cleanup();

    render(<FundingCard.FundingSourceDetailsSection source={source} onSaved={async () => {}} />);
    await user.click(screen.getByTestId('source-details-edit'));
    setValue(screen.getByTestId(IDS.name.card), '');
    setValue(screen.getByTestId(IDS.totalAmount.card), '0');
    setValue(screen.getByTestId(IDS.interestRate.card), '101');
    await user.click(screen.getByTestId('source-details-save'));
    await screen.findByText(enBudget.financing.errors.nameRequired);
    const card = {} as Record<Key, Observed>;
    for (const key of KEYS) card[key] = observe(screen.getByTestId(IDS[key].card));

    for (const key of KEYS) expect({ key, ...card[key] }).toEqual({ key, ...dialog[key] });
    expect(noAsterisk(dialog.name.name)).toBe(enBudget.financing.fields.name);
    expect(noAsterisk(dialog.totalAmount.name)).toBe(enBudget.financing.fields.amount);
    expect(noAsterisk(dialog.interestRate.name)).toBe(enBudget.financing.fields.interestRate);
    expect(dialog.name.error).toBe(enBudget.financing.errors.nameRequired);
    expect(dialog.totalAmount.error).toBe(enBudget.financing.errors.amountMinimum);
    expect(dialog.interestRate.error).toBe(enBudget.financing.errors.interestInvalid);
    expect(dialog.name.maxLength).toBe('200');
  });
});

describe('grant: dialog and card share the same fields (AC4)', () => {
  const grant = {
    id: 'sp-1',
    name: 'Energy grant',
    reductionType: 'percentage',
    reductionValue: 30,
    maximumAmount: 12000,
    applicationDeadline: '2026-09-01',
    description: null,
    notes: null,
  } as unknown as SubsidyProgram;

  const IDS = {
    name: { card: 'grant-field-name' },
    reductionValue: { card: 'grant-field-rate' },
    maximumAmount: { card: 'grant-field-cap' },
    applicationDeadline: { card: 'grant-field-deadline' },
  } as const;
  type Key = keyof typeof IDS;
  const KEYS = Object.keys(IDS) as Key[];

  it('name, rate (150), cap (0 with its hint) and deadline agree on label, hint and error, and match en', async () => {
    const user = userEvent.setup();
    renderDialog(() => GrantForm.useGrantFormSchema());
    const dialogControl = (name: Key) => document.querySelector(`[name="${name}"]`) as HTMLElement;
    setValue(dialogControl('reductionValue'), '150');
    setValue(dialogControl('maximumAmount'), '0');
    await user.click(screen.getByTestId('object-form-save'));
    await screen.findByText(enBudget.financing.errors.nameRequired);
    const dialog = {} as Record<Key, Observed>;
    for (const key of KEYS) dialog[key] = observe(dialogControl(key));
    cleanup();

    render(<GrantCard.GrantDetailsSection grant={grant} onSaved={async () => {}} />);
    await user.click(screen.getByTestId('grant-details-edit'));
    setValue(screen.getByTestId(IDS.name.card), '');
    setValue(screen.getByTestId(IDS.reductionValue.card), '150');
    setValue(screen.getByTestId(IDS.maximumAmount.card), '0');
    await user.click(screen.getByTestId('grant-details-save'));
    await screen.findByText(enBudget.financing.errors.nameRequired);
    const card = {} as Record<Key, Observed>;
    for (const key of KEYS) card[key] = observe(screen.getByTestId(IDS[key].card));

    for (const key of KEYS) expect({ key, ...card[key] }).toEqual({ key, ...dialog[key] });
    expect(noAsterisk(dialog.name.name)).toBe(enBudget.financing.fields.name);
    expect(noAsterisk(dialog.reductionValue.name)).toBe(enBudget.financing.fields.rate);
    expect(noAsterisk(dialog.maximumAmount.name)).toBe(enBudget.financing.grant.cap);
    expect(dialog.applicationDeadline.name).toBe(enBudget.financing.fields.deadline);
    expect(dialog.reductionValue.error).toBe(enBudget.financing.errors.rateInvalid);
    expect(dialog.reductionValue.hint).toBe(enBudget.financing.hints.rate);
    expect(dialog.maximumAmount.error).toBe(enBudget.financing.errors.amountInvalid);
    expect(dialog.maximumAmount.hint).toBe(enBudget.financing.hints.cap);
    expect(dialog.name.maxLength).toBe('200');
  });
});
