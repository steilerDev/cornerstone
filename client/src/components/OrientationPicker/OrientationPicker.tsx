import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrientationResponse } from '@cornerstone/shared';
import { fetchOrientations } from '../../lib/orientationApi.js';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import type { SearchPickerProps } from '../SearchPicker/SearchPicker.js';

export interface OrientationPickerProps extends Omit<
  SearchPickerProps<OrientationResponse>,
  'searchFn' | 'renderItem' | 'excludeIds'
> {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  nullable?: boolean;
  initialOrientationName?: string;
}

export function OrientationPicker({
  value,
  onChange,
  disabled = false,
  nullable = false,
  initialOrientationName,
  ...rest
}: OrientationPickerProps) {
  const { t } = useTranslation('common');

  const searchFn = useCallback(async (query: string): Promise<OrientationResponse[]> => {
    const resp = await fetchOrientations(query ? { search: query } : undefined);
    return resp.orientations;
  }, []);

  const renderItem = (o: OrientationResponse) => ({ id: o.id, label: o.name });
  const renderSecondary = (o: OrientationResponse) => o.description ?? null;

  return (
    <SearchPicker<OrientationResponse>
      value={value}
      onChange={onChange}
      excludeIds={[]}
      disabled={disabled}
      searchFn={searchFn}
      renderItem={renderItem}
      renderSecondary={renderSecondary}
      initialTitle={initialOrientationName}
      showItemsOnFocus={true}
      placeholder={t('aria.selectOrientation')}
      specialOptions={nullable ? [{ id: '', label: t('aria.noOrientation') }] : undefined}
      {...rest}
    />
  );
}

export default OrientationPicker;
