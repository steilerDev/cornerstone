/**
 * @jest-environment jsdom
 */
/**
 * grantForm (#2242, S8): the New grant schema.
 *
 * Mutations these tests catch: a reduction-type field (new grants are percentage only); the
 * type sent as anything but 'percentage'; items not sent as { type, id } from itemType/entityId;
 * Save allowed without an item; a rate above 100 or 0; a cap of 0; "No category" sent as a
 * category id instead of includesNoCategoryItems.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, renderHook, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import budgetEn from '../i18n/en/budget.json';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';
import type { CreateSubsidyProgramRequest, SubsidyProgram } from '@cornerstone/shared';
import type { EntityOption } from '../components/EntityPicker/types.js';
import type { ObjectFormField } from '../components/ObjectForm/types.js';
import type * as FormTypes from './grantForm.js';

const mockCreateSubsidyProgram =
  jest.fn<(data: CreateSubsidyProgramRequest) => Promise<SubsidyProgram>>();
jest.unstable_mockModule('../lib/subsidyProgramsApi.js', () => ({
  createSubsidyProgram: mockCreateSubsidyProgram,
  // EntityPicker's grant kind imports it
  fetchSubsidyPrograms: jest.fn(),
}));

interface MultiProps {
  value: readonly EntityOption[];
  onChange: (next: readonly EntityOption[]) => void;
  picker: { kind: string; create?: string; disabled?: boolean; specialOptions?: unknown[] };
  removeLabel: (option: EntityOption) => string;
  countLabel: (count: number) => string;
  invalid?: boolean;
  describedBy?: string;
  testId: string;
  id?: string;
}
jest.unstable_mockModule('../components/EntityPicker/EntityMultiPicker.js', () => ({
  EntityMultiPicker: (props: MultiProps) => (
    <div
      data-testid={props.testId}
      data-kind={props.picker.kind}
      data-create={props.picker.create}
      data-invalid={String(props.invalid)}
      data-described-by={props.describedBy}
      data-special={JSON.stringify(props.picker.specialOptions ?? [])}
    >
      <span data-testid={`${props.testId}-count`}>{props.countLabel(2)}</span>
      <span data-testid={`${props.testId}-remove`}>
        {props.removeLabel({ id: 'x', label: 'Roof' })}
      </span>
      <button
        type="button"
        data-testid={`${props.testId}-add`}
        onClick={() => props.onChange([...props.value, { id: 'o-1', label: 'Roof' }])}
      />
    </div>
  ),
}));

describe('grantForm', () => {
  let Form: typeof FormTypes;

  beforeEach(async () => {
    mockCreateSubsidyProgram.mockReset();
    mockCreateSubsidyProgram.mockResolvedValue({
      id: 'sp-9',
      name: 'Energy grant',
    } as SubsidyProgram);
    if (!Form) Form = await import('./grantForm.js');
  });

  const schema = () => renderHook(() => Form.useGrantFormSchema()).result.current;
  const taskOption = (): EntityOption => ({
    id: 'work_item:wi-1',
    label: 'Roof',
    itemType: 'work_item',
    entityId: 'wi-1',
  });
  const purchaseOption = (): EntityOption => ({
    id: 'household_item:hi-1',
    label: 'Oven',
    itemType: 'household_item',
    entityId: 'hi-1',
  });
  const filled = (over: Record<string, unknown> = {}) => ({
    ...schema().initialValues,
    name: 'Energy grant',
    reductionValue: '30',
    items: [taskOption()],
    ...over,
  });

  it('is titled "New grant", has no type field, and starts as eligible', () => {
    const s = schema();
    expect(s.id).toBe('grant');
    expect(s.title).toBe('New grant');
    expect(s.fields.map((f) => f.name)).not.toContain('reductionType');
    expect(s.fields.map((f) => f.name)).not.toContain('includesNoCategoryItems');
    expect(s.initialValues).toMatchObject({
      applicationStatus: 'eligible',
      items: [],
      categories: [],
    });
    expect(s.fields.filter((f) => f.essential).map((f) => f.name)).toEqual([
      'name',
      'applicationStatus',
      'reductionValue',
      'maximumAmount',
      'applicationDeadline',
      'items',
    ]);
  });

  it('lists the create fields in the spec order', () => {
    expect(schema().fields.map((f) => f.name)).toEqual([
      'name',
      'applicationStatus',
      'reductionValue',
      'maximumAmount',
      'applicationDeadline',
      'items',
      'categories',
      'description',
      'eligibility',
      'notes',
    ]);
  });

  it('caps the percentage at 100 in create and edit scope, but not for a fixed grant', () => {
    const rv = (o?: Parameters<typeof Form.useGrantFormSchema>[0]) =>
      renderHook(() => Form.useGrantFormSchema(o)).result.current.fields.find(
        (f) => f.name === 'reductionValue',
      )!;
    expect(rv().max).toBe(100);
    expect(rv({ scope: 'edit' }).max).toBe(100);
    expect(rv({ scope: 'edit', fixed: true }).max).toBeUndefined();
  });

  it('edit scope drops Status and Items, and no scope has a type or provider field', () => {
    const edit = renderHook(() => Form.useGrantFormSchema({ scope: 'edit' })).result.current;
    const names = edit.fields.map((f) => f.name);
    expect(names).not.toContain('applicationStatus');
    expect(names).not.toContain('items');
    expect(names).toContain('reductionValue');
    for (const list of [names, schema().fields.map((f) => f.name)]) {
      expect(list).not.toContain('reductionType');
      expect(list).not.toContain('provider');
    }
  });

  describe('rate and cap labels', () => {
    const rateField = (opts?: Parameters<typeof Form.useGrantFormSchema>[0]) =>
      renderHook(() => Form.useGrantFormSchema(opts)).result.current.fields.find(
        (f) => f.name === 'reductionValue',
      )!;

    it('percentage: the rate label with its hint; the cap carries its own hint', () => {
      const field = rateField({ scope: 'edit' });
      expect(field.label).toBe(budgetEn.financing.fields.rate);
      expect(field.hint).toBe(budgetEn.financing.hints.rate);
      const cap = schema().fields.find((f) => f.name === 'maximumAmount')!;
      expect(cap.hint).toBe(budgetEn.financing.hints.cap);
    });

    it('fixed (edit): "Fixed reduction" and no hint', () => {
      const field = rateField({ scope: 'edit', fixed: true });
      expect(field.label).toBe(budgetEn.financing.grant.fixedReductionField);
      expect(field.label).not.toBe(budgetEn.financing.fields.rate);
      expect(field.hint).toBeUndefined();
    });

    it('fixed is ignored in create scope', () => {
      const field = rateField({ fixed: true });
      expect(field.label).toBe(budgetEn.financing.fields.rate);
    });
  });

  describe('validateGrantValues', () => {
    const messages = {
      nameRequired: 'N',
      rateInvalid: 'RATE',
      amountInvalid: 'AMOUNT',
      itemsRequired: 'ITEMS',
    };
    const base = { name: 'G', reductionValue: '30', maximumAmount: '', items: [taskOption()] };

    it('150: rate error for a percentage grant, none for a fixed one', () => {
      const v = { ...base, reductionValue: '150' };
      expect(Form.validateGrantValues(v, messages).reductionValue).toBe('RATE');
      expect(Form.validateGrantValues(v, messages, { fixed: true }).reductionValue).toBeUndefined();
    });

    it('0: amount error for a fixed grant, rate error for a percentage grant', () => {
      const v = { ...base, reductionValue: '0' };
      expect(Form.validateGrantValues(v, messages, { fixed: true }).reductionValue).toBe('AMOUNT');
      expect(Form.validateGrantValues(v, messages).reductionValue).toBe('RATE');
    });

    it('fixed rejects a blank reduction', () => {
      const v = { ...base, reductionValue: '' };
      expect(Form.validateGrantValues(v, messages, { fixed: true }).reductionValue).toBe('AMOUNT');
    });

    it('a cap of 0 is an amount error', () => {
      expect(
        Form.validateGrantValues({ ...base, maximumAmount: '0' }, messages).maximumAmount,
      ).toBe('AMOUNT');
    });

    it('items are required in create scope only', () => {
      const v = { ...base, items: [] };
      expect(Form.validateGrantValues(v, messages).items).toBe('ITEMS');
      expect(Form.validateGrantValues(v, messages, { scope: 'edit' }).items).toBeUndefined();
    });

    it('reads missing keys as blank', () => {
      expect(Form.validateGrantValues({}, messages, { scope: 'edit' })).toEqual({
        name: 'N',
        reductionValue: 'RATE',
      });
    });
  });

  describe('in the dialog', () => {
    let FormComponent: typeof ObjectFormTypes;
    let media: MatchMediaControl;
    beforeEach(async () => {
      media = installMatchMedia({ '(min-width: 768px)': true });
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    });
    afterEach(() => media.restore());

    function Harness() {
      const s = Form.useGrantFormSchema();
      return <FormComponent.ObjectForm schema={s} onCreated={() => {}} onCancel={() => {}} />;
    }

    it('shows Status and Deadline without More details, Status before Rate', () => {
      render(
        <MemoryRouter>
          <Harness />
        </MemoryRouter>,
      );
      const status = screen.getByLabelText(budgetEn.financing.fields.status);
      const deadline = screen.getByLabelText(budgetEn.financing.fields.deadline);
      const rate = screen.getByLabelText(budgetEn.financing.fields.rate, { exact: false });
      expect(status).toBeVisible();
      expect(deadline).toBeVisible();
      expect(status.compareDocumentPosition(rate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByLabelText(budgetEn.financing.fields.description)).not.toBeVisible();
    });
  });

  describe('validate', () => {
    it('accepts a complete form', () => {
      expect(schema().validate(filled())).toEqual({});
    });

    it('requires a name and at least one item', () => {
      expect(schema().validate(filled({ name: ' ', items: [] }))).toEqual({
        name: 'Enter a name.',
        items: 'Choose at least one task or purchase',
      });
      expect(schema().validate(filled({ items: 'nope' }))).toEqual({
        items: 'Choose at least one task or purchase',
      });
    });

    it.each(['', '0', '-1', '100.5', 'x'])('rejects the rate %j', (rate) => {
      expect(schema().validate(filled({ reductionValue: rate }))).toEqual({
        reductionValue: 'Enter a rate above 0 and up to 100.',
      });
    });

    it.each(['0.01', '100'])('accepts the rate %s', (rate) => {
      expect(schema().validate(filled({ reductionValue: rate }))).toEqual({});
    });

    it('accepts no cap, rejects a cap of 0 or below, accepts a positive cap', () => {
      expect(schema().validate(filled({ maximumAmount: '' }))).toEqual({});
      expect(schema().validate(filled({ maximumAmount: '12000' }))).toEqual({});
      for (const cap of ['0', '-5', 'abc']) {
        expect(schema().validate(filled({ maximumAmount: cap }))).toEqual({
          maximumAmount: 'Enter an amount greater than 0.',
        });
      }
    });
  });

  describe('submit', () => {
    it('sends a percentage grant with its items as { type, id }, and null for blank optional fields', async () => {
      const s = schema();

      const result = await s.submit(filled({ items: [taskOption(), purchaseOption()] }));

      expect(mockCreateSubsidyProgram).toHaveBeenCalledWith({
        name: 'Energy grant',
        reductionType: 'percentage',
        reductionValue: 30,
        maximumAmount: null,
        applicationStatus: 'eligible',
        applicationDeadline: null,
        categoryIds: [],
        includesNoCategoryItems: false,
        description: null,
        eligibility: null,
        notes: null,
        items: [
          { type: 'work_item', id: 'wi-1' },
          { type: 'household_item', id: 'hi-1' },
        ],
      });
      expect(result).toEqual({
        id: 'sp-9',
        href: '/budget/financing/grants/sp-9',
        label: 'Energy grant',
      });
      expect(s.addedMessage?.(result)).toBe('Energy grant added.');
    });

    it('maps "No category" to includesNoCategoryItems and keeps the other categories as ids', async () => {
      await schema().submit(
        filled({
          categories: [
            { id: 'bc-1', label: 'Windows' },
            { id: Form.NO_CATEGORY_OPTION_ID, label: 'No category' },
          ],
          maximumAmount: '12000',
          applicationStatus: 'applied',
          applicationDeadline: '2026-09-01',
          description: ' d ',
          eligibility: ' e ',
          notes: ' n ',
        }),
      );

      expect(mockCreateSubsidyProgram).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: ['bc-1'],
          includesNoCategoryItems: true,
          maximumAmount: 12000,
          applicationStatus: 'applied',
          applicationDeadline: '2026-09-01',
          description: 'd',
          eligibility: 'e',
          notes: 'n',
        }),
      );
    });

    it('sends only "No category" as the flag, with no category ids', async () => {
      await schema().submit(
        filled({ categories: [{ id: Form.NO_CATEGORY_OPTION_ID, label: 'No category' }] }),
      );
      expect(mockCreateSubsidyProgram).toHaveBeenCalledWith(
        expect.objectContaining({ categoryIds: [], includesNoCategoryItems: true }),
      );
    });
  });

  describe('custom fields', () => {
    const field = (name: string): ObjectFormField => schema().fields.find((f) => f.name === name)!;

    function renderField(name: string, value: unknown, busy = false) {
      const setValue = jest.fn();
      render(
        <>
          {field(name).render!({
            id: `f-${name}`,
            value,
            setValue,
            busy,
            invalid: true,
            describedBy: 'err',
          } as never)}
        </>,
      );
      return setValue;
    }

    it('items: a task / purchase multi-picker with removal and count wording', () => {
      const setValue = renderField('items', [], false);

      const el = screen.getByTestId('grant-form-items');
      expect(el).toHaveAttribute('data-kind', 'taskOrPurchase');
      expect(el).toHaveAttribute('data-invalid', 'true');
      expect(el).toHaveAttribute('data-described-by', 'err');
      expect(screen.getByTestId('grant-form-items-count')).toHaveTextContent('2 selected');
      expect(screen.getByTestId('grant-form-items-remove')).toHaveTextContent('Remove Roof');
      fireEvent.click(screen.getByTestId('grant-form-items-add'));
      expect(setValue).toHaveBeenCalledWith([{ id: 'o-1', label: 'Roof' }]);
    });

    it('categories: a category multi-picker that cannot create and offers "No category"', () => {
      renderField('categories', 'not-an-array');

      const el = screen.getByTestId('grant-form-categories');
      expect(el).toHaveAttribute('data-kind', 'category');
      expect(el).toHaveAttribute('data-create', 'off');
      expect(JSON.parse(el.getAttribute('data-special')!)).toEqual([
        { id: Form.NO_CATEGORY_OPTION_ID, label: 'No category' },
      ]);
    });
  });
});
