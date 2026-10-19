import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { CREATE_TARGETS, visibleCreateEntries } from '../../navigation/createEntries.js';
import type { CreateEntryId } from '../../navigation/createEntries.js';
import type { QuickLogMode } from '../../navigation/createQuery.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useCreateEntryLink } from '../../navigation/useOpenCreate.js';
import { Sheet } from '../Modal/Sheet.js';
import { useCreateMenuShell } from './CreateMenuContext.js';
import { QuickLogTiles } from './QuickLogTiles.js';
import { readLastQuickLog, writeLastQuickLog } from './quickLogStorage.js';
import styles from './CreateMenu.module.css';

interface CreateSheetRowProps {
  readonly id: CreateEntryId;
  readonly onNavigate: () => void;
}

function CreateSheetRow({ id, onNavigate }: CreateSheetRowProps) {
  const { t } = useTranslation('common');
  const { to, state } = useCreateEntryLink(id, { createOpener: true });
  return (
    <li>
      <NavAnchor
        to={to}
        state={state}
        onNavigate={onNavigate}
        className={styles.row}
        data-testid={`create-sheet-${id}`}
      >
        {t(I18N_UNION_KEYS.createMenuEntry.key(id))}
      </NavAnchor>
    </li>
  );
}

/** The compact New sheet (below 1024px), opened by the bottom bar's plus button. */
export function CreateSheet() {
  const { t } = useTranslation('common');
  const { sheetOpen, sheetId, plusButtonRef, close, moneyPage } = useCreateMenuShell();
  // The last used tile is read when the sheet opens (adjusted during render, not in an effect,
  // so the order is in the DOM before the sheet focuses its first tile).
  const [lastUsed, setLastUsed] = useState<QuickLogMode | null>(() => readLastQuickLog());
  const [wasOpen, setWasOpen] = useState(sheetOpen);
  if (wasOpen !== sheetOpen) {
    setWasOpen(sheetOpen);
    if (sheetOpen) setLastUsed(readLastQuickLog());
  }
  const chooseQuickLog = (mode: QuickLogMode) => {
    writeLastQuickLog(mode);
    close();
  };
  const ids = visibleCreateEntries(moneyPage);
  const general = ids.filter((id) => !CREATE_TARGETS[id].moneyOnly);
  const money = ids.filter((id) => CREATE_TARGETS[id].moneyOnly);

  return (
    <Sheet
      id={sheetId}
      open={sheetOpen}
      onClose={close}
      title={t('topBar.new')}
      returnFocusRef={plusButtonRef}
      testId="create-sheet"
    >
      <QuickLogTiles lastUsed={lastUsed} onChoose={chooseQuickLog} />
      <ul className={`${styles.rows} ${styles.rowsAfterQuickLog}`}>
        {general.map((id) => (
          <CreateSheetRow key={id} id={id} onNavigate={close} />
        ))}
      </ul>
      {money.length > 0 && (
        <ul className={`${styles.rows} ${styles.rowsMoney}`}>
          {money.map((id) => (
            <CreateSheetRow key={id} id={id} onNavigate={close} />
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export default CreateSheet;
