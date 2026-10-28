/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { AreaResponse } from '@cornerstone/shared';
import type * as EntityPickerDialogModule from '../../components/EntityPicker/EntityPickerDialog.js';
import type { ScheduleView } from './useScheduleView.js';
import { DEFAULT_SCHEDULE_SHOW, type ScheduleShowKey } from '../../lib/scheduleView.js';

// The picker has its own tests; here it is a stub that exposes what the toolbar hands it.
const pickerProps: {
  current: Parameters<typeof EntityPickerDialogModule.EntityPickerDialog>[0] | null;
} = {
  current: null,
};

jest.unstable_mockModule('../../components/EntityPicker/EntityPickerDialog.js', () => ({
  EntityPickerDialog: (
    props: Parameters<typeof EntityPickerDialogModule.EntityPickerDialog>[0],
  ) => {
    pickerProps.current = props;
    return props.open ? (
      <div data-testid="picker-stub">
        <button type="button" onClick={() => props.onPick({ id: 'a2', label: 'Roof' } as never)}>
          pick Roof
        </button>
        <button type="button" onClick={props.onClose}>
          close picker
        </button>
      </div>
    ) : null;
  },
}));

const { ScheduleToolbar } = await import('./ScheduleToolbar.js');

const AREAS: AreaResponse[] = [
  {
    id: 'a1',
    name: 'Kitchen',
    parentId: null,
    color: null,
    description: null,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'a2',
    name: 'Roof',
    parentId: null,
    color: null,
    description: null,
    sortOrder: 1,
    createdAt: '',
    updatedAt: '',
  },
];

function makeView(o: Partial<ScheduleView> = {}): ScheduleView {
  return {
    ready: true,
    show: DEFAULT_SCHEDULE_SHOW,
    zoom: 'month',
    group: 'time',
    areaId: null,
    legendOpen: false,
    phoneView: 'agenda',
    areas: AREAS,
    setShow: jest.fn<ScheduleView['setShow']>(),
    setZoom: jest.fn<ScheduleView['setZoom']>(),
    setGroup: jest.fn<ScheduleView['setGroup']>(),
    setAreaId: jest.fn<ScheduleView['setAreaId']>(),
    setLegendOpen: jest.fn<ScheduleView['setLegendOpen']>(),
    setPhoneView: jest.fn<ScheduleView['setPhoneView']>(),
    ...o,
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.hash}
    </div>
  );
}

function setup(view: ScheduleView, props: Partial<Parameters<typeof ScheduleToolbar>[0]> = {}) {
  const onToday = jest.fn<() => void>();
  const onLegendToggle = jest.fn<() => void>();
  const legendToggleRef = createRef<HTMLButtonElement>();
  const utils = render(
    <MemoryRouter initialEntries={['/schedule/gantt']}>
      <ScheduleToolbar
        view={view}
        variant="chart"
        showZoom
        onToday={onToday}
        areas={AREAS}
        legendId="legend-1"
        legendOpen={false}
        onLegendToggle={onLegendToggle}
        legendToggleRef={legendToggleRef}
        {...props}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { ...utils, onToday, onLegendToggle, legendToggleRef };
}

beforeEach(() => {
  pickerProps.current = null;
});

describe('ScheduleToolbar zoom', () => {
  it('shows Day, Week and Month with the current one pressed and changes the zoom', () => {
    const view = makeView({ zoom: 'week' });
    setup(view);
    expect(screen.getByTestId('schedule-zoom-week')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('schedule-zoom-day')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('schedule-zoom-day'));
    expect(view.setZoom).toHaveBeenCalledWith('day');
  });

  it('hides the zoom and Group controls for the phone agenda', () => {
    setup(makeView(), { showZoom: false });
    expect(screen.queryByTestId('schedule-zoom')).toBeNull();
    expect(screen.queryByTestId('schedule-group-trigger')).toBeNull();
    expect(screen.getByTestId('schedule-show-trigger')).toBeInTheDocument();
  });
});

describe('ScheduleToolbar Show menu', () => {
  const openShow = () => fireEvent.click(screen.getByTestId('schedule-show-trigger'));

  it('is labelled Show when nothing differs from the default', () => {
    setup(makeView());
    expect(screen.getByTestId('schedule-show-trigger')).toHaveTextContent('Show');
    expect(screen.getByTestId('schedule-show-trigger')).not.toHaveTextContent('changed');
  });

  it('counts the changed toggles in the trigger', () => {
    setup(makeView({ show: new Set<ScheduleShowKey>([...DEFAULT_SCHEDULE_SHOW, 'done']) }));
    expect(screen.getByTestId('schedule-show-trigger')).toHaveTextContent('Show · 1 changed');
  });

  it('lists the six toggles for the chart with their checked state', () => {
    setup(makeView());
    openShow();
    const items = within(screen.getByTestId('schedule-show-menu')).getAllByRole('menuitemcheckbox');
    expect(items.map((el) => el.textContent?.replace('✓', '').trim())).toEqual([
      'Tasks',
      'Milestones',
      'Purchases',
      'Dependency arrows',
      'Critical path',
      'Done',
    ]);
    expect(screen.getByTestId('schedule-show-tasks')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('schedule-show-done')).toHaveAttribute('aria-checked', 'false');
  });

  it('toggling calls setShow with the key and the new value', () => {
    const view = makeView();
    setup(view);
    openShow();
    fireEvent.click(screen.getByTestId('schedule-show-done'));
    expect(view.setShow).toHaveBeenCalledWith('done', true);
    fireEvent.click(screen.getByTestId('schedule-show-arrows'));
    expect(view.setShow).toHaveBeenCalledWith('arrows', false);
  });

  it('the last shown kind is aria-disabled with the keep-one description', () => {
    const view = makeView({ show: new Set<ScheduleShowKey>(['milestones', 'arrows']) });
    setup(view);
    openShow();
    const last = screen.getByTestId('schedule-show-milestones');
    expect(last).toHaveAttribute('aria-disabled', 'true');
    expect(last).toHaveAccessibleDescription(/at least one stays shown/);
    expect(screen.getByTestId('schedule-show-arrows')).not.toHaveAttribute('aria-disabled');
  });

  it('the calendar variant offers only the three kinds and counts only kind changes', () => {
    setup(makeView({ show: new Set<ScheduleShowKey>(['tasks', 'milestones', 'done']) }), {
      variant: 'calendar',
      showZoom: false,
    });
    expect(screen.getByTestId('schedule-show-trigger')).toHaveTextContent('Show · 1 changed');
    openShow();
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(3);
    expect(screen.queryByTestId('schedule-zoom')).toBeNull();
    expect(screen.queryByTestId('schedule-today')).toBeNull();
    expect(screen.queryByTestId('schedule-legend-toggle')).toBeNull();
  });
});

describe('ScheduleToolbar Group menu', () => {
  it('shows the current grouping and sets Area or Time', () => {
    const view = makeView();
    setup(view);
    expect(screen.getByTestId('schedule-group-trigger')).toHaveTextContent('Group: Time');
    fireEvent.click(screen.getByTestId('schedule-group-trigger'));
    expect(screen.getByTestId('schedule-group-time')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('schedule-group-area'));
    expect(view.setGroup).toHaveBeenCalledWith('area');
    fireEvent.click(screen.getByTestId('schedule-group-time'));
    expect(view.setGroup).toHaveBeenCalledWith('time');
  });

  it('reflects Area grouping in the trigger', () => {
    setup(makeView({ group: 'area' }));
    expect(screen.getByTestId('schedule-group-trigger')).toHaveTextContent('Group: Area');
  });
});

describe('ScheduleToolbar area chip', () => {
  it('reads All areas, unpressed, with no clear chip when no area is set', () => {
    setup(makeView());
    const chip = screen.getByTestId('schedule-area-area');
    expect(chip).toHaveTextContent('All areas');
    expect(chip).not.toHaveAttribute('aria-pressed');
    expect(screen.queryByTestId('schedule-area-clear')).toBeNull();
  });

  it('reads the area name, pressed, with a clear chip when an area is set', () => {
    setup(makeView({ areaId: 'a1' }));
    expect(screen.getByTestId('schedule-area-area')).toHaveTextContent('Kitchen');
    expect(screen.getByTestId('schedule-area-area')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('schedule-area-clear')).toHaveTextContent('All areas');
  });

  it('falls back to All areas for an area that is not in the list', () => {
    setup(makeView({ areaId: 'ghost' }));
    expect(screen.getByTestId('schedule-area-area')).toHaveTextContent('All areas');
  });

  it('opens the area picker with the areas and sets the picked one', () => {
    const view = makeView();
    setup(view);
    expect(screen.queryByTestId('picker-stub')).toBeNull();
    fireEvent.click(screen.getByTestId('schedule-area-area'));
    expect(screen.getByTestId('picker-stub')).toBeInTheDocument();
    expect(pickerProps.current?.picker).toMatchObject({
      kind: 'area',
      areas: AREAS,
      create: 'off',
    });
    fireEvent.click(screen.getByText('pick Roof'));
    expect(view.setAreaId).toHaveBeenCalledWith('a2');
  });

  it('closes the picker', () => {
    setup(makeView());
    fireEvent.click(screen.getByTestId('schedule-area-area'));
    fireEvent.click(screen.getByText('close picker'));
    expect(screen.queryByTestId('picker-stub')).toBeNull();
  });

  it('the clear chip clears the area, and focus moves to the area chip once it is gone', () => {
    const view = makeView({ areaId: 'a1' });
    const { rerender, legendToggleRef } = setup(view);
    fireEvent.click(screen.getByTestId('schedule-area-clear'));
    expect(view.setAreaId).toHaveBeenCalledWith(null);
    // the host applies the change
    rerender(
      <MemoryRouter initialEntries={['/schedule/gantt']}>
        <ScheduleToolbar
          view={makeView({ areaId: null })}
          variant="chart"
          showZoom
          onToday={() => {}}
          areas={AREAS}
          legendId="legend-1"
          legendOpen={false}
          onLegendToggle={() => {}}
          legendToggleRef={legendToggleRef}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('schedule-area-clear')).toBeNull();
    expect(screen.getByTestId('schedule-area-area')).toHaveFocus();
  });

  it('does not steal focus when the area changes without using the clear chip', () => {
    const { rerender, legendToggleRef } = setup(makeView({ areaId: 'a1' }));
    screen.getByTestId('schedule-today').focus();
    rerender(
      <MemoryRouter initialEntries={['/schedule/gantt']}>
        <ScheduleToolbar
          view={makeView({ areaId: null })}
          variant="chart"
          showZoom
          onToday={() => {}}
          areas={AREAS}
          legendId="legend-1"
          legendOpen={false}
          onLegendToggle={() => {}}
          legendToggleRef={legendToggleRef}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('schedule-today')).toHaveFocus();
  });
});

describe('ScheduleToolbar actions', () => {
  it('Today calls onToday', () => {
    const { onToday } = setup(makeView());
    fireEvent.click(screen.getByTestId('schedule-today'));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('the Legend button controls the legend id, reflects the open state it is given and toggles', () => {
    const { legendToggleRef, onLegendToggle } = setup(makeView(), { legendOpen: true });
    const button = screen.getByTestId('schedule-legend-toggle');
    expect(button).toHaveAttribute('aria-controls', 'legend-1');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(legendToggleRef.current).toBe(button);
    fireEvent.click(button);
    expect(onLegendToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the legend closed when told so and still just calls the toggle', () => {
    const view = makeView({ legendOpen: true });
    const { onLegendToggle } = setup(view, { legendOpen: false });
    // the page decides what is open (a stored open state does not leak in)
    expect(screen.getByTestId('schedule-legend-toggle')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByTestId('schedule-legend-toggle'));
    expect(onLegendToggle).toHaveBeenCalledTimes(1);
    expect(view.setLegendOpen).not.toHaveBeenCalled();
  });

  it('the more menu links to the calendar sync section of the profile settings', () => {
    setup(makeView());
    fireEvent.click(screen.getByTestId('schedule-more-trigger'));
    const link = screen.getByTestId('schedule-subscribe');
    expect(link).toHaveTextContent('Subscribe in calendar app');
    expect(link.getAttribute('href')).toMatch(/\/settings\/profile#/);
    fireEvent.click(link);
    expect(screen.getByTestId('location').textContent).toMatch(/\/settings\/profile#/);
  });

  it('a modified click on the subscribe link leaves navigation to the browser', () => {
    setup(makeView());
    fireEvent.click(screen.getByTestId('schedule-more-trigger'));
    fireEvent.click(screen.getByTestId('schedule-subscribe'), { ctrlKey: true });
    expect(screen.getByTestId('location').textContent).toBe('/schedule/gantt');
  });
});
