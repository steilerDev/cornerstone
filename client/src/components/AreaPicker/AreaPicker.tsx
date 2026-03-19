import { useTranslation } from 'react-i18next';
import type { AreaResponse } from '@cornerstone/shared';
import styles from './AreaPicker.module.css';

interface TreeNode {
  depth: number;
  area: AreaResponse;
}

/**
 * Builds a depth-first ordered tree from a flat list of areas.
 * Areas are ordered by depth, then by sortOrder, then by name.
 */
function buildTree(areas: AreaResponse[]): TreeNode[] {
  const areaMap = new Map(areas.map((a) => [a.id, a]));
  const visited = new Set<string>();
  const result: TreeNode[] = [];

  /**
   * Recursively add area and its children to result.
   */
  function addNode(area: AreaResponse, depth: number) {
    if (visited.has(area.id)) return;
    visited.add(area.id);
    result.push({ depth, area });

    // Add children sorted by sortOrder, then name
    const children = areas
      .filter((a) => a.parentId === area.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    for (const child of children) {
      addNode(child, depth + 1);
    }
  }

  // Start with top-level areas (no parent)
  const topLevel = areas
    .filter((a) => !a.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  for (const area of topLevel) {
    addNode(area, 0);
  }

  return result;
}

export interface AreaPickerProps {
  areas: AreaResponse[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  nullable?: boolean;
}

export function AreaPicker({
  areas,
  value,
  onChange,
  disabled = false,
  nullable = false,
}: AreaPickerProps) {
  const { t } = useTranslation('common');
  const tree = buildTree(areas);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={styles.select}
      aria-label={t('aria.selectArea')}
    >
      {nullable && <option value="">{t('aria.noArea')}</option>}

      {tree.map(({ depth, area }) => (
        <option key={area.id} value={area.id}>
          {/* Indent by depth using em-dash and non-breaking space */}
          {depth > 0 && '\u2014\u00a0'.repeat(depth)}
          {area.name}
        </option>
      ))}
    </select>
  );
}

export default AreaPicker;
