import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SEARCH_QUERY_MIN_LENGTH } from '@cornerstone/shared';
import type { SearchResultItem } from '@cornerstone/shared';
import { searchEverywhere } from '../../lib/searchApi.js';
import { AreaBreadcrumb } from '../AreaBreadcrumb/index.js';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import type { SearchPickerInputAriaProps } from '../SearchPicker/SearchPicker.js';
import type { CostLineItemType, CostLineTarget } from '../CostLineTable/types.js';

type TargetOption = SearchResultItem & { readonly type: CostLineItemType };

const SEARCH_LIMIT = 10;

export function targetOptionId(target: Pick<CostLineTarget, 'type' | 'id'>): string {
  return `${target.type}:${target.id}`;
}

export interface CostLineTargetPickerProps {
  readonly id?: string;
  readonly value: CostLineTarget | null;
  readonly onChange: (target: CostLineTarget | null) => void;
  /** Option ids (`type:id`) that cannot be picked. */
  readonly excludeIds?: string[];
  readonly placeholder?: string;
  readonly inputAriaProps?: SearchPickerInputAriaProps;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly testId?: string;
}

const NO_EXCLUDED: string[] = [];

/**
 * The one picker for "which task or purchase does this cost line belong to" (D9): one search over
 * both kinds, with the kind word and the area path as secondary text. P4.4's entity picker later
 * replaces its internals.
 */
export function CostLineTargetPicker({
  id,
  value,
  onChange,
  excludeIds = NO_EXCLUDED,
  placeholder,
  inputAriaProps,
  disabled,
  autoFocus,
  testId,
}: CostLineTargetPickerProps) {
  const { t } = useTranslation('costLines');
  // The option rows by id, so a selection resolves back to the target it stands for.
  const seenRef = useRef(new Map<string, TargetOption>());

  const search = async (query: string, excluded: string[], signal: AbortSignal) => {
    if (query.trim().length < SEARCH_QUERY_MIN_LENGTH) return [];
    const response = await searchEverywhere(
      { q: query.trim(), types: ['work_item', 'household_item'], limit: SEARCH_LIMIT },
      signal,
    );
    const options: TargetOption[] = [];
    for (const group of response.groups) {
      if (group.type !== 'work_item' && group.type !== 'household_item') continue;
      for (const item of group.items) {
        const option: TargetOption = { ...item, type: group.type };
        seenRef.current.set(targetOptionId({ type: group.type, id: item.id }), option);
        if (!excluded.includes(targetOptionId({ type: group.type, id: item.id }))) {
          options.push(option);
        }
      }
    }
    return options;
  };

  const handleChange = (optionId: string) => {
    if (optionId === '') {
      onChange(null);
      return;
    }
    const option = seenRef.current.get(optionId);
    if (option) {
      onChange({ type: option.type, id: option.id, label: option.label ?? '', area: null });
    }
  };

  return (
    <div data-testid={testId}>
      <SearchPicker<TargetOption>
        id={id}
        value={value ? targetOptionId(value) : ''}
        onChange={handleChange}
        excludeIds={excludeIds}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder ?? t('form.belongsToPlaceholder')}
        emptyHint={t('target.typeMore')}
        noResultsMessage={t('target.noResults')}
        searchFn={search}
        renderItem={(item) => ({ id: targetOptionId(item), label: item.label ?? '' })}
        renderSecondary={(item) => (
          <>
            {item.type === 'work_item' ? t('target.kindTask') : t('target.kindPurchase')}
            {item.areaPath && item.areaPath.length > 0 ? (
              <>
                {' · '}
                <AreaBreadcrumb variant="path" segments={item.areaPath} />
              </>
            ) : null}
          </>
        )}
        initialTitle={value?.label}
        inputAriaProps={inputAriaProps}
      />
    </div>
  );
}
