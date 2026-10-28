/**
 * @jest-environment jsdom
 *
 * useScheduleView (D10): URL > stored preference > default; every change replaces the URL and
 * upserts the preference; the legacy ?filter= becomes ?show=; an unknown areaId is dropped.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { AreaResponse, UserPreference } from '@cornerstone/shared';
import type * as UsePreferencesModule from '../../hooks/usePreferences.js';
import type * as UseAreasModule from '../../hooks/useAreas.js';

const upsert = jest.fn<(key: string, value: string) => Promise<void>>();
const prefsState: { preferences: UserPreference[]; hasLoaded: boolean } = {
  preferences: [],
  hasLoaded: true,
};
const areasState: { areas: AreaResponse[]; isLoading: boolean; error: string | null } = {
  areas: [],
  isLoading: false,
  error: null,
};

jest.unstable_mockModule('../../hooks/usePreferences.js', () => ({
  usePreferences: (): ReturnType<typeof UsePreferencesModule.usePreferences> =>
    ({ ...prefsState, upsert }) as never,
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: (): ReturnType<typeof UseAreasModule.useAreas> => ({ ...areasState }) as never,
}));

const { useScheduleView } = await import('./useScheduleView.js');

const area = (id: string): AreaResponse => ({
  id,
  name: id,
  parentId: null,
  color: null,
  description: null,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
});

const pref = (value: unknown): UserPreference =>
  ({ key: 'schedule.view', value: JSON.stringify(value), updatedAt: '' }) as UserPreference;

let lastLocation: ReturnType<typeof useLocation>;
function Probe() {
  lastLocation = useLocation();
  return null;
}

function setup(url = '/schedule/gantt', state?: unknown) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter
      initialEntries={[
        {
          pathname: url.split('?')[0]!,
          search: url.includes('?') ? `?${url.split('?')[1]}` : '',
          state,
        },
      ]}
    >
      <Probe />
      {children}
    </MemoryRouter>
  );
  return renderHook(() => useScheduleView(), { wrapper });
}

const params = () => new URLSearchParams(lastLocation.search);
const lastUpsert = () => JSON.parse(upsert.mock.calls.at(-1)![1]) as Record<string, unknown>;

beforeEach(() => {
  upsert.mockReset();
  upsert.mockResolvedValue(undefined);
  prefsState.preferences = [];
  prefsState.hasLoaded = true;
  areasState.areas = [area('a1'), area('a2')];
  areasState.isLoading = false;
  areasState.error = null;
});

describe('defaults and sources', () => {
  it('uses the defaults with nothing stored and no params', () => {
    const { result } = setup();
    expect(result.current).toMatchObject({
      ready: true,
      zoom: 'month',
      group: 'time',
      areaId: null,
      legendOpen: false,
      phoneView: 'agenda',
    });
    expect([...result.current.show].sort()).toEqual(
      ['arrows', 'critical', 'milestones', 'purchases', 'tasks'].sort(),
    );
    expect(result.current.areas).toHaveLength(2);
  });

  it('is not ready until the preferences have loaded', () => {
    prefsState.hasLoaded = false;
    expect(setup().result.current.ready).toBe(false);
  });

  it('reads the stored preference', () => {
    prefsState.preferences = [
      pref({
        show: ['tasks', 'done'],
        zoom: 'week',
        group: 'area',
        areaId: 'a2',
        legendOpen: true,
        phoneView: 'chart',
      }),
    ];
    const { result } = setup();
    expect([...result.current.show]).toEqual(['tasks', 'done']);
    expect(result.current).toMatchObject({
      zoom: 'week',
      group: 'area',
      areaId: 'a2',
      legendOpen: true,
      phoneView: 'chart',
    });
  });

  it('ignores other preference keys and unreadable values', () => {
    prefsState.preferences = [
      { key: 'theme', value: 'dark', updatedAt: '' } as UserPreference,
      { key: 'schedule.view', value: '{bad', updatedAt: '' } as UserPreference,
    ];
    expect(setup().result.current.zoom).toBe('month');
  });

  it('URL params win over the stored preference', () => {
    prefsState.preferences = [pref({ zoom: 'week', group: 'time', show: ['tasks'], areaId: 'a1' })];
    const { result } = setup('/schedule/gantt?zoom=day&group=area&show=milestones,done&areaId=a2');
    expect(result.current.zoom).toBe('day');
    expect(result.current.group).toBe('area');
    expect([...result.current.show]).toEqual(['milestones', 'done']);
    expect(result.current.areaId).toBe('a2');
  });

  it('ignores an invalid zoom, group or show param', () => {
    prefsState.preferences = [pref({ zoom: 'week' })];
    const { result } = setup('/schedule/gantt?zoom=year&group=colour&show=done');
    expect(result.current.zoom).toBe('week');
    expect(result.current.group).toBe('time');
    // show=done has no kind on: treated as absent
    expect(result.current.show.has('tasks')).toBe(true);
  });
});

describe('changes', () => {
  it('setZoom applies at once, writes the param and upserts the whole view', () => {
    const { result } = setup();
    act(() => result.current.setZoom('day'));
    expect(result.current.zoom).toBe('day');
    expect(params().get('zoom')).toBe('day');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]![0]).toBe('schedule.view');
    expect(lastUpsert()).toMatchObject({ zoom: 'day', group: 'time', phoneView: 'agenda' });
  });

  it('the default zoom deletes the param', () => {
    const { result } = setup('/schedule/gantt?zoom=day');
    act(() => result.current.setZoom('month'));
    expect(params().has('zoom')).toBe(false);
  });

  it('setGroup writes group=area and deletes the param for time', () => {
    const { result } = setup();
    act(() => result.current.setGroup('area'));
    expect(params().get('group')).toBe('area');
    act(() => result.current.setGroup('time'));
    expect(params().has('group')).toBe(false);
  });

  it('setAreaId writes and clears the param', () => {
    const { result } = setup();
    act(() => result.current.setAreaId('a1'));
    expect(result.current.areaId).toBe('a1');
    expect(params().get('areaId')).toBe('a1');
    act(() => result.current.setAreaId(null));
    expect(result.current.areaId).toBeNull();
    expect(params().has('areaId')).toBe(false);
    expect(lastUpsert().areaId).toBeNull();
  });

  it('setLegendOpen and setPhoneView are stored but never put in the URL', () => {
    const { result } = setup();
    act(() => result.current.setLegendOpen(true));
    act(() => result.current.setPhoneView('chart'));
    expect(result.current.legendOpen).toBe(true);
    expect(result.current.phoneView).toBe('chart');
    expect(lastUpsert()).toMatchObject({ legendOpen: true, phoneView: 'chart' });
    expect(lastLocation.search).toBe('');
  });

  it('setShow turns a toggle on or off, serialising only a non-default set', () => {
    const { result } = setup();
    act(() => result.current.setShow('done', true));
    expect(result.current.show.has('done')).toBe(true);
    expect(params().get('show')).toBe('tasks,milestones,purchases,arrows,critical,done');
    act(() => result.current.setShow('done', false));
    expect(result.current.show.has('done')).toBe(false);
    expect(params().has('show')).toBe(false);
    expect(lastUpsert().show).toEqual(['tasks', 'milestones', 'purchases', 'arrows', 'critical']);
  });

  it('successive changes accumulate (no stale closure)', () => {
    const { result } = setup();
    act(() => {
      result.current.setShow('done', true);
      result.current.setShow('arrows', false);
    });
    expect([...result.current.show].sort()).toEqual(
      ['critical', 'done', 'milestones', 'purchases', 'tasks'].sort(),
    );
  });

  it('turning off the last shown kind is ignored', () => {
    prefsState.preferences = [pref({ show: ['milestones', 'arrows'] })];
    const { result } = setup();
    act(() => result.current.setShow('milestones', false));
    expect(result.current.show.has('milestones')).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('keeps location.state and replaces rather than pushes the history entry', () => {
    const { result } = setup('/schedule/gantt', { from: 'x' });
    act(() => result.current.setZoom('day'));
    expect(lastLocation.state).toEqual({ from: 'x' });
  });

  it('a failing upsert is swallowed', async () => {
    upsert.mockRejectedValue(new Error('offline'));
    const { result } = setup();
    act(() => result.current.setZoom('week'));
    await act(async () => {});
    expect(result.current.zoom).toBe('week');
  });
});

describe('legacy ?filter=', () => {
  it('becomes ?show= and disappears, keeping other params', () => {
    setup('/schedule/gantt?filter=work-items,milestones&zoom=day');
    expect(params().has('filter')).toBe(false);
    expect(params().get('show')).toBe('tasks,milestones,arrows,critical');
    expect(params().get('zoom')).toBe('day');
  });

  it('is simply removed when it names nothing known', () => {
    setup('/schedule/gantt?filter=nonsense');
    expect(params().has('filter')).toBe(false);
    expect(params().has('show')).toBe(false);
  });

  it('is simply removed when it equals the default set', () => {
    setup('/schedule/gantt?filter=work-items,milestones,household-items');
    expect(params().has('filter')).toBe(false);
    expect(params().has('show')).toBe(false);
  });
});

describe('unknown area', () => {
  it('is treated as unset and its URL param is removed once the areas are known', () => {
    const { result } = setup('/schedule/gantt?areaId=ghost&zoom=day');
    expect(result.current.areaId).toBeNull();
    expect(params().has('areaId')).toBe(false);
    expect(params().get('zoom')).toBe('day');
  });

  it('a stored unknown area is treated as unset without touching the URL', () => {
    prefsState.preferences = [pref({ areaId: 'ghost' })];
    const { result } = setup();
    expect(result.current.areaId).toBeNull();
    expect(lastLocation.search).toBe('');
  });

  it('is kept while the areas are still loading', () => {
    areasState.isLoading = true;
    areasState.areas = [];
    const { result } = setup('/schedule/gantt?areaId=a1');
    expect(result.current.areaId).toBe('a1');
    expect(params().get('areaId')).toBe('a1');
  });

  it('is kept when the areas failed to load', () => {
    areasState.error = 'failed';
    areasState.areas = [];
    const { result } = setup('/schedule/gantt?areaId=a1');
    expect(result.current.areaId).toBe('a1');
  });
});
