/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntrySummary, WorkItemPageDetail } from '@cornerstone/shared';
import { makeTaskPage } from '../../test/taskPageFixtures.js';
import type * as PanelTypes from './TaskDiaryPanel.js';
import type { UseTaskDiaryResult } from './useTaskDiary.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));

let Panel: typeof PanelTypes;
const ORIGIN = { origin: { to: '/project/work-items/wi-1?tab=diary', name: 'Pour slab' } };

const entry = (id: string): DiaryEntrySummary =>
  ({
    id,
    entryType: 'daily_log',
    entryDate: '2026-03-01',
    title: `Log ${id}`,
    body: `Body ${id}`,
    status: 'saved',
    isAutomatic: false,
    photoCount: 0,
    thumbnails: [],
    metadata: null,
    sourceEntityType: null,
    sourceEntityId: null,
  }) as unknown as DiaryEntrySummary;

function diary(over: {
  items?: DiaryEntrySummary[] | null;
  totalItems?: number | null;
  scope?: UseTaskDiaryResult['primary']['scope'];
  other?: DiaryEntrySummary[] | null | undefined;
  failure?: UseTaskDiaryResult['failure'];
}): UseTaskDiaryResult {
  const items = over.items === undefined ? [] : over.items;
  return {
    primary: {
      items,
      totalItems: over.totalItems === undefined ? (items?.length ?? null) : over.totalItems,
      scope: over.scope ?? 'task',
    },
    other: over.other === undefined ? null : { items: over.other },
    failure: over.failure ?? null,
    reload: jest.fn(),
    count: items?.length ?? null,
  };
}

const COMPANY_TASK = makeTaskPage({
  startDate: '2026-03-02',
  endDate: '2026-03-06',
  projectedStartDate: '2026-03-02',
  projectedEndDate: '2026-03-06',
  assignedVendor: { id: 'v-1', name: 'Roofers Inc', trade: null, phone: null },
  area: { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] },
});

function renderPanel(value: UseTaskDiaryResult, task: WorkItemPageDetail = COMPANY_TASK) {
  return render(
    <MemoryRouter initialEntries={['/project/work-items/wi-1?tab=diary']}>
      <Panel.TaskDiaryPanel task={task} diary={value} originState={ORIGIN} />
    </MemoryRouter>,
  );
}

describe('TaskDiaryPanel', () => {
  beforeEach(async () => {
    if (!Panel) Panel = await import('./TaskDiaryPanel.js');
  });

  it('exports the panel as the default too', () => {
    expect(Panel.default).toBe(Panel.TaskDiaryPanel);
  });

  it('shows a loading skeleton with the Log for this task link before the first load', () => {
    renderPanel(diary({ items: null, totalItems: null }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByTestId('task-diary-log')).toBeInTheDocument();
    expect(screen.queryByTestId('task-diary')).toBeNull();
  });

  it('shows the load error with Try again, which reloads', () => {
    const value = diary({ items: null, failure: { kind: 'other' } });
    renderPanel(value);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(value.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('task-diary-log')).toBeInTheDocument();
  });

  it('translates an API failure code', () => {
    renderPanel(
      diary({ items: null, failure: { kind: 'api', code: 'INTERNAL_ERROR', notFound: false } }),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the empty state with a Log for this task action', () => {
    renderPanel(diary({ items: [], scope: 'none' }));
    expect(screen.queryByTestId('task-diary')).toBeNull();
    const links = screen.getAllByRole('link', { name: 'Log for this task' });
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it('Log for this task opens the capture screen (the page context adds area and company)', () => {
    renderPanel(diary({ items: [entry('e1')], scope: 'company' }));
    const href = screen.getByTestId('task-diary-log').getAttribute('href')!;
    expect(href).toBe('/diary/new');
  });

  it('titles the company block with the company name and counts the entries for screen readers', () => {
    renderPanel(diary({ items: [entry('e1'), entry('e2')], scope: 'company' }));
    const group = screen.getByTestId('task-diary');
    expect(group).toHaveTextContent('Roofers Inc');
    expect(group).toHaveTextContent('2 entries');
    expect(group).toHaveTextContent('Log e1');
  });

  it('titles the block for the task when the scope is the task area', () => {
    renderPanel(diary({ items: [entry('e1')], scope: 'task' }));
    expect(screen.getByTestId('task-diary')).not.toHaveTextContent('Roofers Inc');
  });

  it('shows no Show all when every entry is listed', () => {
    renderPanel(diary({ items: [entry('e1')], totalItems: 1, scope: 'company' }));
    expect(screen.queryByTestId('task-diary-show-all')).toBeNull();
  });

  it('Show all links to the Site diary filtered by company and the shown dates, with the origin', () => {
    renderPanel(diary({ items: [entry('e1')], totalItems: 25, scope: 'company' }));
    const link = screen.getByTestId('task-diary-show-all');
    const href = link.getAttribute('href')!;
    expect(href).toContain('companyId=v-1');
    expect(href).toContain('dateFrom=2026-03-02');
    expect(href).toContain('dateTo=2026-03-06');
    expect(href).not.toContain('areaId');
  });

  it('Show all filters by area for an area scope', () => {
    renderPanel(diary({ items: [entry('e1')], totalItems: 25, scope: 'task' }));
    const href = screen.getByTestId('task-diary-show-all').getAttribute('href')!;
    expect(href).toContain('areaId=a-1');
    expect(href).not.toContain('companyId');
  });

  it('Show all has no date filter and no area when the task has neither', () => {
    renderPanel(diary({ items: [entry('e1')], totalItems: 25, scope: 'task' }), makeTaskPage());
    const href = screen.getByTestId('task-diary-show-all').getAttribute('href')!;
    expect(href).not.toContain('dateFrom');
    expect(href).not.toContain('areaId');
  });

  it('shows no Show all while the total is not known', () => {
    renderPanel(diary({ items: [entry('e1')], totalItems: null }));
    expect(screen.queryByTestId('task-diary-show-all')).toBeNull();
  });

  describe('other entries (photo tags and dates)', () => {
    it('is hidden when block 2 does not apply or is still loading', () => {
      const { unmount } = renderPanel(diary({ items: [entry('e1')] }));
      expect(screen.queryByTestId('task-diary-other')).toBeNull();
      unmount();
      renderPanel(diary({ items: [entry('e1')], other: null }));
      expect(screen.queryByTestId('task-diary-other')).toBeNull();
    });

    it('is hidden when nothing is left after the de-dupe', () => {
      renderPanel(diary({ items: [entry('e1')], other: [] }));
      expect(screen.queryByTestId('task-diary-other')).toBeNull();
    });

    it('is a closed details with the hint and count, holding its own feed', () => {
      renderPanel(
        diary({ items: [entry('e1')], scope: 'company', other: [entry('o1'), entry('o2')] }),
      );
      const details = screen.getByTestId('task-diary-other') as HTMLDetailsElement;
      expect(details.tagName).toBe('DETAILS');
      expect(details.open).toBe(false);
      expect(details).toHaveTextContent('from photo tags and dates');
      expect(details).toHaveTextContent('(2)');
      const feed = screen.getByTestId('task-diary-other-feed');
      expect(details).toContainElement(feed);
      expect(feed).toHaveTextContent('Log o1');
      expect(screen.getByTestId('task-diary')).not.toHaveTextContent('Log o1');
    });

    it('shows the other entries even when the first block is empty', () => {
      renderPanel(diary({ items: [], scope: 'company', other: [entry('o1')] }));
      expect(screen.getByTestId('task-diary-other')).toBeInTheDocument();
    });
  });
});
