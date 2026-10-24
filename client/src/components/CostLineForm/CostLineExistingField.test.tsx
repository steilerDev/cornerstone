/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as WorkTypes from '../../lib/workItemBudgetsApi.js';
import type * as HouseholdTypes from '../../lib/householdItemBudgetsApi.js';
import type * as FieldTypes from './CostLineExistingField.js';
import type { CostLineTarget } from '../CostLineTable/types.js';
import type { CostLineExistingRef } from './types.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockFetchWork = jest.fn<typeof WorkTypes.fetchWorkItemBudgets>();
jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: mockFetchWork,
  createWorkItemBudget: jest.fn(),
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));
const mockFetchHousehold = jest.fn<typeof HouseholdTypes.fetchHouseholdItemBudgets>();
jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: mockFetchHousehold,
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

const line = (id: string, description: string | null, planned: number, linked = false) =>
  ({
    id,
    description,
    plannedAmount: planned,
    includesVat: false,
    quantity: null,
    unit: null,
    unitPrice: null,
    invoiceLink: linked ? { invoiceId: 'x' } : null,
  }) as never;

const TASK: CostLineTarget = { type: 'work_item', id: 'wi-1', label: 'Lay floors' };
const PURCHASE: CostLineTarget = { type: 'household_item', id: 'hi-1', label: 'Sofa' };

describe('CostLineExistingField', () => {
  let Field: typeof FieldTypes;
  const onChange = jest.fn<(value: CostLineExistingRef | null) => void>();

  beforeEach(async () => {
    mockFetchWork.mockReset();
    mockFetchHousehold.mockReset();
    onChange.mockReset();
    mockFetchWork.mockResolvedValue([
      line('bl-a', 'Old estimate', 200),
      line('bl-b', null, 100),
      line('bl-l', 'Linked', 5, true),
    ]);
    mockFetchHousehold.mockResolvedValue([line('bl-h', 'Cover', 10)]);
    if (!Field) Field = await import('./CostLineExistingField.js');
  });

  function renderField(
    over: Partial<FieldTypes.CostLineExistingFieldProps> = {},
  ): ReturnType<typeof render> {
    return render(
      <Field.CostLineExistingField
        id="existing"
        target={TASK}
        value={null}
        onChange={onChange}
        busy={false}
        invalid={false}
        describedBy={undefined}
        {...over}
      />,
    );
  }

  it('maps only unlinked lines to picks with their gross', () => {
    const picks = Field.toExistingRefs(
      [line('a', 'A', 100), line('b', 'B', 100, true)],
      'work_item',
      0.19,
    );
    expect(picks).toEqual([{ id: 'a', type: 'work_item', description: 'A', gross: 119 }]);
  });

  it('shows a skeleton, then the unlinked lines of a task', async () => {
    renderField();
    expect(screen.queryByTestId('cost-line-existing')).toBeNull();
    const select = await screen.findByTestId('cost-line-existing');
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'New line',
      'Old estimate · €238.00',
      'Line without a description · €119.00',
    ]);
    expect(mockFetchHousehold).not.toHaveBeenCalled();
  });

  it('loads the lines of a purchase through the household endpoint', async () => {
    renderField({ target: PURCHASE });
    await screen.findByTestId('cost-line-existing');
    expect(mockFetchHousehold).toHaveBeenCalledWith('hi-1');
    expect(mockFetchWork).not.toHaveBeenCalled();
  });

  it('reports the picked line and null for "New line"', async () => {
    const user = userEvent.setup();
    renderField({
      value: { id: 'bl-a', type: 'work_item', description: 'Old estimate', gross: 238 },
    });
    const select = await screen.findByTestId('cost-line-existing');
    expect(select).toHaveValue('bl-a');
    await user.selectOptions(select, 'bl-b');
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'bl-b',
      type: 'work_item',
      description: null,
      gross: 119,
    });
    await user.selectOptions(select, '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('ignores a change while busy and marks the select invalid', async () => {
    const user = userEvent.setup();
    renderField({ busy: true, invalid: true, describedBy: 'hint' });
    const select = await screen.findByTestId('cost-line-existing');
    expect(select).toHaveAttribute('aria-disabled', 'true');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAttribute('aria-describedby', 'hint');
    await user.selectOptions(select, 'bl-a');
    expect(onChange).not.toHaveBeenCalled();
  });

  it("drops a pick that is not among the target's unlinked lines", async () => {
    renderField({ value: { id: 'other', type: 'work_item', description: 'x', gross: 1 } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
  });

  it('shows a load error when the lines cannot be loaded', async () => {
    mockFetchWork.mockRejectedValue(new Error('offline'));
    renderField();
    expect(await screen.findByText('The cost lines could not be loaded.')).toBeInTheDocument();
  });

  it('shows a skeleton again while a new target loads', async () => {
    const { rerender } = renderField();
    await screen.findByTestId('cost-line-existing');
    let release: (lines: never) => void = () => {};
    mockFetchHousehold.mockReturnValue(new Promise((resolve) => (release = resolve)) as never);
    rerender(
      <Field.CostLineExistingField
        id="existing"
        target={PURCHASE}
        value={null}
        onChange={onChange}
        busy={false}
        invalid={false}
        describedBy={undefined}
      />,
    );
    expect(screen.queryByTestId('cost-line-existing')).toBeNull();
    release([line('bl-h', 'Cover', 10)] as never);
    expect(await screen.findByRole('option', { name: /Cover/ })).toBeInTheDocument();
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolveLines: (lines: never) => void = () => {};
    mockFetchWork.mockReturnValue(new Promise((resolve) => (resolveLines = resolve)) as never);
    const first = renderField();
    first.unmount();
    resolveLines([] as never);

    let rejectLines: (error: Error) => void = () => {};
    mockFetchWork.mockReturnValue(
      new Promise((_resolve, reject) => (rejectLines = reject)) as never,
    );
    const second = renderField();
    second.unmount();
    rejectLines(new Error('late'));
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });
});
