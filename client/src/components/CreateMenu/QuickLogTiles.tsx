import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type { QuickLogMode } from '../../navigation/createQuery.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useQuickLogLink } from '../../navigation/useOpenCreate.js';
import { orderQuickLogModes } from './quickLogStorage.js';
import styles from './CreateMenu.module.css';

export interface QuickLogTilesProps {
  /** Shown first and marked "last used"; null = default order, nothing marked. */
  readonly lastUsed: QuickLogMode | null;
  /** A plain click chose a tile (store it, close the sheet). */
  readonly onChoose: (mode: QuickLogMode) => void;
}

function Icon({ mode }: { readonly mode: QuickLogMode }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    'aria-hidden': true,
  } as const;
  if (mode === 'photo') {
    return (
      <svg {...common}>
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    );
  }
  if (mode === 'note') {
    return (
      <svg {...common}>
        <path d="M6 4h9l3 3v13H6z" />
        <path d="M9 11h6M9 15h6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </svg>
  );
}

interface QuickLogTileProps {
  readonly mode: QuickLogMode;
  readonly last: boolean;
  readonly onChoose: (mode: QuickLogMode) => void;
}

function QuickLogTile({ mode, last, onChoose }: QuickLogTileProps) {
  const { t } = useTranslation('common');
  const { to, state } = useQuickLogLink(mode);
  const label = t(I18N_UNION_KEYS.quickLogMode.key(mode));
  return (
    <NavAnchor
      to={to}
      state={state}
      onNavigate={() => onChoose(mode)}
      className={last ? `${styles.tile} ${styles.tileLast}` : styles.tile}
      data-testid={`quick-log-${mode}`}
      data-last-used={last ? 'true' : undefined}
      aria-label={last ? t('createSheet.lastUsed', { label }) : undefined}
    >
      <Icon mode={mode} />
      <span>{label}</span>
    </NavAnchor>
  );
}

/** The "Log now" group at the top of the New sheet: Photo, Note and Delivery tiles. */
export function QuickLogTiles({ lastUsed, onChoose }: QuickLogTilesProps) {
  const { t } = useTranslation('common');
  const labelId = useId();
  return (
    <div className={styles.quickLog} data-testid="quick-log">
      <span id={labelId} className={styles.quickLogLabel}>
        {t('createSheet.logNow')}
      </span>
      <div role="group" aria-labelledby={labelId} className={styles.tiles}>
        {orderQuickLogModes(lastUsed).map((mode) => (
          <QuickLogTile key={mode} mode={mode} last={mode === lastUsed} onChoose={onChoose} />
        ))}
      </div>
    </div>
  );
}
