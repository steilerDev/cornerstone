import { useId } from 'react';
import { useRef } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ManualDiaryEntryType } from '@cornerstone/shared';
import { FilterChipGroup } from '../../FilterChipGroup/FilterChipGroup.js';
import type { FilterChipOption } from '../../FilterChipGroup/FilterChipGroup.js';
import { OverflowMenu } from '../../OverflowMenu/OverflowMenu.js';
import type { OverflowMenuControl } from '../../OverflowMenu/OverflowMenu.js';
import { I18N_UNION_KEYS } from '../../../i18n/unionKeys.js';
import styles from './EntryTypeChips.module.css';

const CHIP_TYPES = ['daily_log', 'site_visit', 'delivery'] as const;
const MENU_TYPES = ['issue', 'general_note'] as const;

export interface EntryTypeChipsProps {
  value: ManualDiaryEntryType;
  onSelect: (type: ManualDiaryEntryType) => void;
  /** The row, so the host can find the pressed chip to return focus to. */
  rowRef?: RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}

/**
 * Entry type: Daily log, Site visit and Delivery as chips, then a "More" chip that opens a menu
 * with Defect and Note. When one of those two is current, the chip shows its name, pressed.
 */
export function EntryTypeChips({ value, onSelect, rowRef, disabled = false }: EntryTypeChipsProps) {
  const { t } = useTranslation('diary');
  const { t: tCommon } = useTranslation('common');
  const labelId = useId();
  const menuControlRef = useRef<OverflowMenuControl | null>(null);
  const label = (type: ManualDiaryEntryType) =>
    tCommon(I18N_UNION_KEYS.statusVocabularyDiaryType.key(type));

  const menuCurrent = (MENU_TYPES as readonly string[]).includes(value);
  const moreLabel = menuCurrent ? label(value) : t('capture.more');
  const options: FilterChipOption[] = CHIP_TYPES.map((type) => ({
    value: type,
    label: label(type),
  }));

  return (
    <div className={styles.root} data-testid="capture-entry-type">
      <span id={labelId} className={styles.label}>
        {t('capture.entryType')}
      </span>
      <fieldset className={styles.fieldset} disabled={disabled}>
        <div className={styles.row} ref={rowRef}>
          <FilterChipGroup
            options={options}
            value={menuCurrent ? '' : value}
            onChange={(next) => {
              if (next) onSelect(next as ManualDiaryEntryType);
            }}
            labelledBy={labelId}
            layout="wrap"
            testIdPrefix="capture-type"
          />
          <OverflowMenu
            usePortal
            placement="bottom-start"
            triggerAriaLabel={
              menuCurrent ? t('capture.moreTypesSelected', { type: moreLabel }) : moreLabel
            }
            disabled={disabled}
            controlRef={menuControlRef}
            data-testid="capture-type-more"
            items={[
              {
                kind: 'choice',
                id: 'entry-type-more',
                label: t('capture.entryType'),
                options: MENU_TYPES.map((type) => ({
                  value: type,
                  label: label(type),
                  testId: `capture-type-${type}`,
                })),
                value: menuCurrent ? value : null,
                onChange: (next) => {
                  menuControlRef.current?.close();
                  onSelect(next as ManualDiaryEntryType);
                },
              },
            ]}
            renderTrigger={(props) => (
              <button
                {...props}
                className={styles.more}
                data-entry-more=""
                data-current={menuCurrent ? 'true' : undefined}
              >
                {moreLabel}
                <span aria-hidden="true">▾</span>
              </button>
            )}
          />
        </div>
      </fieldset>
    </div>
  );
}
