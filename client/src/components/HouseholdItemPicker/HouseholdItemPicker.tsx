import type { HouseholdItemSummary, HouseholdItemStatus } from '@cornerstone/shared';
import { listHouseholdItems } from '../../lib/householdItemsApi.js';
import { SearchPicker } from '../SearchPicker/index.js';

/** Maps household item status values to their CSS custom property for the left-border color. */
const STATUS_BORDER_COLORS: Record<HouseholdItemStatus, string> = {
  planned: 'var(--color-status-not-started-text)',
  purchased: 'var(--color-status-in-progress-text)',
  scheduled: 'var(--color-status-in-progress-text)',
  arrived: 'var(--color-status-completed-text)',
};

export interface HouseholdItemPickerProps {
  value: string;
  onChange: (id: string) => void;
  onSelectItem?: (item: { id: string; name: string }) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
  /** When true, opens dropdown with initial results on focus without requiring typing. */
  showItemsOnFocus?: boolean;
  /**
   * Title to display when `value` is pre-populated from an external source
   * (e.g. editing an existing record with a linked household item).
   * When provided and `value` is non-empty, the picker renders in selected-display mode
   * showing this title until the user clears or changes the selection.
   */
  initialTitle?: string;
}

export function HouseholdItemPicker({
  value,
  onChange,
  onSelectItem,
  excludeIds,
  disabled = false,
  placeholder = 'Search household items...',
  showItemsOnFocus,
  initialTitle,
}: HouseholdItemPickerProps) {
  const handleSelectItem = (item: { id: string; label: string }) => {
    onSelectItem?.({ id: item.id, name: item.label });
  };

  return (
    <SearchPicker<HouseholdItemSummary>
      value={value}
      onChange={onChange}
      onSelectItem={handleSelectItem}
      excludeIds={excludeIds}
      disabled={disabled}
      placeholder={placeholder}
      searchFn={async (query: string, ids: string[]) => {
        const response = await listHouseholdItems({
          q: query || undefined,
          pageSize: 15,
        });
        return response.items.filter((item) => !ids.includes(item.id));
      }}
      renderItem={(item) => ({ id: item.id, label: item.name })}
      getStatusBorderColor={(item) => STATUS_BORDER_COLORS[item.status]}
      showItemsOnFocus={showItemsOnFocus}
      initialTitle={initialTitle}
      emptyHint="Type to search household items"
      noResultsMessage="No matching household items found"
      loadErrorMessage="Failed to load household items"
      searchErrorMessage="Failed to search household items"
    />
  );
}
