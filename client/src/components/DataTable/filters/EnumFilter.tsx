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

  // Build parent -> children map from hierarchy
  const { parentToChildren, allParents } = (() => {
    if (!hierarchy) return { parentToChildren: new Map(), allParents: new Set<string>() };

    const map = new Map<string, string[]>();
    const parents = new Set<string>();

    for (const item of hierarchy) {
      if (item.parentId) {
        if (!map.has(item.parentId)) {
          map.set(item.parentId, []);
        }
        map.get(item.parentId)!.push(item.id);
      } else {
        parents.add(item.id);
      }
    }

    return { parentToChildren: map, allParents: parents };
  })();

  const handleToggle = useCallback(
    (optionValue: string) => {
      setSelected((prev) => {
        const updated = new Set(prev);

        if (updated.has(optionValue)) {
          updated.delete(optionValue);
          // If this is a parent, remove all children
          const children = parentToChildren.get(optionValue);
          if (children) {
            for (const child of children) {
              updated.delete(child);
            }
          }
        } else {
          updated.add(optionValue);
          // If this is a parent, add all children
          const children = parentToChildren.get(optionValue);
          if (children) {
            for (const child of children) {
              updated.add(child);
            }
          }
        }

        // Auto-apply by calling onChange immediately
        const joined = Array.from(updated).join(',');
        onChange(joined);
        return updated;
      });
    },
    [parentToChildren, onChange],
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

  // Sort options: parents first (in order), then their children indented
  const sortedOptions: Array<{ option: EnumOption; isChild: boolean }> = (() => {
    if (!hierarchy) return options.map((o) => ({ option: o, isChild: false }));

    const result: Array<{ option: EnumOption; isChild: boolean }> = [];
    const optionMap = new Map(options.map((o) => [o.value, o]));

    // First, add all parents in original order
    for (const option of options) {
      if (allParents.has(option.value)) {
        result.push({ option, isChild: false });

        // Then add their children
        const children = parentToChildren.get(option.value) || [];
        for (const childId of children) {
          const childOption = optionMap.get(childId);
          if (childOption) {
            result.push({ option: childOption, isChild: true });
          }
        }
      }
    }

    // Finally, add any options with no parent or child relationship
    for (const option of options) {
      if (!allParents.has(option.value) && !hierarchy.some((h) => h.id === option.value)) {
        result.push({ option, isChild: false });
      }
    }

    return result;
  })();

  // Check if a parent has indeterminate state (some but not all children selected)
  const isIndeterminate = (parentId: string): boolean => {
    const children = parentToChildren.get(parentId);
    if (!children || children.length === 0) return false;

    const selectedChildren = children.filter((c: string) => selected.has(c));
    return selectedChildren.length > 0 && selectedChildren.length < children.length;
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
          <label
            className={styles.filterCheckboxItem}
            htmlFor={`enum-${ENUM_NONE_SENTINEL}`}
          >
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
        {sortedOptions.map(({ option, isChild }) => {
          const isParent = allParents.has(option.value);

          return (
            <label
              key={option.value}
              className={`${styles.filterCheckboxItem} ${isChild ? styles.filterCheckboxIndented : ''}`}
              htmlFor={`enum-${option.value}`}
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
