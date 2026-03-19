import { useTranslation } from 'react-i18next';
import type { AreaResponse } from '@cornerstone/shared';
import { buildTree } from '../../lib/areaTreeUtils.js';
import styles from './AreaPicker.module.css';

export interface AreaPickerProps {
  areas: AreaResponse[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  nullable?: boolean;
}

export function AreaPicker({
  areas,
  value,
  onChange,
  disabled = false,
  nullable = false,
}: AreaPickerProps) {
  const { t } = useTranslation('common');
  const tree = buildTree(areas);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={styles.select}
      aria-label={t('aria.selectArea')}
    >
      {nullable && <option value="">{t('aria.noArea')}</option>}

      {tree.map(({ depth, area }) => (
        <option key={area.id} value={area.id}>
          {/* Indent by depth using em-dash and non-breaking space */}
          {depth > 0 && '\u2014\u00a0'.repeat(depth)}
          {area.name}
        </option>
      ))}
    </select>
  );
}

export default AreaPicker;
