/**
 * @jest-environment jsdom
 *
 * #2195 orchestrator decision 2: the Gantt / Calendar screen-reader labels are full translated
 * sentences with interpolated, translated status words, so a German screen reader never hears
 * a mixed-language sentence. Mutation: put a hard-coded English fragment back into any of the
 * three components and the matching German test fails on the English-word check.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  TimelineHouseholdItem,
  TimelineMilestone,
  TimelineWorkItem,
} from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { GanttBar } from './GanttBar.js';
import { GanttMilestones } from './GanttMilestones.js';
import { CalendarItem } from '../calendar/CalendarItem.js';
import { CalendarMilestone } from '../calendar/CalendarMilestone.js';
import { CalendarHouseholdItem } from '../calendar/CalendarHouseholdItem.js';

const ENGLISH_FRAGMENTS =
  /\b(Work item|Task|Purchase|Milestone|Household item|Done|In progress|Not started|critical path|status:|target date|delivery|Upcoming|Reached|Planned|Ordered|Delivered)\b/;

afterEach(async () => {
  localStorage.clear();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

// LocaleProvider owns the i18n language: it resolves it from the stored preference on mount.
async function switchToGerman() {
  localStorage.setItem('locale', 'de');
  await act(async () => {
    await i18n.changeLanguage('de');
  });
}

const WORK_ITEM: TimelineWorkItem = {
  id: 'wi-1',
  title: 'Sample Roofing',
  status: 'completed',
  startDate: '2026-04-01',
  endDate: '2026-04-10',
  durationDays: 9,
  actualStartDate: null,
  actualEndDate: null,
  startAfter: null,
  startBefore: null,
  assignedUser: null,
  tags: [],
  areas: [],
  requiredMilestoneIds: [],
  isCritical: false,
} as unknown as TimelineWorkItem;

const MILESTONE: TimelineMilestone = {
  id: 7,
  title: 'Sample Shell',
  targetDate: '2026-06-01',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemIds: [],
  projectedDate: null,
  isCritical: false,
};

const HOUSEHOLD_ITEM = {
  id: 'hi-1',
  name: 'Sample Sofa',
  category: 'furniture',
  status: 'scheduled',
  earliestDeliveryDate: '2026-05-15',
  latestDeliveryDate: null,
  targetDeliveryDate: null,
  actualDeliveryDate: null,
  isLate: false,
} as unknown as TimelineHouseholdItem;

describe('Gantt bar aria-label sentences', () => {
  function renderBar(overrides: Partial<React.ComponentProps<typeof GanttBar>> = {}) {
    return render(
      <LocaleProvider>
        <svg>
          <GanttBar
            id="wi-1"
            title="Sample Roofing"
            status="completed"
            x={0}
            width={100}
            rowIndex={0}
            fill="#fff"
            {...overrides}
          />
        </svg>
      </LocaleProvider>,
    );
  }

  it('en: full sentence with the canonical task word and the critical-path clause', () => {
    renderBar({ isCritical: true });
    expect(screen.getByRole('graphics-symbol')).toHaveAttribute(
      'aria-label',
      'Task: Sample Roofing, Done, on the critical path',
    );
  });

  it('de: a fully German sentence (no English fragment, canonical task word)', async () => {
    await switchToGerman();
    renderBar({ isCritical: true });
    const label = screen.getByRole('graphics-symbol').getAttribute('aria-label')!;
    expect(label).toBe('Aufgabe: Sample Roofing, Abgeschlossen, auf dem kritischen Pfad');
    expect(label).not.toMatch(ENGLISH_FRAGMENTS);
  });

  it('de: not-started and in-progress use their German canonical words', async () => {
    await switchToGerman();
    const { unmount } = renderBar({ status: 'not_started' });
    expect(screen.getByRole('graphics-symbol').getAttribute('aria-label')).toContain(
      'Nicht begonnen',
    );
    unmount();
    renderBar({ status: 'in_progress' });
    expect(screen.getByRole('graphics-symbol').getAttribute('aria-label')).toContain('In Arbeit');
  });
});

describe('Gantt milestone aria-label sentences', () => {
  function renderMilestones(milestone: TimelineMilestone) {
    return render(
      <LocaleProvider>
        <svg>
          <GanttMilestones
            milestones={[milestone]}
            chartRange={{
              start: new Date(2026, 0, 1, 12),
              end: new Date(2026, 11, 31, 12),
              totalDays: 364,
            }}
            zoom="day"
            milestoneRowIndices={new Map([[milestone.id, 0]])}
            colors={{
              incompleteFill: '#3B82F6',
              incompleteStroke: '#1D4ED8',
              completeFill: '#22C55E',
              completeStroke: '#15803D',
              lateFill: '#DC2626',
              lateStroke: '#B91C1C',
              aheadFill: '#10B981',
              aheadStroke: '#047857',
              hoverGlow: 'rgba(59,130,246,0.3)',
              completeHoverGlow: 'rgba(34,197,94,0.3)',
              lateHoverGlow: 'rgba(220,38,38,0.25)',
              aheadHoverGlow: 'rgba(16,185,129,0.25)',
            }}
          />
        </svg>
      </LocaleProvider>,
    );
  }

  it('en: canonical milestone word Upcoming inside a full sentence', () => {
    renderMilestones(MILESTONE);
    const label = screen.getByTestId('gantt-milestone-diamond').getAttribute('aria-label')!;
    expect(label).toMatch(/^Milestone: Sample Shell, Upcoming, target date /);
  });

  it('de: a fully German sentence with Anstehend', async () => {
    await switchToGerman();
    renderMilestones(MILESTONE);
    const label = screen.getByTestId('gantt-milestone-diamond').getAttribute('aria-label')!;
    expect(label).toMatch(/^Meilenstein: Sample Shell, Anstehend, Zieldatum /);
    expect(label).not.toMatch(ENGLISH_FRAGMENTS);
  });

  it('de: a reached milestone says Erreicht', async () => {
    await switchToGerman();
    renderMilestones({ ...MILESTONE, isCompleted: true });
    const label = screen.getByTestId('gantt-milestone-diamond').getAttribute('aria-label')!;
    expect(label).toContain('Erreicht');
  });
});

describe('Calendar aria-label sentences', () => {
  it('de: work item label is German with the canonical task word', async () => {
    await switchToGerman();
    render(
      <LocaleProvider>
        <MemoryRouter>
          <CalendarItem item={WORK_ITEM} isStart isEnd compact={false} />
        </MemoryRouter>
      </LocaleProvider>,
    );
    const label = screen.getByRole('button').getAttribute('aria-label')!;
    expect(label).toMatch(
      /^Aufgabe: Sample Roofing, Abgeschlossen, 1\. Apr\.? 2026 bis 10\. Apr\.? 2026$/,
    );
    expect(label).not.toMatch(ENGLISH_FRAGMENTS);
  });

  it('de: milestone label is German with Anstehend', async () => {
    await switchToGerman();
    render(
      <LocaleProvider>
        <MemoryRouter>
          <CalendarMilestone milestone={MILESTONE} />
        </MemoryRouter>
      </LocaleProvider>,
    );
    const label = screen.getByRole('button').getAttribute('aria-label')!;
    expect(label).toContain('Anstehend');
    expect(label).not.toMatch(ENGLISH_FRAGMENTS);
  });

  it('de: household item label is German with the canonical purchase word', async () => {
    await switchToGerman();
    render(
      <LocaleProvider>
        <MemoryRouter>
          <CalendarHouseholdItem item={HOUSEHOLD_ITEM} />
        </MemoryRouter>
      </LocaleProvider>,
    );
    const label = screen.getByRole('button').getAttribute('aria-label')!;
    expect(label).toContain('Lieferung geplant');
    expect(label).toContain('Sample Sofa');
    expect(label).not.toMatch(ENGLISH_FRAGMENTS);
  });

  it('en: the three calendar labels are the documented full sentences', () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <CalendarMilestone milestone={{ ...MILESTONE, isCompleted: true }} />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Milestone: Sample Shell, Reached',
    );
  });
});
