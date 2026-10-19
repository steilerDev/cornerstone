/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type {
  SearchResponse,
  SearchResultItem,
  SubsidyProgramListResponse,
} from '@cornerstone/shared';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as SubsidyApiTypes from '../../lib/subsidyProgramsApi.js';
import type * as FilterTypes from './HistoryObjectFilter.js';

const mockSearchEverywhere = jest.fn<typeof SearchApiTypes.searchEverywhere>();
const mockFetchSubsidyPrograms = jest.fn<typeof SubsidyApiTypes.fetchSubsidyPrograms>();

jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));
jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyPrograms: mockFetchSubsidyPrograms,
}));

let HistoryObjectFilter: typeof FilterTypes.HistoryObjectFilter;

beforeEach(async () => {
  mockSearchEverywhere.mockReset();
  mockFetchSubsidyPrograms.mockReset();
  if (!HistoryObjectFilter) ({ HistoryObjectFilter } = await import('./HistoryObjectFilter.js'));
});

function item(id: string, label: string | null, sublabel: string | null = null): SearchResultItem {
  return {
    id,
    label,
    sublabel,
    matchedField: 'title',
    status: null,
    kind: null,
    date: null,
    phone: null,
    areaPath: null,
    parent: null,
  } as SearchResultItem;
}

function searchResponse(groups: Record<string, SearchResultItem[]>): SearchResponse {
  return {
    query: 'q',
    groups: Object.entries(groups).map(([type, items]) => ({
      type: type as never,
      total: items.length,
      status: 'ok' as const,
      items,
    })),
  };
}

function grants(...names: string[]): SubsidyProgramListResponse {
  return {
    subsidyPrograms: names.map((name, i) => ({ id: `gr-${i + 1}`, name })),
  } as unknown as SubsidyProgramListResponse;
}

interface HostProps {
  initial?: FilterTypes.HistoryObjectValue | null;
  objectName?: string | null;
  objectExists?: boolean | null;
  onChangeSpy?: (o: FilterTypes.HistoryObjectValue | null) => void;
}

function Host({ initial = null, objectName = null, objectExists = null, onChangeSpy }: HostProps) {
  const [object, setObject] = useState(initial);
  return (
    <HistoryObjectFilter
      object={object}
      objectName={objectName}
      objectExists={objectExists}
      onChange={(next) => {
        setObject(next);
        onChangeSpy?.(next);
      }}
    />
  );
}

const chip = () => screen.getByTestId('history-object-object');
const searchInput = () => screen.getByLabelText('Find a task, invoice, grant or milestone');

async function openAndType(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(chip());
  await user.type(searchInput(), text);
}

describe('HistoryObjectFilter', () => {
  describe('chip and row', () => {
    it('shows the "Object" chip with the row hidden and the chip collapsed', () => {
      render(<Host />);
      expect(chip()).toHaveTextContent('Object');
      expect(chip()).toHaveAttribute('aria-expanded', 'false');
      expect(chip()).not.toHaveAttribute('aria-pressed');
      expect(searchInput().closest('[hidden]')).not.toBeNull();
    });

    it('opens the row and focuses the search input on click, and closes it again on a second click', async () => {
      const user = userEvent.setup();
      render(<Host />);
      await user.click(chip());
      expect(chip()).toHaveAttribute('aria-expanded', 'true');
      expect(searchInput().closest('[hidden]')).toBeNull();
      await waitFor(() => expect(searchInput()).toHaveFocus());

      await user.click(chip());
      expect(chip()).toHaveAttribute('aria-expanded', 'false');
      expect(searchInput().closest('[hidden]')).not.toBeNull();
    });

    it('Escape in the row closes it, returns focus to the chip and does not bubble', async () => {
      const user = userEvent.setup();
      const outer = jest.fn();
      document.addEventListener('keydown', outer);
      try {
        render(<Host />);
        await user.click(chip());
        await waitFor(() => expect(searchInput()).toHaveFocus());
        await user.keyboard('{Escape}');

        expect(chip()).toHaveAttribute('aria-expanded', 'false');
        await waitFor(() => expect(chip()).toHaveFocus());
        expect(outer).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener('keydown', outer);
      }
    });

    it('ignores other keys in the row', () => {
      render(<Host />);
      fireEvent.click(chip());
      fireEvent.keyDown(searchInput(), { key: 'a' });
      expect(chip()).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('search', () => {
    it('does not search below two characters', async () => {
      const user = userEvent.setup();
      render(<Host />);
      await openAndType(user, 'r');
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
      });
      expect(mockSearchEverywhere).not.toHaveBeenCalled();
      expect(mockFetchSubsidyPrograms).not.toHaveBeenCalled();
    });

    it('merges tasks, milestones, invoices and matching grants with their kind words', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(
        searchResponse({
          work_item: [item('wi-1', 'Roof tiling', 'In progress')],
          milestone: [item('ms-1', 'Roof closed')],
          invoice: [item('inv-1', 'T-001', 'Company A'), item('inv-2', null)],
        }),
      );
      mockFetchSubsidyPrograms.mockResolvedValue(grants('Roof bonus', 'Energy bonus'));
      render(<Host />);
      await openAndType(user, 'ro');

      const options = await screen.findAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual([
        'Roof tilingTask · In progress',
        'Roof closedMilestone',
        'T-001Invoice · Company A',
        '(no number)Invoice',
        'Roof bonusGrant',
      ]);
      expect(mockSearchEverywhere).toHaveBeenCalledWith(
        { q: 'ro', types: ['work_item', 'milestone', 'invoice'], limit: 8 },
        expect.any(AbortSignal),
      );
    });

    it('matches grants with umlaut folding', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(searchResponse({}));
      mockFetchSubsidyPrograms.mockResolvedValue(grants('Förderung A', 'Bonus B'));
      render(<Host />);
      await openAndType(user, 'foe');
      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Förderung A');
    });

    it('loads the grants once and reuses them for later searches', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(searchResponse({}));
      mockFetchSubsidyPrograms.mockResolvedValue(grants('Roof bonus'));
      render(<Host />);
      await openAndType(user, 'ro');
      await screen.findByRole('option');
      await user.type(searchInput(), 'o');
      await waitFor(() => expect(mockSearchEverywhere).toHaveBeenCalledTimes(2));
      expect(mockFetchSubsidyPrograms).toHaveBeenCalledTimes(1);
    });

    it('still lists tasks, milestones and invoices when the grants cannot be loaded', async () => {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(
        searchResponse({ work_item: [item('wi-1', 'Roof tiling')] }),
      );
      mockFetchSubsidyPrograms.mockRejectedValue(new Error('offline'));
      render(<Host />);
      await openAndType(user, 'ro');
      const options = await screen.findAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual(['Roof tilingTask']);
    });
  });

  it('retries the grants fetch on the next search after a failed one', async () => {
    const user = userEvent.setup();
    mockSearchEverywhere.mockResolvedValue(searchResponse({}));
    mockFetchSubsidyPrograms.mockRejectedValueOnce(new Error('offline'));
    mockFetchSubsidyPrograms.mockResolvedValueOnce(grants('Roof bonus'));
    render(<Host />);
    await openAndType(user, 'ro');
    await waitFor(() => expect(mockFetchSubsidyPrograms).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('option')).toBeNull();

    await user.type(searchInput(), 'o');

    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Roof bonusGrant']);
    expect(mockFetchSubsidyPrograms).toHaveBeenCalledTimes(2);
  });

  describe('select and clear', () => {
    async function pick(text: string, response: SearchResponse, spy: jest.Mock) {
      const user = userEvent.setup();
      mockSearchEverywhere.mockResolvedValue(response);
      mockFetchSubsidyPrograms.mockResolvedValue(grants());
      render(<Host onChangeSpy={spy} />);
      await openAndType(user, text);
      return { user, options: await screen.findAllByRole('option') };
    }

    it('selecting a task reports it, closes the row, focuses the chip and names the chip', async () => {
      const spy = jest.fn();
      const { user, options } = await pick(
        'ro',
        searchResponse({ work_item: [item('wi-1', 'Roof tiling')] }),
        spy,
      );
      await user.click(options[0]!);

      expect(spy).toHaveBeenCalledWith({ entityType: 'work_item', entityId: 'wi-1' });
      expect(chip()).toHaveTextContent('Object · Roof tiling');
      expect(chip()).toHaveAttribute('aria-pressed', 'true');
      expect(chip()).toHaveAttribute('aria-expanded', 'false');
      await waitFor(() => expect(chip()).toHaveFocus());
    });

    it('names an invoice chip with the word "Invoice" and the number', async () => {
      const spy = jest.fn();
      const { user, options } = await pick(
        'T-',
        searchResponse({ invoice: [item('inv-1', 'T-001')] }),
        spy,
      );
      await user.click(options[0]!);
      expect(spy).toHaveBeenCalledWith({ entityType: 'invoice', entityId: 'inv-1' });
      expect(chip()).toHaveTextContent('Object · Invoice T-001');
    });

    it('keeps an id that contains a colon intact', async () => {
      const spy = jest.fn();
      const { user, options } = await pick(
        'ro',
        searchResponse({ milestone: [item('a:b', 'Roof closed')] }),
        spy,
      );
      await user.click(options[0]!);
      expect(spy).toHaveBeenCalledWith({ entityType: 'milestone', entityId: 'a:b' });
    });

    it('clearing the selection reports null and keeps the row open', async () => {
      const spy = jest.fn();
      const { user, options } = await pick(
        'ro',
        searchResponse({ work_item: [item('wi-1', 'Roof tiling')] }),
        spy,
      );
      await user.click(options[0]!);
      await user.click(chip());
      await user.click(screen.getByRole('button', { name: 'Clear selection' }));

      expect(spy).toHaveBeenLastCalledWith(null);
      expect(chip()).toHaveTextContent(/^Object$/);
      expect(chip()).not.toHaveAttribute('aria-pressed');
    });
  });

  describe('chip label from the URL state', () => {
    const task = { entityType: 'work_item', entityId: 'wi-1' } as const;

    it('shows the live name echoed by the API', () => {
      render(<Host initial={task} objectName="Roof tiling" objectExists />);
      expect(chip()).toHaveTextContent('Object · Roof tiling');
      expect(chip()).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Roof tiling')).toBeInTheDocument();
    });

    it('prefixes an invoice number with the word Invoice', () => {
      render(
        <Host
          initial={{ entityType: 'invoice', entityId: 'inv-1' }}
          objectName="T-001"
          objectExists
        />,
      );
      expect(chip()).toHaveTextContent('Object · Invoice T-001');
    });

    it.each([
      ['work_item', 'Task'],
      ['invoice', 'Invoice'],
      ['milestone', 'Milestone'],
      ['subsidy_program', 'Grant'],
    ] as const)('falls back to the kind word %s while no name is known', (entityType, word) => {
      render(<Host initial={{ entityType, entityId: 'x-1' }} objectName={null} />);
      expect(chip()).toHaveTextContent(`Object · ${word}`);
    });

    it('says "No longer exists" for a deleted object', () => {
      render(<Host initial={task} objectName={null} objectExists={false} />);
      expect(chip()).toHaveTextContent('Object · No longer exists');
    });

    it('shows no "No longer exists" without an object even when existence is false', () => {
      render(<Host objectExists={false} />);
      expect(chip()).toHaveTextContent(/^Object$/);
    });
  });

  it('labels the chip group', () => {
    render(<Host />);
    expect(
      within(screen.getByTestId('history-object-filter')).getByRole('group'),
    ).toHaveAccessibleName('Object');
  });
});
