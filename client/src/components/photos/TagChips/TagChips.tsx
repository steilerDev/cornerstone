import { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaResponse, OrientationResponse } from '@cornerstone/shared';
import { FilterChipGroup } from '../../FilterChipGroup/FilterChipGroup.js';
import type { FilterChipOption } from '../../FilterChipGroup/FilterChipGroup.js';
import { EntityPickerDialog } from '../../EntityPicker/EntityPickerDialog.js';
import { useTagCreate } from '../../../objectForms/useTagCreate.js';
import styles from './TagChips.module.css';

export interface TagChipsProps {
  areas: AreaResponse[];
  orientations: OrientationResponse[];
  /** Newest first (the host reads the recent tags). */
  recentAreaIds: readonly string[];
  recentOrientationIds: readonly string[];
  /** null = no chip pressed. */
  areaId: string | null;
  /** 'none' = "No orientation" pressed; null = no chip pressed. */
  orientationId: string | null | 'none';
  onAreaChange: (id: string | null) => void;
  onOrientationChange: (id: string | null | 'none') => void;
  tone?: 'default' | 'onPhoto';
  /** Page: 'wrap'. Camera: 'scroll'. */
  layout?: 'wrap' | 'scroll';
  /** Unique per mount: the page and the camera render a TagChips at the same time. */
  idPrefix: string;
}

const MAX_RECENT_AREAS = 4;
const MAX_INLINE_ORIENTATIONS = 8;
const RECENT_ORIENTATIONS_WHEN_MANY = 6;
const OTHER_VALUE = '__other';
const NEW_VALUE = '__new';
const NONE_VALUE = 'none';

type PickerKind = 'area' | 'orientation';

/** A ref-shaped handle that resolves the row's pressed chip (else its Other chip) when read. */
function useRowFocusHandle(
  groupRef: RefObject<HTMLDivElement | null>,
): RefObject<HTMLElement | null> {
  return useMemo(
    () => ({
      get current(): HTMLElement | null {
        // Read during render (before the chip group's ref is attached): can be null.
        const group = groupRef.current;
        if (!group) return null;
        return (
          group.querySelector<HTMLElement>('[aria-pressed="true"]') ??
          group.querySelector<HTMLElement>(`[data-chip-value="${OTHER_VALUE}"]`)
        );
      },
      set current(_value: HTMLElement | null) {
        // Read-only handle: the target is looked up from the DOM.
      },
    }),
    [groupRef],
  );
}

/**
 * Area and Orientation chip rows with Other… and New … actions. It only reports values; the host
 * decides what a change applies to.
 */
export function TagChips({
  areas,
  orientations,
  recentAreaIds,
  recentOrientationIds,
  areaId,
  orientationId,
  onAreaChange,
  onOrientationChange,
  tone = 'default',
  layout = 'wrap',
  idPrefix,
}: TagChipsProps) {
  const { t } = useTranslation('photos');
  const { request } = useTagCreate();
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const areaGroupRef = useRef<HTMLDivElement>(null);
  const orientationGroupRef = useRef<HTMLDivElement>(null);
  const areaFocus = useRowFocusHandle(areaGroupRef);
  const orientationFocus = useRowFocusHandle(orientationGroupRef);

  const areaLabelId = `${idPrefix}-area-label`;
  const orientationLabelId = `${idPrefix}-orientation-label`;

  const areaOptions = useMemo<FilterChipOption[]>(() => {
    const byId = new Map(areas.map((a) => [a.id, a]));
    const shown: AreaResponse[] = [];
    for (const id of recentAreaIds) {
      const area = byId.get(id);
      if (area && !shown.some((s) => s.id === id)) shown.push(area);
      if (shown.length >= MAX_RECENT_AREAS) break;
    }
    // A chosen area outside the recents stays visible as a pressed chip.
    const selected = areaId ? byId.get(areaId) : undefined;
    if (selected && !shown.some((s) => s.id === selected.id)) shown.push(selected);
    const nameCount = new Map<string, number>();
    for (const a of shown) nameCount.set(a.name, (nameCount.get(a.name) ?? 0) + 1);
    return shown.map((a) => {
      const parent = a.parentId ? byId.get(a.parentId) : undefined;
      const ambiguous = nameCount.get(a.name)! > 1 && parent;
      return { value: a.id, label: ambiguous ? `${a.name} · ${parent.name}` : a.name };
    });
  }, [areas, recentAreaIds, areaId]);

  const orientationOptions = useMemo<FilterChipOption[]>(() => {
    const sorted = [...orientations].sort((a, b) => a.sortOrder - b.sortOrder);
    let shown = sorted;
    const many = sorted.length > MAX_INLINE_ORIENTATIONS;
    if (many) {
      const byId = new Map(sorted.map((o) => [o.id, o]));
      const recent: OrientationResponse[] = [];
      for (const id of recentOrientationIds) {
        const o = byId.get(id);
        if (o && !recent.some((r) => r.id === id)) recent.push(o);
        if (recent.length >= RECENT_ORIENTATIONS_WHEN_MANY) break;
      }
      for (const o of sorted) {
        if (recent.length >= RECENT_ORIENTATIONS_WHEN_MANY) break;
        if (!recent.some((r) => r.id === o.id)) recent.push(o);
      }
      shown = recent;
      const selected =
        orientationId && orientationId !== NONE_VALUE ? byId.get(orientationId) : undefined;
      if (selected && !shown.some((s) => s.id === selected.id)) shown = [...shown, selected];
    }
    return shown.map((o) => ({ value: o.id, label: o.name }));
  }, [orientations, recentOrientationIds, orientationId]);

  const areaChipOptions: FilterChipOption[] = [
    ...areaOptions,
    {
      value: OTHER_VALUE,
      label: t('tags.other'),
      ariaLabel: t('tags.otherArea'),
      action: true,
      onSelect: () => setPicker('area'),
    },
  ];
  if (request) {
    areaChipOptions.push({
      value: NEW_VALUE,
      label: t('tags.newArea'),
      action: true,
      onSelect: () => {
        const chip = areaGroupRef.current!.querySelector<HTMLElement>(
          `[data-chip-value="${NEW_VALUE}"]`,
        );
        void request('area', chip).then((created) => {
          if (created) onAreaChange(created.id);
        });
      },
    });
  }

  const orientationChipOptions: FilterChipOption[] = [...orientationOptions];
  if (orientations.length > MAX_INLINE_ORIENTATIONS) {
    orientationChipOptions.push({
      value: OTHER_VALUE,
      label: t('tags.other'),
      ariaLabel: t('tags.otherOrientation'),
      action: true,
      onSelect: () => setPicker('orientation'),
    });
  }
  orientationChipOptions.push({ value: NONE_VALUE, label: t('tags.noOrientation') });
  if (request) {
    orientationChipOptions.push({
      value: NEW_VALUE,
      label: t('tags.newOrientation'),
      action: true,
      onSelect: () => {
        const chip = orientationGroupRef.current!.querySelector<HTMLElement>(
          `[data-chip-value="${NEW_VALUE}"]`,
        );
        void request('orientation', chip).then((created) => {
          if (created) onOrientationChange(created.id);
        });
      },
    });
  }

  return (
    <div className={styles.root} data-tone={tone} data-testid={`${idPrefix}-tag-chips`}>
      <div className={styles.row}>
        <span id={areaLabelId} className={styles.rowLabel}>
          {t('tags.area')}
        </span>
        <FilterChipGroup
          options={areaChipOptions}
          value={areaId ?? ''}
          onChange={(v) => onAreaChange(v === '' ? null : v)}
          labelledBy={areaLabelId}
          layout={layout}
          deselectable
          tone={tone}
          testIdPrefix={`${idPrefix}-area`}
          groupRef={areaGroupRef}
        />
      </div>
      <div className={styles.row}>
        <span id={orientationLabelId} className={styles.rowLabel}>
          {t('tags.orientation')}
        </span>
        <FilterChipGroup
          options={orientationChipOptions}
          value={orientationId ?? ''}
          onChange={(v) => onOrientationChange(v === '' ? null : v)}
          labelledBy={orientationLabelId}
          layout={layout}
          deselectable
          tone={tone}
          testIdPrefix={`${idPrefix}-orientation`}
          groupRef={orientationGroupRef}
        />
      </div>

      <EntityPickerDialog
        open={picker === 'area'}
        title={t('tags.chooseArea')}
        onClose={() => setPicker(null)}
        onPick={(option) => onAreaChange(option.id)}
        returnFocusRef={areaFocus}
        testId={`${idPrefix}-area-picker`}
        picker={{ kind: 'area', areas }}
      />
      <EntityPickerDialog
        open={picker === 'orientation'}
        title={t('tags.chooseOrientation')}
        onClose={() => setPicker(null)}
        onPick={(option) => onOrientationChange(option.id)}
        returnFocusRef={orientationFocus}
        testId={`${idPrefix}-orientation-picker`}
        picker={{ kind: 'orientation', emptyHint: t('tags.noOrientationsHint') }}
      />
    </div>
  );
}
