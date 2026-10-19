import { useCallback, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { foldSearchText } from '@cornerstone/shared';
import type { HistoryObjectType, SearchResultType } from '@cornerstone/shared';
import { FilterChipGroup } from '../../components/FilterChipGroup/FilterChipGroup.js';
import { SearchPicker } from '../../components/SearchPicker/SearchPicker.js';
import { searchEverywhere } from '../../lib/searchApi.js';
import { fetchSubsidyPrograms } from '../../lib/subsidyProgramsApi.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import styles from './HistoryObjectFilter.module.css';

export interface HistoryObjectValue {
  entityType: HistoryObjectType;
  entityId: string;
}

interface HistoryObjectOption {
  kind: HistoryObjectType;
  id: string;
  name: string;
  secondary: string | null;
}

export interface HistoryObjectFilterProps {
  object: HistoryObjectValue | null;
  /** Live name echoed by the API (or null when unnamed / not loaded yet). */
  objectName: string | null;
  /** False: the object is gone. Null: unknown (not loaded yet). */
  objectExists: boolean | null;
  onChange: (object: HistoryObjectValue | null) => void;
}

const SEARCH_KINDS: readonly { type: SearchResultType; kind: HistoryObjectType }[] = [
  { type: 'work_item', kind: 'work_item' },
  { type: 'milestone', kind: 'milestone' },
  { type: 'invoice', kind: 'invoice' },
];

const MIN_QUERY_LENGTH = 2;

/** Object action chip with an inline picker over tasks, milestones, invoices and grants. */
export function HistoryObjectFilter({
  object,
  objectName,
  objectExists,
  onChange,
}: HistoryObjectFilterProps) {
  const { t } = useTranslation(['history', 'diary']);
  const rowId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const grantsRef = useRef<Promise<HistoryObjectOption[]> | null>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ key: string; label: string } | null>(null);

  const objectKey = object ? `${object.entityType}:${object.entityId}` : '';

  const focusChip = () => {
    requestAnimationFrame(() => {
      groupRef.current?.querySelector<HTMLElement>('button')?.focus();
    });
  };

  const loadGrants = useCallback((): Promise<HistoryObjectOption[]> => {
    grantsRef.current ??= fetchSubsidyPrograms()
      .then((response) =>
        response.subsidyPrograms.map((program): HistoryObjectOption => ({
          kind: 'subsidy_program',
          id: program.id,
          name: program.name,
          secondary: null,
        })),
      )
      .catch(() => {
        grantsRef.current = null;
        return [];
      });
    return grantsRef.current;
  }, []);

  const searchFn = useCallback(
    async (query: string, _exclude: string[], signal: AbortSignal) => {
      const trimmed = query.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) return [];
      const [response, grants] = await Promise.all([
        searchEverywhere({ q: trimmed, types: SEARCH_KINDS.map((k) => k.type), limit: 8 }, signal),
        loadGrants(),
      ]);
      const options: HistoryObjectOption[] = [];
      for (const { type, kind } of SEARCH_KINDS) {
        const group = response.groups.find((g) => g.type === type);
        for (const item of group?.items ?? []) {
          options.push({
            kind,
            id: item.id,
            name: item.label ?? t('event.noNumber', { ns: 'diary' }),
            secondary: item.sublabel,
          });
        }
      }
      const needle = foldSearchText(trimmed);
      for (const grant of grants) {
        if (foldSearchText(grant.name).includes(needle)) options.push(grant);
      }
      return options;
    },
    [loadGrants, t],
  );

  const displayName = (): string => {
    if (!object) return '';
    if (objectExists === false) return t('filters.objectGone');
    const name = picked?.key === objectKey ? picked.label : objectName;
    if (!name)
      return t(I18N_UNION_KEYS.historyObjectType.key(object.entityType), { ns: 'history' });
    if (object.entityType === 'invoice') {
      return t('event.heading.objectNumber', {
        ns: 'diary',
        object: t('event.object.invoice', { ns: 'diary' }),
        number: name,
      });
    }
    return name;
  };

  const handleRowKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    focusChip();
  };

  const toggleRow = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      requestAnimationFrame(() => {
        rowRef.current?.querySelector<HTMLElement>('input')?.focus();
      });
    }
  };

  return (
    <div className={styles.root} data-testid="history-object-filter">
      <FilterChipGroup
        options={[
          {
            value: 'object',
            label: object
              ? t('filters.objectPicked', { name: displayName() })
              : t('filters.object'),
            action: true,
            actionPressed: object !== null,
            ariaExpanded: open,
            ariaControls: rowId,
            onSelect: toggleRow,
            trailing: object ? ' ×' : undefined,
          },
        ]}
        value=""
        onChange={() => {}}
        ariaLabel={t('filters.object')}
        layout="wrap"
        groupRef={groupRef}
        testIdPrefix="history-object"
      />
      <div
        id={rowId}
        ref={rowRef}
        className={styles.row}
        hidden={!open}
        onKeyDown={handleRowKeyDown}
      >
        <SearchPicker<HistoryObjectOption>
          value={objectKey}
          initialTitle={objectName ?? undefined}
          excludeIds={[]}
          placeholder={t('filters.objectSearchLabel')}
          inputAriaProps={{ 'aria-label': t('filters.objectSearchLabel') }}
          searchFn={searchFn}
          renderItem={(item) => ({ id: `${item.kind}:${item.id}`, label: item.name })}
          renderSecondary={(item) => {
            const kindLabel = t(I18N_UNION_KEYS.historyObjectType.key(item.kind), {
              ns: 'history',
            });
            return item.secondary ? `${kindLabel} · ${item.secondary}` : kindLabel;
          }}
          onSelectItem={(item) => setPicked({ key: item.id, label: item.label })}
          onChange={(id) => {
            if (id === '') {
              onChange(null);
              return;
            }
            const separator = id.indexOf(':');
            onChange({
              entityType: id.slice(0, separator) as HistoryObjectType,
              entityId: id.slice(separator + 1),
            });
            setOpen(false);
            focusChip();
          }}
        />
      </div>
    </div>
  );
}
