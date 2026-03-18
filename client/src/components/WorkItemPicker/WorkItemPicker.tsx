import { useTranslation } from 'react-i18next';
import type { WorkItemSummary, WorkItemStatus } from '@cornerstone/shared';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { SearchPicker } from '../SearchPicker/index.js';

/** Maps work item status values to their CSS custom property for the left-border color. */
const STATUS_BORDER_COLORS: Record<WorkItemStatus, string> = {
  not_started: 'var(--color-status-not-started-text)',
  in_progress: 'var(--color-status-in-progress-text)',
  completed: 'var(--color-status-completed-text)',
};

export type { SpecialOption } from '../SearchPicker/index.js';

export interface WorkItemPickerProps {
  value: string;
  onChange: (id: string) => void;
  onSelectItem?: (item: { id: string; title: string }) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
  /** Options rendered at top of dropdown (e.g. "This item"). These bypass excludeIds. */
  specialOptions?: { id: string; label: string }[];
  /** When true, opens dropdown with initial results on focus without requiring typing. */
  showItemsOnFocus?: boolean;
  /**
   * Title to display when `value` is pre-populated from an external source
   * (e.g. editing an existing record with a linked work item).
   * When provided and `value` is non-empty, the picker renders in selected-display mode
   * showing this title until the user clears or changes the selection.
   */
  initialTitle?: string;
}

export function WorkItemPicker({
  value,
  onChange,
  onSelectItem,
  excludeIds,
  disabled = false,
  placeholder,
  specialOptions,
  showItemsOnFocus,
  initialTitle,
}: WorkItemPickerProps) {
  const { t } = useTranslation('workItems');
  const resolvedPlaceholder = placeholder ?? t('picker.placeholder');

  const handleSelectItem = (item: { id: string; label: string }) => {
    onSelectItem?.({ id: item.id, title: item.label });
  };

  return (
    <SearchPicker<WorkItemSummary>
      value={value}
      onChange={onChange}
      onSelectItem={handleSelectItem}
      excludeIds={excludeIds}
      disabled={disabled}
      placeholder={resolvedPlaceholder}
      searchFn={async (query: string, ids: string[]) => {
        const response = await listWorkItems({
          q: query || undefined,
          pageSize: 15,
        });
        return response.items.filter((item) => !ids.includes(item.id));
      }}
      renderItem={(item) => ({ id: item.id, label: item.title })}
      getStatusBorderColor={(item) => STATUS_BORDER_COLORS[item.status]}
      specialOptions={specialOptions}
      showItemsOnFocus={showItemsOnFocus}
      initialTitle={initialTitle}
      emptyHint={t('picker.emptyHint')}
      noResultsMessage={t('picker.noResults')}
      loadErrorMessage={t('picker.loadError')}
      searchErrorMessage={t('picker.searchError')}
    />
  );
}
