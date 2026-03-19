import type { TradeResponse } from '@cornerstone/shared';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import type { SearchPickerProps } from '../SearchPicker/SearchPicker.js';

export interface TradePickerProps
  extends Omit<
    SearchPickerProps<TradeResponse>,
    'searchFn' | 'renderItem' | 'excludeIds'
  > {
  trades: TradeResponse[];
}

export function TradePicker({
  trades,
  value,
  onChange,
  onSelectItem,
  disabled = false,
  placeholder,
  initialTitle,
  ...rest
}: TradePickerProps) {
  const searchFn = async (query: string): Promise<TradeResponse[]> => {
    const lowerQuery = query.toLowerCase();
    return trades.filter((trade) =>
      trade.name.toLowerCase().includes(lowerQuery)
    );
  };

  const renderItem = (trade: TradeResponse) => ({
    id: trade.id,
    label: trade.name,
  });

  return (
    <SearchPicker<TradeResponse>
      value={value}
      onChange={onChange}
      onSelectItem={onSelectItem}
      excludeIds={[]}
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
