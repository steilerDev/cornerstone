import { useTranslation } from 'react-i18next';
import { SearchPicker, type SearchPickerProps } from '../../SearchPicker/SearchPicker.js';

export interface EntityFilterProps<T> {
  value: string;
  onChange: (value: string) => void;
  searchFn: SearchPickerProps<T>['searchFn'];
  renderItem: SearchPickerProps<T>['renderItem'];
  placeholder?: string;
}

/**
 * Entity selector filter using SearchPicker
 * Allows searching and selecting from related entities
 */
export function EntityFilter<T>({
  value,
  onChange,
  searchFn,
  renderItem,
  placeholder,
}: EntityFilterProps<T>) {
  const { t } = useTranslation('common');

  return (
    <SearchPicker<T>
      value={value}
      onChange={onChange}
      excludeIds={[]}
      searchFn={searchFn}
      renderItem={renderItem}
      placeholder={placeholder || t('dataTable.filter.searchPlaceholder')}
      showItemsOnFocus
    />
  );
}
