import { useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { HOME_HIDEABLE_SECTION_IDS } from '@cornerstone/shared';
import type { HomeHideableSectionId } from '@cornerstone/shared';
import { Modal } from '../../components/Modal/Modal.js';
import { Sheet } from '../../components/Modal/Sheet.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import shared from '../../styles/shared.module.css';
import styles from './HomePage.module.css';

export interface CustomizeDialogProps {
  hidden: readonly HomeHideableSectionId[];
  onChange: (hidden: HomeHideableSectionId[]) => void;
  onClose: () => void;
  /** The page ⋯ menu trigger. */
  returnFocusRef: RefObject<HTMLElement | null>;
}

/** Choose which Home sections show. Changes save at once; Needs attention always shows. */
export function CustomizeDialog({
  hidden,
  onChange,
  onClose,
  returnFocusRef,
}: CustomizeDialogProps) {
  const { t } = useTranslation('home');
  const wide = useMediaQuery('(min-width: 768px)');
  const sheetId = useId();
  const doneRef = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const sectionSet = I18N_UNION_KEYS.homeSection;

  const toggle = (id: HomeHideableSectionId, show: boolean) => {
    const next = show ? hidden.filter((h) => h !== id) : [...hidden, id];
    onChange(HOME_HIDEABLE_SECTION_IDS.filter((section) => next.includes(section)));
    const section = t(sectionSet.key(id));
    setAnnouncement(show ? t('customize.shown', { section }) : t('customize.hidden', { section }));
  };

  const body = (
    <div className={styles.customizeBody}>
      <p className={styles.muted}>{t('customize.intro')}</p>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{t('customize.legend')}</legend>
        {HOME_HIDEABLE_SECTION_IDS.map((id) => (
          <label key={id} className={styles.checkRow}>
            <input
              type="checkbox"
              checked={!hidden.includes(id)}
              onChange={(event) => toggle(id, event.target.checked)}
              data-testid={`home-customize-${id}`}
            />
            <span>{t(sectionSet.key(id))}</span>
          </label>
        ))}
        <p className={styles.muted}>{t('customize.attentionAlways')}</p>
      </fieldset>
      <div role="status" className={shared.srOnly}>
        {announcement}
      </div>
    </div>
  );

  const footer = (
    <button
      ref={doneRef}
      type="button"
      className={shared.btnPrimary}
      onClick={onClose}
      data-testid="home-customize-done"
    >
      {t('customize.done')}
    </button>
  );

  return wide ? (
    <Modal
      title={t('customize.title')}
      onClose={onClose}
      footer={footer}
      returnFocusRef={returnFocusRef}
    >
      {body}
    </Modal>
  ) : (
    <Sheet
      id={sheetId}
      open
      onClose={onClose}
      title={t('customize.title')}
      variant="bottom"
      footer={footer}
      returnFocusRef={returnFocusRef}
      restoreFocusOnUnmount
      testId="home-customize-sheet"
    >
      {body}
    </Sheet>
  );
}
