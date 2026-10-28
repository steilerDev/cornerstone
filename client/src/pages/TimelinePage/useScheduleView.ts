import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { AreaResponse } from '@cornerstone/shared';
import type { ZoomLevel } from '../../components/GanttChart/ganttUtils.js';
import { useAreas } from '../../hooks/useAreas.js';
import { usePreferences } from '../../hooks/usePreferences.js';
import {
  DEFAULT_SCHEDULE_SHOW,
  SCHEDULE_PREFERENCE_KEY,
  SCHEDULE_SHOW_KEYS,
  SCHEDULE_ZOOMS,
  isLastVisibleKind,
  parseSchedulePreference,
  parseShowParam,
  serializeShowParam,
  showFromLegacyFilter,
} from '../../lib/scheduleView.js';
import type {
  SchedulePhoneView,
  SchedulePreference,
  ScheduleGroup,
  ScheduleShowKey,
} from '../../lib/scheduleView.js';

const ZOOM_PARAM = 'zoom';
const SHOW_PARAM = 'show';
const GROUP_PARAM = 'group';
const AREA_PARAM = 'areaId';
const LEGACY_FILTER_PARAM = 'filter';

const DEFAULT_ZOOM: ZoomLevel = 'month';

/** The effective view as last rendered or committed: `show` is always known. */
type CurrentView = SchedulePreference & { show: ScheduleShowKey[] };

export interface ScheduleView {
  /** The stored preferences have loaded (before that the values are the URL or the defaults). */
  readonly ready: boolean;
  readonly show: ReadonlySet<ScheduleShowKey>;
  readonly zoom: ZoomLevel;
  readonly group: ScheduleGroup;
  readonly areaId: string | null;
  readonly legendOpen: boolean;
  readonly phoneView: SchedulePhoneView;
  /** The areas the view validated `areaId` against (one fetch for the page). */
  readonly areas: AreaResponse[];
  /** Turning off the last shown kind (Tasks, Milestones, Purchases) is ignored. */
  setShow(key: ScheduleShowKey, on: boolean): void;
  setZoom(zoom: ZoomLevel): void;
  setGroup(group: ScheduleGroup): void;
  setAreaId(areaId: string | null): void;
  setLegendOpen(open: boolean): void;
  setPhoneView(view: SchedulePhoneView): void;
}

function pickZoom(raw: string | null): ZoomLevel | undefined {
  return SCHEDULE_ZOOMS.find((zoom) => zoom === raw);
}

function showFromList(list: readonly ScheduleShowKey[] | undefined): ReadonlySet<ScheduleShowKey> {
  return list ? new Set(list) : DEFAULT_SCHEDULE_SHOW;
}

/**
 * The Schedule's and the Calendar's view state (D10): the URL wins over the stored preference,
 * which wins over the defaults. Every change replaces the URL (keeping `location.state`) and
 * upserts the preference, fire-and-forget.
 */
export function useScheduleView(): ScheduleView {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { preferences, hasLoaded, upsert } = usePreferences();
  const { areas, isLoading: areasLoading, error: areasError } = useAreas();
  // Changes made in this session: they apply at once, before the upsert settles.
  const [local, setLocal] = useState<SchedulePreference>({});

  const stored = useMemo(
    () =>
      parseSchedulePreference(
        preferences.find((pref) => pref.key === SCHEDULE_PREFERENCE_KEY)?.value,
      ),
    [preferences],
  );

  const urlShow = parseShowParam(searchParams.get(SHOW_PARAM));
  const urlZoom = pickZoom(searchParams.get(ZOOM_PARAM));
  const urlGroup = searchParams.get(GROUP_PARAM) === 'area' ? 'area' : null;
  const urlAreaId = searchParams.get(AREA_PARAM);

  const merged = { ...stored, ...local };
  const show = local.show ? showFromList(local.show) : (urlShow ?? showFromList(merged.show));
  const zoom = local.zoom ?? urlZoom ?? merged.zoom ?? DEFAULT_ZOOM;
  const group = local.group ?? urlGroup ?? merged.group ?? 'time';
  const rawAreaId =
    local.areaId !== undefined ? local.areaId : (urlAreaId ?? merged.areaId ?? null);
  // An area that no longer exists is dropped once the areas are known.
  const areasKnown = !areasLoading && areasError === null;
  const areaUnknown =
    rawAreaId !== null && areasKnown && !areas.some((area) => area.id === rawAreaId);
  const areaId = areaUnknown ? null : rawAreaId;
  const legendOpen = merged.legendOpen ?? false;
  const phoneView = merged.phoneView ?? 'agenda';

  const currentRef = useRef<CurrentView>({ show: [] });
  currentRef.current = {
    show: SCHEDULE_SHOW_KEYS.filter((key) => show.has(key)),
    zoom,
    group,
    areaId,
    legendOpen,
    phoneView,
  };

  const commit = useCallback(
    (change: SchedulePreference) => {
      const next: CurrentView = {
        ...currentRef.current,
        ...change,
        show: change.show ?? currentRef.current.show,
      };
      currentRef.current = next;
      setLocal((prev) => ({ ...prev, ...change }));
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          function write(name: string, value: string | null) {
            if (value === null) params.delete(name);
            else params.set(name, value);
          }
          if (change.zoom !== undefined) {
            write(ZOOM_PARAM, change.zoom === DEFAULT_ZOOM ? null : change.zoom);
          }
          if (change.show !== undefined) {
            write(SHOW_PARAM, serializeShowParam(new Set(change.show)));
          }
          if (change.group !== undefined) {
            write(GROUP_PARAM, change.group === 'time' ? null : change.group);
          }
          if (change.areaId !== undefined) write(AREA_PARAM, change.areaId);
          return params;
        },
        { replace: true, state: location.state },
      );
      upsert(SCHEDULE_PREFERENCE_KEY, JSON.stringify(next)).catch(() => {});
    },
    [setSearchParams, location.state, upsert],
  );

  const setShow = useCallback(
    (key: ScheduleShowKey, on: boolean) => {
      const keys = currentRef.current.show;
      const current = new Set(keys);
      if (!on && isLastVisibleKind(current, key)) return;
      if (on) current.add(key);
      else current.delete(key);
      commit({ show: SCHEDULE_SHOW_KEYS.filter((member) => current.has(member)) });
    },
    [commit],
  );

  // A legacy `?filter=` becomes `show` once and disappears.
  const legacyFilter = searchParams.get(LEGACY_FILTER_PARAM);
  useEffect(() => {
    if (legacyFilter === null) return;
    const legacyShow = showFromLegacyFilter(legacyFilter);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(LEGACY_FILTER_PARAM);
        const serialized = legacyShow ? serializeShowParam(legacyShow) : null;
        if (serialized !== null) params.set(SHOW_PARAM, serialized);
        return params;
      },
      { replace: true, state: location.state },
    );
  }, [legacyFilter, setSearchParams, location.state]);

  // ... and its URL param goes with it.
  useEffect(() => {
    if (!areaUnknown || urlAreaId === null) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(AREA_PARAM);
        return params;
      },
      { replace: true, state: location.state },
    );
  }, [areaUnknown, urlAreaId, setSearchParams, location.state]);

  return {
    ready: hasLoaded,
    show,
    zoom,
    group,
    areaId,
    legendOpen,
    phoneView,
    areas,
    setShow,
    setZoom: (next) => commit({ zoom: next }),
    setGroup: (next) => commit({ group: next }),
    setAreaId: (next) => commit({ areaId: next }),
    setLegendOpen: (open) => commit({ legendOpen: open }),
    setPhoneView: (next) => commit({ phoneView: next }),
  };
}
