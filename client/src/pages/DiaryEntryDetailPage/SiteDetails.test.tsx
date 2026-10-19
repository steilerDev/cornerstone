/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import type { DiaryEntryDetail } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { SiteDetails } from './SiteDetails.js';

function makeEntry(over: Partial<DiaryEntryDetail> = {}): DiaryEntryDetail {
  return {
    id: 'e1',
    entryType: 'daily_log',
    entryDate: '2026-10-12',
    title: 'Entry A',
    body: '',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'saved',
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: null,
    createdAt: '2026-10-12T09:00:00.000Z',
    updatedAt: '2026-10-12T09:00:00.000Z',
    ...over,
  };
}

function setup(entry: DiaryEntryDetail, statusControl?: React.ReactNode) {
  return render(
    <LocaleProvider>
      <SiteDetails entry={entry} statusControl={statusControl} />
    </LocaleProvider>,
  );
}

/** The value text of a row, found through its label. */
function valueOf(label: string): string | null {
  const term = screen.queryByText(label, { selector: 'dt' });
  return term?.nextElementSibling?.textContent ?? null;
}

const labels = () => screen.queryAllByRole('term').map((dt) => dt.textContent);

describe('SiteDetails: presence', () => {
  it('renders nothing when no field is set', () => {
    const { container } = setup(makeEntry({ metadata: null }));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty metadata object', () => {
    const { container } = setup(makeEntry({ metadata: {} }));
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['general_note', 'work_item_status'] as const)(
    'renders nothing for a %s entry whatever its metadata',
    (entryType) => {
      const { container } = setup(makeEntry({ entryType, metadata: { vendor: 'Company A' } }));
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('is a labelled section with an h2 and a definition list', () => {
    setup(makeEntry({ metadata: { weather: 'sunny' } }));
    const section = screen.getByTestId('diary-entry-site-details');
    expect(section.tagName).toBe('SECTION');
    expect(within(section).getByRole('heading', { level: 2, name: 'Site details' })).toBeVisible();
    expect(section).toHaveAttribute('aria-labelledby', 'diary-site-details-heading');
    expect(section.querySelector('dl')).not.toBeNull();
  });
});

describe('SiteDetails: daily log', () => {
  it('keeps the daily-log-metadata test id on the list', () => {
    setup(makeEntry({ metadata: { weather: 'sunny' } }));
    expect(screen.getByTestId('daily-log-metadata').tagName).toBe('DL');
  });

  it('shows weather, temperature, workers, company, times and duration in that order', () => {
    setup(
      makeEntry({
        metadata: {
          weather: 'rainy',
          temperatureCelsius: 7,
          workersOnSite: 4,
          vendorName: 'Company A',
          workStart: '08:00',
          workEnd: '16:30',
        },
      }),
    );
    expect(labels()).toEqual([
      'Weather',
      'Temperature',
      'Workers',
      'Company',
      'Start',
      'End',
      'Duration',
    ]);
    expect(valueOf('Weather')).toBe('Rainy');
    expect(valueOf('Temperature')).toBe('7 °C');
    expect(valueOf('Workers')).toBe('4 workers');
    expect(valueOf('Company')).toBe('Company A');
    expect(valueOf('Start')).toMatch(/8:00/);
    expect(valueOf('End')).toMatch(/4:30/);
    expect(valueOf('Duration')).toMatch(/8\.5/);
  });

  it('shows a temperature of zero', () => {
    setup(makeEntry({ metadata: { temperatureCelsius: 0 } }));
    expect(valueOf('Temperature')).toBe('0 °C');
  });

  it('shows one worker in the singular', () => {
    setup(makeEntry({ metadata: { workersOnSite: 1 } }));
    expect(valueOf('Workers')).toBe('1 worker');
  });

  it.each([[0], [null], [2.5], [-3], ['3']])('hides the worker count for %s', (workers) => {
    setup(makeEntry({ metadata: { workersOnSite: workers, weather: 'sunny' } }));
    expect(labels()).not.toContain('Workers');
  });

  it('shows only the fields that are set', () => {
    setup(makeEntry({ metadata: { vendorName: 'Company A' } }));
    expect(labels()).toEqual(['Company']);
  });

  it('shows a start without an end and no duration', () => {
    setup(makeEntry({ metadata: { workStart: '08:00' } }));
    expect(labels()).toEqual(['Start']);
  });

  it('shows an end without a start and no duration', () => {
    setup(makeEntry({ metadata: { workEnd: '16:00' } }));
    expect(labels()).toEqual(['End']);
  });

  it('shows no duration when the end is not after the start', () => {
    setup(makeEntry({ metadata: { workStart: '16:00', workEnd: '08:00' } }));
    expect(labels()).toEqual(['Start', 'End']);
  });
});

describe('SiteDetails: site visit', () => {
  it('shows the inspector, the outcome chip and the times', () => {
    setup(
      makeEntry({
        entryType: 'site_visit',
        metadata: {
          inspectorName: 'Inspector A',
          outcome: 'conditional',
          workStart: '09:00',
          workEnd: '10:00',
        },
      }),
    );
    expect(screen.getByTestId('site-visit-metadata')).toBeInTheDocument();
    expect(labels()).toEqual(['Inspector', 'Outcome', 'Start', 'End', 'Duration']);
    expect(valueOf('Inspector')).toBe('Inspector A');
    expect(screen.getByTestId('outcome-conditional')).toHaveTextContent('Conditional');
    expect(valueOf('Duration')).toMatch(/1/);
  });

  it.each([
    ['pass', 'Pass'],
    ['fail', 'Fail'],
  ])('renders the %s outcome chip as "%s"', (outcome, text) => {
    setup(makeEntry({ entryType: 'site_visit', metadata: { outcome } }));
    expect(screen.getByTestId(`outcome-${outcome}`)).toHaveTextContent(text);
  });

  it('omits the outcome row without an outcome', () => {
    setup(makeEntry({ entryType: 'site_visit', metadata: { inspectorName: 'Inspector A' } }));
    expect(labels()).toEqual(['Inspector']);
  });
});

describe('SiteDetails: delivery', () => {
  it('shows the company and the materials as a list', () => {
    setup(
      makeEntry({
        entryType: 'delivery',
        metadata: { vendor: 'Company B', materials: ['Bricks', 'Sand'] },
      }),
    );
    expect(screen.getByTestId('delivery-metadata')).toBeInTheDocument();
    expect(labels()).toEqual(['Company', 'Materials']);
    expect(valueOf('Company')).toBe('Company B');
    const materials = within(screen.getByTestId('delivery-metadata')).getAllByRole('listitem');
    expect(materials.map((li) => li.textContent)).toEqual(['Bricks', 'Sand']);
  });

  it('keeps repeated materials as separate items', () => {
    setup(makeEntry({ entryType: 'delivery', metadata: { materials: ['Sand', 'Sand'] } }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('omits the materials row for an empty list', () => {
    setup(makeEntry({ entryType: 'delivery', metadata: { vendor: 'Company B', materials: [] } }));
    expect(labels()).toEqual(['Company']);
  });

  it('renders nothing when a delivery has neither company nor materials', () => {
    const { container } = setup(makeEntry({ entryType: 'delivery', metadata: { materials: [] } }));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SiteDetails: issue', () => {
  it('shows the severity chip and the defect status control', () => {
    setup(
      makeEntry({ entryType: 'issue', metadata: { severity: 'high' } }),
      <span data-testid="status-control">Open</span>,
    );
    expect(screen.getByTestId('issue-metadata')).toBeInTheDocument();
    expect(labels()).toEqual(['Severity', 'Status']);
    expect(screen.getByTestId('severity-high')).toHaveTextContent('High');
    expect(screen.getByText('Status', { selector: 'dt' }).nextElementSibling).toContainElement(
      screen.getByTestId('status-control'),
    );
  });

  it.each(['low', 'medium', 'critical'] as const)('renders the %s severity chip', (severity) => {
    setup(makeEntry({ entryType: 'issue', metadata: { severity } }));
    expect(screen.getByTestId(`severity-${severity}`)).toBeInTheDocument();
  });

  it('shows the status control alone when there is no severity', () => {
    setup(makeEntry({ entryType: 'issue', metadata: {} }), <span>Open</span>);
    expect(labels()).toEqual(['Status']);
  });

  it('renders nothing without severity and without a status control', () => {
    const { container } = setup(makeEntry({ entryType: 'issue', metadata: {} }));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows no Status row for other entry types even if a control is passed', () => {
    setup(makeEntry({ metadata: { weather: 'sunny' } }), <span>Open</span>);
    expect(labels()).toEqual(['Weather']);
  });
});
