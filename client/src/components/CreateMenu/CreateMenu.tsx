import { useHref } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { isPlainLeftClick } from '../../lib/plainClick.js';
import { createHref, visibleCreateEntries } from '../../navigation/createEntries.js';
import { useRealLocationKey } from '../../navigation/realLocation.js';
import { useOpenCreate } from '../../navigation/useOpenCreate.js';
import { OverflowMenu } from '../OverflowMenu/OverflowMenu.js';
import type { OverflowMenuEntry } from '../OverflowMenu/OverflowMenu.js';
import { useCreateMenuShell } from './CreateMenuContext.js';
import styles from './CreateMenu.module.css';

export interface CreateMenuProps {
  /** Class of the trigger button (the top bar styles it as a secondary button). */
  readonly triggerClassName?: string;
}

/**
 * The desktop New menu: a "New ▾" trigger and the panel of create entries. Order, Money-only
 * rows and context pre-fill come from navigation/createEntries.ts.
 */
export function CreateMenu({ triggerClassName }: CreateMenuProps) {
  const { t } = useTranslation('common');
  const { prefill, moneyPage, controlRef } = useCreateMenuShell();
  const openCreate = useOpenCreate();
  const realKey = useRealLocationKey();
  const base = useHref('/').replace(/\/$/, '');

  const entries: OverflowMenuEntry[] = visibleCreateEntries(moneyPage).flatMap((id) => {
    const row: OverflowMenuEntry = {
      kind: 'link',
      id,
      label: t(I18N_UNION_KEYS.createMenuEntry.key(id)),
      href: `${base}${createHref(id, prefill)}`,
      onClick: (event) => {
        if (!isPlainLeftClick(event)) return;
        event.preventDefault();
        openCreate(id, { createOpener: true });
      },
      testId: `create-menu-${id}`,
    };
    return id === 'fundingSource' ? [{ kind: 'separator', id: 'sep-money' }, row] : [row];
  });

  return (
    <OverflowMenu
      items={entries}
      triggerAriaLabel={t('topBar.new')}
      menuClassName={styles.panel}
      menuTestId="create-menu"
      closeSignal={realKey}
      controlRef={controlRef}
      renderTrigger={(triggerProps) => (
        <button
          {...triggerProps}
          aria-label={undefined}
          className={triggerClassName}
          data-testid="top-bar-new"
          data-create-trigger=""
        >
          <span>{t('topBar.new')}</span>
          <span aria-hidden="true">▾</span>
        </button>
      )}
    />
  );
}

export default CreateMenu;
