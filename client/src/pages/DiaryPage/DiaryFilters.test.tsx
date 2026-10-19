/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { MANUAL_DIARY_ENTRY_TYPES } from '@cornerstone/shared';
import type { DiaryFilterOptions } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { DiaryActiveFilters, DiaryFilters } from './DiaryFilters.js';
import { EMPTY_DIARY_FILTERS } from './diaryQuery.js';
import type { DiaryFilterState } from './diaryQuery.js';

const WIDE = '(min-width: 768px)';

const OPTIONS: DiaryFilterOptions = {
  types: ['daily_log', 'delivery'],
  areas: [
    {
      id: 'area-1',
      name: 'Room 1',
      color: null,
      ancestors: [{ id: 'area-0', name: 'Area A', color: null }],
    },
    { id: 'area-2', name: 'Area B', color: null, ancestors: [] },
  ],
  companies: [
    { id: 'company-1', name: 'Company A' },
    { id: 'company-2', name: 'Company B' },
  ],
};

let media: MatchMediaControl;

beforeEach(() => {
  media = installMatchMedia({ [WIDE]: true });
});

afterEach(() => {
  media.restore();
});

interface HostProps {
  initial?: Partial<DiaryFilterState>;
  options?: DiaryFilterOptions | null;
  onChangeSpy?: (patch: Partial<DiaryFilterState>) => void;
  onClearSpy?: () => void;
}

/** Holds the filter state like DiaryPage does, so chips and fields react to each other. */
function Host({ initial = {}, options = OPTIONS, onChangeSpy, onClearSpy }: HostProps) {
  const [state, setState] = useState<DiaryFilterState>({ ...EMPTY_DIARY_FILTERS, ...initial });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const onChange = (patch: Partial<DiaryFilterState>) => {
    onChangeSpy?.(patch);
    setState((prev) => ({ ...prev, ...patch }));
  };
  const onClearAll = () => {
    onClearSpy?.();
    setState(EMPTY_DIARY_FILTERS);
  };
  return (
    <div>
      <button type="button" data-testid="go-elsewhere" onClick={() => navigate('/elsewhere')}>
        go
      </button>
      <DiaryFilters
        state={state}
        onChange={onChange}
        onClearAll={onClearAll}
        options={options}
        buttonRef={buttonRef}
      />
      <DiaryActiveFilters
        state={state}
        options={options}
        onChange={onChange}
        onClearAll={onClearAll}
        buttonRef={buttonRef}
      />
      <output data-testid="state">{JSON.stringify(state)}</output>
    </div>
  );
}

function setup(props: HostProps = {}) {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={['/diary']}>
        <Host {...props} />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

const button = () => screen.getByTestId('diary-filters-button');
const currentState = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}');
const panel = () => screen.getByTestId('diary-filters-panel');

async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button());
}

describe('DiaryFilters: button', () => {
  it('shows "Filters" without a count or custom name when nothing is active', () => {
    setup();
    expect(button()).toHaveTextContent('Filters');
    expect(button()).not.toHaveAttribute('aria-label');
    expect(button()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button()).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the active count and names it for screen readers', () => {
    setup({ initial: { types: ['issue'], areaId: 'area-1', dateFrom: '2026-10-01' } });
    expect(button()).toHaveAttribute('aria-label', 'Filters, 3 active');
    expect(button()).toHaveTextContent('3');
  });

  it('does not count the search text', () => {
    setup({ initial: { q: 'slab' } });
    expect(button()).not.toHaveAttribute('aria-label');
  });

  it('controls the panel from 768px and the sheet below', () => {
    const { unmount } = setup();
    expect(button()).toHaveAttribute('aria-controls', 'diary-filters-panel');
    unmount();
    media.set(WIDE, false);
    setup();
    expect(button()).toHaveAttribute('aria-controls', 'diary-filters-sheet');
  });
});

describe('DiaryFilters: containers', () => {
  it('opens an anchored dialog panel from 768px, not a sheet', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByTestId('diary-filters-panel')).toBeNull();
    await openFilters(user);
    expect(panel()).toHaveAttribute('role', 'dialog');
    expect(panel()).toHaveAccessibleName('Filters');
    expect(button()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByTestId('diary-filters-sheet')).toBeNull();
  });

  it('moves focus to the first control of the panel on open', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    await waitFor(() => expect(panel().contains(document.activeElement)).toBe(true));
  });

  it('closes the panel on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('diary-filters-panel')).toBeNull());
    expect(button()).toHaveFocus();
  });

  it('closes the panel on a press outside', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    fireEvent.mouseDown(screen.getByTestId('state'));
    await waitFor(() => expect(screen.queryByTestId('diary-filters-panel')).toBeNull());
  });

  it('closes the panel when the route changes', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    await user.click(screen.getByTestId('go-elsewhere'));
    await waitFor(() => expect(screen.queryByTestId('diary-filters-panel')).toBeNull());
  });

  it('toggles the panel with the button', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    await user.click(button());
    await waitFor(() => expect(screen.queryByTestId('diary-filters-panel')).toBeNull());
  });

  it('opens a bottom sheet below 768px with Clear all and Done in the footer', async () => {
    media.set(WIDE, false);
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    const sheet = screen.getByTestId('diary-filters-sheet');
    expect(within(sheet).getByTestId('diary-filters-content')).toBeInTheDocument();
    expect(within(sheet).getByTestId('diary-filters-sheet-clear')).toHaveTextContent('Clear all');
    expect(within(sheet).getByTestId('diary-filters-done')).toHaveTextContent('Done');
    expect(screen.queryByTestId('diary-filters-panel')).toBeNull();
  });

  it('Done only closes the sheet and returns focus to the button', async () => {
    media.set(WIDE, false);
    const user = userEvent.setup();
    const onClear = jest.fn();
    setup({ initial: { types: ['issue'] }, onClearSpy: onClear });
    await openFilters(user);
    await user.click(screen.getByTestId('diary-filters-done'));
    await waitFor(() =>
      expect(screen.getByTestId('diary-filters-sheet')).toHaveAttribute('data-open', 'false'),
    );
    expect(button()).toHaveFocus();
    expect(onClear).not.toHaveBeenCalled();
    expect(currentState().types).toEqual(['issue']);
  });

  it('Clear all in the sheet footer clears every filter', async () => {
    media.set(WIDE, false);
    const user = userEvent.setup();
    const onClear = jest.fn();
    setup({ initial: { types: ['issue'], areaId: 'area-1' }, onClearSpy: onClear });
    await openFilters(user);
    await user.click(screen.getByTestId('diary-filters-sheet-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(currentState()).toEqual(EMPTY_DIARY_FILTERS);
  });
});

describe('DiaryFilters: type chips', () => {
  it('offers only the types in use', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    expect(screen.getByTestId('type-filter-daily_log')).toHaveTextContent('Daily log');
    expect(screen.getByTestId('type-filter-delivery')).toHaveTextContent('Delivery');
    expect(screen.queryByTestId('type-filter-issue')).toBeNull();
    expect(screen.queryByTestId('type-filter-site_visit')).toBeNull();
  });

  it('keeps a type that is still active in the URL so it can be removed', async () => {
    const user = userEvent.setup();
    setup({ initial: { types: ['issue'] } });
    await openFilters(user);
    expect(screen.getByTestId('type-filter-issue')).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the Type field when at most one type is in use and none is active', async () => {
    const user = userEvent.setup();
    setup({ options: { ...OPTIONS, types: ['daily_log'] } });
    await openFilters(user);
    expect(screen.queryByTestId('type-filter-daily_log')).toBeNull();
    expect(screen.queryByText('Type')).toBeNull();
  });

  it('hides the Type field when no type is in use', async () => {
    const user = userEvent.setup();
    setup({ options: { ...OPTIONS, types: [] } });
    await openFilters(user);
    expect(screen.queryByText('Type')).toBeNull();
  });

  it('offers every manual type while the options are not loaded', async () => {
    const user = userEvent.setup();
    setup({ options: null });
    await openFilters(user);
    for (const type of MANUAL_DIARY_ENTRY_TYPES) {
      expect(screen.getByTestId(`type-filter-${type}`)).toBeInTheDocument();
    }
  });

  it('selects several types and deselects one again', async () => {
    const user = userEvent.setup();
    const spy = jest.fn();
    setup({ onChangeSpy: spy });
    await openFilters(user);
    await user.click(screen.getByTestId('type-filter-daily_log'));
    await user.click(screen.getByTestId('type-filter-delivery'));
    expect(currentState().types).toEqual(['daily_log', 'delivery']);
    expect(screen.getByTestId('type-filter-daily_log')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('type-filter-delivery')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('type-filter-daily_log'));
    expect(currentState().types).toEqual(['delivery']);
    expect(spy).toHaveBeenLastCalledWith({ types: ['delivery'] });
  });
});

describe('DiaryFilters: Area and Company pickers', () => {
  it('lists the areas with their path on focus and writes areaId on pick', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    const field = screen.getByTestId('diary-filter-area');
    expect(within(field).getByLabelText('Area')).toBeInTheDocument();
    await user.click(within(field).getByLabelText('Area'));
    expect(await screen.findByTestId('diary-filter-area-option-area-1')).toHaveTextContent(
      'Room 1',
    );
    expect(screen.getByTestId('diary-filter-area-option-area-1')).toHaveTextContent(
      'Area A › Room 1',
    );
    await user.click(screen.getByTestId('diary-filter-area-option-area-1'));
    expect(currentState().areaId).toBe('area-1');
  });

  it('keeps the panel open after picking an area (the dropdown is portaled outside it)', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    await user.click(screen.getByLabelText('Area'));
    await user.click(await screen.findByTestId('diary-filter-area-option-area-2'));
    expect(currentState().areaId).toBe('area-2');
    expect(screen.getByTestId('diary-filters-panel')).toBeInTheDocument();
  });

  it('narrows the areas by the typed path, ignoring case and diacritics', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    await user.type(screen.getByLabelText('Area'), 'AREA a');
    expect(await screen.findByTestId('diary-filter-area-option-area-1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('diary-filter-area-option-area-2')).toBeNull());
  });

  it('shows the selected area name and clears it', async () => {
    const user = userEvent.setup();
    setup({ initial: { areaId: 'area-2' } });
    await openFilters(user);
    const field = screen.getByTestId('diary-filter-area');
    expect(field).toHaveTextContent('Area B');
    await user.click(within(field).getByRole('button', { name: /clear/i }));
    expect(currentState().areaId).toBe('');
  });

  it('picks a company and writes companyId', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    const field = screen.getByTestId('diary-filter-company');
    expect(within(field).getByLabelText('Company')).toBeInTheDocument();
    await user.click(within(field).getByLabelText('Company'));
    await user.click(await screen.findByTestId('diary-filter-company-option-company-2'));
    expect(currentState().companyId).toBe('company-2');
  });

  it('narrows the companies by the typed name', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    await user.type(screen.getByLabelText('Company'), 'b');
    expect(await screen.findByTestId('diary-filter-company-option-company-2')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('diary-filter-company-option-company-1')).toBeNull(),
    );
  });

  it('clears a selected company', async () => {
    const user = userEvent.setup();
    setup({ initial: { companyId: 'company-1' } });
    await openFilters(user);
    const field = screen.getByTestId('diary-filter-company');
    expect(field).toHaveTextContent('Company A');
    await user.click(within(field).getByRole('button', { name: /clear/i }));
    expect(currentState().companyId).toBe('');
  });

  it('hides Area and Company when the options hold none and nothing is set', async () => {
    const user = userEvent.setup();
    setup({ options: { types: [], areas: [], companies: [] } });
    await openFilters(user);
    expect(screen.queryByTestId('diary-filter-area')).toBeNull();
    expect(screen.queryByTestId('diary-filter-company')).toBeNull();
  });

  it('hides Area and Company when the options failed to load', async () => {
    const user = userEvent.setup();
    setup({ options: null });
    await openFilters(user);
    expect(screen.queryByTestId('diary-filter-area')).toBeNull();
    expect(screen.queryByTestId('diary-filter-company')).toBeNull();
  });

  it('still shows the pickers when a value is set but the options are gone', async () => {
    const user = userEvent.setup();
    setup({ options: null, initial: { areaId: 'area-9', companyId: 'company-9' } });
    await openFilters(user);
    expect(screen.getByTestId('diary-filter-area')).toBeInTheDocument();
    expect(screen.getByTestId('diary-filter-company')).toBeInTheDocument();
  });
});

describe('DiaryFilters: dates', () => {
  it('writes a valid From and To to the state', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByTestId('diary-date-to'), { target: { value: '2026-10-31' } });
    expect(currentState().dateFrom).toBe('2026-10-01');
    expect(currentState().dateTo).toBe('2026-10-31');
    expect(screen.queryByText('The start date must be before the end date.')).toBeNull();
  });

  it('accepts equal dates', async () => {
    const user = userEvent.setup();
    setup({ initial: { dateTo: '2026-10-10' } });
    await openFilters(user);
    fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-10-10' } });
    expect(currentState().dateFrom).toBe('2026-10-10');
  });

  it('shows the range error and writes nothing when From is after To', async () => {
    const user = userEvent.setup();
    const spy = jest.fn();
    setup({ initial: { dateTo: '2026-10-10' }, onChangeSpy: spy });
    await openFilters(user);
    fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-10-20' } });
    expect(await screen.findByText('The start date must be before the end date.')).toBeVisible();
    expect(spy).not.toHaveBeenCalled();
    expect(currentState().dateFrom).toBe('');
    expect(screen.getByTestId('diary-date-from')).toHaveValue('2026-10-20');
    for (const id of ['diary-date-from', 'diary-date-to']) {
      expect(screen.getByTestId(id)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId(id).getAttribute('aria-describedby')).toBeTruthy();
    }
  });

  it('shows the range error and writes nothing when To is before From', async () => {
    const user = userEvent.setup();
    const spy = jest.fn();
    setup({ initial: { dateFrom: '2026-10-10' }, onChangeSpy: spy });
    await openFilters(user);
    fireEvent.change(screen.getByTestId('diary-date-to'), { target: { value: '2026-10-01' } });
    expect(await screen.findByText('The start date must be before the end date.')).toBeVisible();
    expect(spy).not.toHaveBeenCalled();
  });

  it('removes the error and writes the date once the range is valid again', async () => {
    const user = userEvent.setup();
    setup({ initial: { dateTo: '2026-10-10' } });
    await openFilters(user);
    fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-10-20' } });
    await screen.findByText('The start date must be before the end date.');
    fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-10-05' } });
    expect(screen.queryByText('The start date must be before the end date.')).toBeNull();
    expect(currentState().dateFrom).toBe('2026-10-05');
    expect(screen.getByTestId('diary-date-from')).not.toHaveAttribute('aria-invalid');
  });

  it('clearing a side always writes, even next to another date', async () => {
    const user = userEvent.setup();
    setup({ initial: { dateFrom: '2026-10-01', dateTo: '2026-10-10' } });
    await openFilters(user);
    fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('diary-date-to'), { target: { value: '' } });
    expect(currentState().dateFrom).toBe('');
    expect(currentState().dateTo).toBe('');
  });

  it('follows the URL when the dates change from outside (chip removal, Clear all)', async () => {
    // The sheet keeps its content mounted, so the draft values must follow the state.
    media.set(WIDE, false);
    const user = userEvent.setup();
    setup({ initial: { dateFrom: '2026-10-01', dateTo: '2026-10-10' } });
    await openFilters(user);
    expect(screen.getByTestId('diary-date-from')).toHaveValue('2026-10-01');
    await user.click(screen.getByTestId('diary-active-filter-from-remove'));
    expect(screen.getByTestId('diary-date-from')).toHaveValue('');
    await user.click(screen.getByTestId('clear-filters-button'));
    expect(screen.getByTestId('diary-date-to')).toHaveValue('');
  });

  it('groups the dates in a labelled fieldset', async () => {
    const user = userEvent.setup();
    setup();
    await openFilters(user);
    const group = screen.getByRole('group', { name: 'Dates' });
    expect(within(group).getByLabelText('From')).toBe(screen.getByTestId('diary-date-from'));
    expect(within(group).getByLabelText('To')).toBe(screen.getByTestId('diary-date-to'));
  });
});

describe('DiaryActiveFilters', () => {
  it('renders nothing without active filters, and nothing for the search text alone', () => {
    setup({ initial: { q: 'slab' } });
    expect(screen.queryByTestId('diary-active-filters')).toBeNull();
  });

  it('shows one chip per filter with its name, in a labelled list', () => {
    setup({
      initial: {
        types: ['daily_log', 'issue'],
        areaId: 'area-2',
        companyId: 'company-1',
        dateFrom: '2026-10-01',
        dateTo: '2026-10-31',
        drafts: true,
      },
    });
    const list = screen.getByRole('list', { name: 'Active filters' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.textContent?.replace('×', ''))).toEqual([
      'Daily log',
      'Defect',
      'Area B',
      'Company A',
      expect.stringMatching(/^From .*2026/),
      expect.stringMatching(/^To .*2026/),
      'Unfinished',
    ]);
  });

  it('falls back to the field name when the option is not loaded', () => {
    setup({ options: null, initial: { areaId: 'area-9', companyId: 'company-9' } });
    const list = screen.getByRole('list', { name: 'Active filters' });
    expect(list).toHaveTextContent('Area');
    expect(list).toHaveTextContent('Company');
  });

  it('names each remove button after its chip', () => {
    setup({ initial: { types: ['daily_log'] } });
    expect(screen.getByRole('button', { name: 'Remove filter Daily log' })).toBe(
      screen.getByTestId('diary-active-filter-type-daily_log-remove'),
    );
  });

  it('removes one type chip and leaves the others', async () => {
    const user = userEvent.setup();
    setup({ initial: { types: ['daily_log', 'issue'] } });
    await user.click(screen.getByTestId('diary-active-filter-type-daily_log-remove'));
    expect(currentState().types).toEqual(['issue']);
  });

  it.each([
    ['area', { areaId: 'area-1' }, 'areaId'],
    ['company', { companyId: 'company-1' }, 'companyId'],
    ['from', { dateFrom: '2026-10-01' }, 'dateFrom'],
    ['to', { dateTo: '2026-10-01' }, 'dateTo'],
  ])('removes the %s chip', async (key, initial, field) => {
    const user = userEvent.setup();
    setup({ initial });
    await user.click(screen.getByTestId(`diary-active-filter-${key}-remove`));
    expect(currentState()[field]).toBe('');
    expect(screen.queryByTestId('diary-active-filters')).toBeNull();
  });

  it('removes the Unfinished chip', async () => {
    const user = userEvent.setup();
    setup({ initial: { drafts: true } });
    await user.click(screen.getByTestId('diary-active-filter-drafts-remove'));
    expect(currentState().drafts).toBe(false);
  });

  describe('focus after removal', () => {
    it('moves to the next chip remove button', async () => {
      const user = userEvent.setup();
      setup({ initial: { types: ['daily_log', 'issue', 'delivery'] } });
      await user.click(screen.getByTestId('diary-active-filter-type-daily_log-remove'));
      expect(screen.getByTestId('diary-active-filter-type-issue-remove')).toHaveFocus();
    });

    it('moves to the previous chip when the last one is removed', async () => {
      const user = userEvent.setup();
      setup({ initial: { types: ['daily_log', 'issue'] } });
      await user.click(screen.getByTestId('diary-active-filter-type-issue-remove'));
      expect(screen.getByTestId('diary-active-filter-type-daily_log-remove')).toHaveFocus();
    });

    it('moves to the Filters button when the only chip is removed', async () => {
      const user = userEvent.setup();
      setup({ initial: { areaId: 'area-1' } });
      await user.click(screen.getByTestId('diary-active-filter-area-remove'));
      expect(button()).toHaveFocus();
    });
  });

  it('Clear all clears every filter and focuses the Filters button', async () => {
    const user = userEvent.setup();
    const onClear = jest.fn();
    setup({ initial: { types: ['issue'], areaId: 'area-1' }, onClearSpy: onClear });
    await user.click(screen.getByTestId('clear-filters-button'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(currentState()).toEqual(EMPTY_DIARY_FILTERS);
    expect(button()).toHaveFocus();
    expect(screen.queryByTestId('diary-active-filters')).toBeNull();
  });
});
