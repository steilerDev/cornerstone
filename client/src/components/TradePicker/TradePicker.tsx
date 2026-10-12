import { useTranslation } from 'react-i18next';
import type { TradeResponse } from '@cornerstone/shared';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import type { SearchPickerProps } from '../SearchPicker/SearchPicker.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';

export interface TradePickerProps extends Omit<
  SearchPickerProps<TradeResponse>,
  'searchFn' | 'renderItem' | 'excludeIds'
> {
  trades: TradeResponse[];
  /** Trade ids that are not offered (e.g. the trade being merged away). */
  excludeIds?: string[];
}

const NO_EXCLUDED: string[] = [];

export function TradePicker({
  trades,
  excludeIds = NO_EXCLUDED,
  value,
  onChange,
  onSelectItem,
  disabled = false,
  placeholder,
  initialTitle,
  ...rest
}: TradePickerProps) {
  const { t } = useTranslation('settings');

  const searchFn = async (query: string): Promise<TradeResponse[]> => {
    const lowerQuery = query.toLowerCase();
    return trades.filter(
      (trade) =>
        !excludeIds.includes(trade.id) &&
        (trade.name.toLowerCase().includes(lowerQuery) ||
          getCategoryDisplayName(t, trade.name, trade.translationKey)
            .toLowerCase()
            .includes(lowerQuery)),
    );
  };

  const renderItem = (trade: TradeResponse) => ({
    id: trade.id,
    label: getCategoryDisplayName(t, trade.name, trade.translationKey),
  });

  return (
    <SearchPicker<TradeResponse>
      value={value}
      onChange={onChange}
      onSelectItem={onSelectItem}
      excludeIds={excludeIds}
      disabled={disabled}
      placeholder={placeholder}
      searchFn={searchFn}
      renderItem={renderItem}
      initialTitle={initialTitle}
      showItemsOnFocus={true}
      {...rest}
    />
  );
}

export default TradePicker;
