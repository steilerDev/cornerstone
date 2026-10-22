import { useTranslation } from 'react-i18next';
import type { DocumentLinkEntityType } from '@cornerstone/shared';
import { useDocumentsPanel } from './useDocumentsPanel.js';
import styles from './DocumentsPanelButton.module.css';

export interface DocumentsPanelButtonProps {
  readonly entityType: DocumentLinkEntityType;
  readonly entityId: string;
  /** Names the record on pages with several panels (a row of a list): "Documents (2) for Bank loan". */
  readonly contextName?: string;
  readonly testId?: string;
}

/**
 * Interim host of the Documents panel for pages that do not show the summary strip yet: a
 * "Documents (n)" button plus the panel. Renders nothing while Paperless is unknown, and when it
 * is off and no links are kept. A page that adopts `SummaryStrip` uses
 * `useDocumentsPanel().fact` instead.
 */
export function DocumentsPanelButton({
  entityType,
  entityId,
  contextName,
  testId = 'documents-panel-button',
}: DocumentsPanelButtonProps) {
  const { t } = useTranslation('documents');
  const host = useDocumentsPanel(entityType, entityId);

  if (host.mode === 'pending' || host.mode === 'hidden') return null;

  const label =
    host.count === null ? t('panel.factLabel') : t('panel.buttonLabel', { count: host.count });

  return (
    <>
      <button
        type="button"
        ref={host.triggerRef}
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={host.isOpen}
        aria-label={
          contextName && host.count !== null
            ? t('panel.buttonWithContext', { count: host.count, name: contextName })
            : undefined
        }
        onClick={host.open}
        data-testid={testId}
      >
        {label}
      </button>
      {host.panel}
    </>
  );
}
