import { useTranslation } from 'react-i18next';
import type { AreaAncestor, AreaResponse, AreaSummary } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../components/AreaBreadcrumb/index.js';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import type { ObjectFormRenderContext } from '../components/ObjectForm/types.js';
import styles from './objectForms.module.css';

/** The area with its ancestor trail, for the breadcrumb preview. */
export function buildAreaSummary(
  areaId: string,
  areas: ReadonlyArray<{ id: string; name: string; parentId: string | null; color: string | null }>,
): AreaSummary | null {
  const area = areas.find((a) => a.id === areaId);
  if (!area) return null;

  const ancestors: AreaAncestor[] = [];
  let current = areas.find((a) => a.id === area.parentId);
  while (current) {
    ancestors.unshift({ id: current.id, name: current.name, color: current.color });
    const parentId: string | null = current.parentId;
    current = areas.find((a) => a.id === parentId);
  }

  return { id: area.id, name: area.name, color: area.color, ancestors };
}

export interface AreaFieldProps {
  readonly ctx: ObjectFormRenderContext;
  readonly areas: AreaResponse[];
  /** Show the area trail under the picker. */
  readonly preview?: boolean;
}

/** Optional area picker for an ObjectForm field named `area` (value is the area id or ''). */
export function AreaField({ ctx, areas, preview = false }: AreaFieldProps) {
  const { t } = useTranslation('common');
  const areaId = typeof ctx.value === 'string' ? ctx.value : '';
  return (
    <>
      <EntityPicker
        kind="area"
        id={ctx.id}
        areas={areas}
        value={areaId}
        onChange={ctx.setValue}
        disabled={ctx.busy}
        noneLabel={t('aria.noArea')}
      />
      {preview && areaId && (
        <div className={styles.areaPreview}>
          <AreaBreadcrumb area={buildAreaSummary(areaId, areas)} variant="default" />
        </div>
      )}
    </>
  );
}
