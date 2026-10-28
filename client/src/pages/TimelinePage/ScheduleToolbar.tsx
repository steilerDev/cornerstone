import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useHref, useNavigate } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import type { AreaResponse } from '@cornerstone/shared';
import { CALENDAR_SYNC_ANCHOR } from '../../components/DavAccessCard/calendarSyncAnchor.js';
import { EntityPickerDialog } from '../../components/EntityPicker/EntityPickerDialog.js';
import { FilterChipGroup } from '../../components/FilterChipGroup/FilterChipGroup.js';
import type { FilterChipOption } from '../../components/FilterChipGroup/FilterChipGroup.js';
import type { ZoomLevel } from '../../components/GanttChart/ganttUtils.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import type { OverflowMenuEntry } from '../../components/OverflowMenu/OverflowMenu.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { isPlainLeftClick } from '../../lib/plainClick.js';
import {
  DEFAULT_SCHEDULE_SHOW,
  SCHEDULE_GROUPS,
  SCHEDULE_KIND_KEYS,
  SCHEDULE_SHOW_KEYS,
  SCHEDULE_ZOOMS,
  changedShowCount,
  isLastVisibleKind,
} from '../../lib/scheduleView.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import shared from '../../styles/shared.module.css';
import type { ScheduleView } from './useScheduleView.js';
import styles from './TimelinePage.module.css';

const AREA_CHIP_SELECTOR = '[data-chip-value="area"]';

export interface ScheduleToolbarProps {
  readonly view: ScheduleView;
  readonly variant: 'chart' | 'calendar';
  /** false (the phone agenda): the zoom and Group controls, which only act on the chart, go. */
  readonly showZoom: boolean;
  readonly onToday: () => void;
  readonly areas: AreaResponse[];
  /** Id of the legend strip the Legend button controls. */
  readonly legendId: string;
  /** The Legend button (the phone legend sheet returns focus to it). */
  readonly legendToggleRef: RefObject<HTMLButtonElement | null>;
}

function Caret() {
  return (
    <span aria-hidden="true" className={styles.caret}>
      ▾
    </span>
  );
}

/** Zoom, Show, Group, the area chip, Today, the more menu and the Legend toggle (chart); Show only (calendar). */
export function ScheduleToolbar({
  view,
  variant,
  showZoom,
  onToday,
  areas,
  legendId,
  legendToggleRef,
}: ScheduleToolbarProps) {
  const { t } = useTranslation('schedule');
  const navigate = useNavigate();
  const originState = useOriginState();
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const chipGroupRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLElement | null>(null);
  const focusAreaChipRef = useRef(false);
  const isChart = variant === 'chart';

  const subscribeTo = `${routeUrl('settingsProfile')}#${CALENDAR_SYNC_ANCHOR}`;
  const subscribeHref = useHref(subscribeTo);

  const zoomLabels: Record<ZoomLevel, string> = {
    day: t('timeline.zoomOptions.day'),
    week: t('timeline.zoomOptions.week'),
    month: t('timeline.zoomOptions.month'),
  };

  // ---- Show ▾ ----
  const showKeys = isChart ? SCHEDULE_SHOW_KEYS : SCHEDULE_KIND_KEYS;
  const changed = isChart
    ? changedShowCount(view.show)
    : SCHEDULE_KIND_KEYS.filter((key) => view.show.has(key) !== DEFAULT_SCHEDULE_SHOW.has(key))
        .length;
  const showLabel =
    changed > 0 ? t('view.toolbar.showChanged', { count: changed }) : t('view.toolbar.show');
  const showItems: OverflowMenuEntry[] = showKeys.map((key) => {
    const last = isLastVisibleKind(view.show, key);
    return {
      kind: 'toggle',
      id: key,
      label: t(I18N_UNION_KEYS.scheduleShowItem.key(key)),
      checked: view.show.has(key),
      onChange: (on) => view.setShow(key, on),
      ariaDisabled: last,
      description: last ? t('view.toolbar.keepOneKind') : undefined,
      testId: `schedule-show-${key}`,
    };
  });

  // ---- Group ▾ ----
  const groupLabel = t(I18N_UNION_KEYS.scheduleGroup.key(view.group));
  const groupTrigger = t('view.toolbar.group', { value: groupLabel });
  const groupItems: OverflowMenuEntry[] = [
    {
      kind: 'choice',
      id: 'group',
      label: t('view.toolbar.groupBy'),
      value: view.group,
      options: SCHEDULE_GROUPS.map((value) => ({
        value,
        label: t(I18N_UNION_KEYS.scheduleGroup.key(value)),
        testId: `schedule-group-${value}`,
      })),
      onChange: (value) => view.setGroup(value === 'area' ? 'area' : 'time'),
    },
  ];

  // ---- More ▾ ----
  const moreItems: OverflowMenuEntry[] = [
    {
      kind: 'link',
      id: 'subscribe',
      label: t('view.toolbar.subscribe'),
      href: subscribeHref,
      testId: 'schedule-subscribe',
      onClick: (event) => {
        if (!isPlainLeftClick(event)) return;
        event.preventDefault();
        void navigate(subscribeTo, { state: originState });
      },
    },
  ];

  // ---- Area chip ----
  const areaName = areas.find((area) => area.id === view.areaId)?.name;
  const chips: FilterChipOption[] = [
    {
      value: 'area',
      label: areaName ?? t('view.toolbar.allAreas'),
      action: true,
      actionPressed: view.areaId !== null,
      trailing: '▾',
      onSelect: () => {
        chipRef.current = chipGroupRef.current!.querySelector<HTMLElement>(AREA_CHIP_SELECTOR);
        setAreaPickerOpen(true);
      },
    },
  ];
  if (view.areaId !== null) {
    chips.push({
      value: 'clear',
      label: t('view.toolbar.allAreas'),
      action: true,
      trailing: '×',
      onSelect: () => {
        focusAreaChipRef.current = true;
        view.setAreaId(null);
      },
    });
  }

  // The clear chip unmounts on clear: focus moves to the area chip instead of the page.
  const { areaId } = view;
  useEffect(() => {
    if (!focusAreaChipRef.current || areaId !== null) return;
    focusAreaChipRef.current = false;
    chipGroupRef.current!.querySelector<HTMLElement>(AREA_CHIP_SELECTOR)!.focus();
  }, [areaId]);

  return (
    <div className={styles.toolbar} role="group" aria-label={t('view.toolbar.ariaLabel')}>
      {isChart && showZoom && (
        <div
          className={shared.segmented}
          role="group"
          aria-label={t('view.toolbar.zoomLabel')}
          data-testid="schedule-zoom"
        >
          {SCHEDULE_ZOOMS.map((level) => (
            <button
              key={level}
              type="button"
              className={`${shared.segmentedButton} ${
                view.zoom === level ? shared.segmentedButtonActive : ''
              }`}
              aria-pressed={view.zoom === level}
              onClick={() => view.setZoom(level)}
              data-testid={`schedule-zoom-${level}`}
            >
              {zoomLabels[level]}
            </button>
          ))}
        </div>
      )}

      <OverflowMenu
        items={showItems}
        triggerAriaLabel={showLabel}
        triggerIcon={
          <>
            {showLabel}
            <Caret />
          </>
        }
        triggerClassName={styles.toolbarButton}
        placement="bottom-start"
        data-testid="schedule-show-trigger"
        menuTestId="schedule-show-menu"
      />

      {isChart && showZoom && (
        <OverflowMenu
          items={groupItems}
          triggerAriaLabel={groupTrigger}
          triggerIcon={
            <>
              {groupTrigger}
              <Caret />
            </>
          }
          triggerClassName={styles.toolbarButton}
          placement="bottom-start"
          data-testid="schedule-group-trigger"
          menuTestId="schedule-group-menu"
        />
      )}

      {isChart && (
        <>
          <FilterChipGroup
            groupRef={chipGroupRef}
            options={chips}
            value=""
            onChange={() => {}}
            ariaLabel={t('view.toolbar.chooseArea')}
            testIdPrefix="schedule-area"
            layout="wrap"
          />
          <EntityPickerDialog
            open={areaPickerOpen}
            title={t('view.toolbar.chooseArea')}
            onClose={() => setAreaPickerOpen(false)}
            onPick={(option) => view.setAreaId(option.id)}
            returnFocusRef={chipRef}
            testId="schedule-area-picker"
            picker={{ kind: 'area', areas, create: 'off' }}
          />

          <span className={styles.toolbarSpacer} />

          <button
            type="button"
            className={`${shared.btnSecondary} ${styles.toolbarAction}`}
            onClick={onToday}
            data-testid="schedule-today"
          >
            {t('view.toolbar.today')}
          </button>

          <OverflowMenu
            items={moreItems}
            triggerAriaLabel={t('view.toolbar.more')}
            triggerClassName={styles.moreTrigger}
            data-testid="schedule-more-trigger"
            menuTestId="schedule-more-menu"
          />

          <button
            type="button"
            ref={legendToggleRef}
            className={styles.toolbarButton}
            aria-expanded={view.legendOpen}
            aria-controls={legendId}
            onClick={() => view.setLegendOpen(!view.legendOpen)}
            data-testid="schedule-legend-toggle"
          >
            {t('view.toolbar.legend')}
          </button>
        </>
      )}
    </div>
  );
}
