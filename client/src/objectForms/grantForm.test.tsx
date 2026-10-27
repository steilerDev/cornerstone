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
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, renderHook, screen, fireEvent } from '@testing-library/react';
import type { CreateSubsidyProgramRequest, SubsidyProgram } from '@cornerstone/shared';
import type { EntityOption } from '../components/EntityPicker/types.js';
import type { ObjectFormField } from '../components/ObjectForm/types.js';
import type * as FormTypes from './grantForm.js';

const mockCreateSubsidyProgram =
  jest.fn<(data: CreateSubsidyProgramRequest) => Promise<SubsidyProgram>>();
jest.unstable_mockModule('../lib/subsidyProgramsApi.js', () => ({
  createSubsidyProgram: mockCreateSubsidyProgram,
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
      'reductionValue',
      'maximumAmount',
      'items',
    ]);
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
