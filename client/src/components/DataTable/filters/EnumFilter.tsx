import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnumOption, EnumHierarchyItem } from '../DataTable.js';
import styles from './Filter.module.css';

export const ENUM_NONE_SENTINEL = '__none__';

export interface EnumFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: EnumOption[];
  hierarchy?: EnumHierarchyItem[];
  enumIncludeNone?: boolean;
  /** Already-translated label shown in the "none" sentinel row */
  enumNoneLabel?: string;
  /** Used as aria-label on the sentinel checkbox (already translated) */
  enumNoneDescription?: string;
}

/**
 * Checkbox list filter for enum/select values
 * Stores as comma-separated values
 * Auto-applies on checkbox change
 * Supports hierarchical options (parent-child relationships)
 * Optionally includes a "none" sentinel option for filtering items with null values
 */
export function EnumFilter({
  value,
  onChange,
  options,
  hierarchy,
  enumIncludeNone,
  enumNoneLabel,
  enumNoneDescription,
}: EnumFilterProps) {
  const { t } = useTranslation('common');

  const parseValue = (v: string) => new Set(v ? v.split(',') : []);
  const [selected, setSelected] = useState(parseValue(value));

  // Build childrenOf map from hierarchy for arbitrary depth support
  const childrenOf = new Map<string | null, string[]>();
  if (hierarchy) {
    for (const item of hierarchy) {
      const key = item.parentId ?? null;
      if (!childrenOf.has(key)) {
        childrenOf.set(key, []);
      }
      childrenOf.get(key)!.push(item.id);
    }
  }

  // Recursively get all descendants of an ID (arbitrary depth)
  const allDescendantsOf = useCallback(
    (id: string): string[] => {
      const result: string[] = [];
      const stack = [id];
      while (stack.length > 0) {
        const current = stack.pop()!;
        const children = childrenOf.get(current) ?? [];
        for (const child of children) {
          result.push(child);
          stack.push(child);
        }
      }
      return result;
    },
    [childrenOf],
  );

  const handleToggle = useCallback(
    (optionValue: string) => {
      setSelected((prev) => {
        const updated = new Set(prev);
        if (updated.has(optionValue)) {
          updated.delete(optionValue);
          for (const desc of allDescendantsOf(optionValue)) updated.delete(desc);
        } else {
          updated.add(optionValue);
          for (const desc of allDescendantsOf(optionValue)) updated.add(desc);
        }
        onChange(Array.from(updated).join(','));
        return updated;
      });
    },
    [allDescendantsOf, onChange],
  );

  const handleSelectAll = useCallback(() => {
    // Note: sentinel is excluded from "select all" — it has no hierarchy and is semantically distinct
    const allValues = options.map((opt) => opt.value);
    setSelected(new Set(allValues));
    onChange(allValues.join(','));
  }, [options, onChange]);

  const handleSelectNone = useCallback(() => {
    setSelected(new Set());
    onChange('');
  }, [onChange]);

  // Depth-first walk of hierarchy to build visible rows with depth tracking
  const visibleRows: Array<{ option: EnumOption; depth: number; isParent: boolean }> = (() => {
    if (!hierarchy) {
      return options.map((o) => ({ option: o, depth: 0, isParent: false }));
    }

    const optionMap = new Map(options.map((o) => [o.value, o]));
    const result: Array<{ option: EnumOption; depth: number; isParent: boolean }> = [];

    function walk(id: string, depth: number): void {
      const option = optionMap.get(id);
      if (!option) return;
      const children = childrenOf.get(id) ?? [];
      const isParent = children.length > 0;
      result.push({ option, depth, isParent });
      for (const childId of children) walk(childId, depth + 1);
    }

    // Walk from all root nodes (parentId = null)
    const roots = childrenOf.get(null) ?? [];
    for (const rootId of roots) walk(rootId, 0);

    // Add any options that appear in the flat options list but aren't in the hierarchy
    const inHierarchy = new Set(hierarchy.map((h) => h.id));
    for (const option of options) {
      if (!inHierarchy.has(option.value)) {
        result.push({ option, depth: 0, isParent: false });
      }
    }

    return result;
  })();

  // A parent checkbox is indeterminate when the group is in a mixed state:
  // neither "fully selected" (self + all descendants) nor "fully unselected"
  // (self + no descendants). Any other combination shows the indeterminate mark.
  const isIndeterminate = (parentId: string): boolean => {
    const descendants = allDescendantsOf(parentId);
    if (descendants.length === 0) return false;
    const selfSelected = selected.has(parentId);
    const selectedCount = descendants.filter((d) => selected.has(d)).length;
    const allDescSelected = selectedCount === descendants.length;
    const noneDescSelected = selectedCount === 0;

    // Fully checked
    if (selfSelected && allDescSelected) return false;
    // Fully unchecked
    if (!selfSelected && noneDescSelected) return false;
    // Any mix
    return true;
  };

  // Set indeterminate state on parent checkboxes
  const parentCheckboxRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  return (
    <div className={styles.filterContent}>
      <div className={styles.filterQuickActions}>
        <button type="button" className={styles.filterQuickActionButton} onClick={handleSelectAll}>
          {t('dataTable.filter.selectAll')}
        </button>
        <button type="button" className={styles.filterQuickActionButton} onClick={handleSelectNone}>
          {t('dataTable.filter.selectNone')}
        </button>
      </div>
      {enumIncludeNone && enumNoneLabel && (
        <div className={styles.filterCheckboxSentinel}>
          <label className={styles.filterCheckboxItem} htmlFor={`enum-${ENUM_NONE_SENTINEL}`}>
            <input
              type="checkbox"
              checked={selected.has(ENUM_NONE_SENTINEL)}
              onChange={() => handleToggle(ENUM_NONE_SENTINEL)}
              className={styles.filterCheckbox}
              id={`enum-${ENUM_NONE_SENTINEL}`}
              aria-label={enumNoneDescription ?? enumNoneLabel}
            />
            <span className={`${styles.filterCheckboxLabel} ${styles.filterCheckboxLabelNone}`}>
              {enumNoneLabel}
            </span>
          </label>
        </div>
      )}
      <div className={styles.filterCheckboxGroup}>
        {visibleRows.map(({ option, depth, isParent }) => {
          return (
            <label
              key={option.value}
              className={styles.filterCheckboxItem}
              htmlFor={`enum-${option.value}`}
              style={{ '--enum-depth': depth } as React.CSSProperties}
            >
              <input
                ref={(el) => {
                  if (el && isParent) {
                    parentCheckboxRefs.current.set(option.value, el);
                    el.indeterminate = isIndeterminate(option.value);
                  } else if (isParent) {
                    parentCheckboxRefs.current.delete(option.value);
                  }
                }}
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => handleToggle(option.value)}
                className={styles.filterCheckbox}
                id={`enum-${option.value}`}
                aria-label={isParent ? `${option.label} (group)` : option.label}
              />
              <span className={styles.filterCheckboxLabel}>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
