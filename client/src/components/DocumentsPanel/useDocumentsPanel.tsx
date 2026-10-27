import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentLinkEntityType, PaperlessStatusResponse } from '@cornerstone/shared';
import { getSharedPaperlessStatus } from '../../lib/paperlessStatusCache.js';
import { fetchConfig } from '../../lib/configApi.js';
import { useDocumentLinks, useAllLinkedDocumentIds } from '../../hooks/useDocumentLinks.js';
import type { SummaryFact } from '../SummaryStrip/SummaryStrip.js';
import { DocumentsPanel } from './DocumentsPanel.js';

export interface DocumentsPanelHost {
  /**
   * `hidden`: Paperless is off (or its status failed) and no links are kept: render nothing.
   * `readOnly`: kept links and a notice. `unreachable`: configured but not answering.
   */
  readonly mode: 'pending' | 'hidden' | 'full' | 'readOnly' | 'unreachable';
  /** Linked count; null while loading. */
  readonly count: number | null;
  readonly isOpen: boolean;
  readonly open: () => void;
  /** Opens the panel straight in the Link document picker; a no-op unless `mode` is `full`. */
  readonly openLink: () => void;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  /** The SummaryStrip fact; null while `pending` and when `hidden`. */
  readonly fact: SummaryFact | null;
  /** Render once in the page (the sheet; inert when closed). */
  readonly panel: ReactNode;
}

type StatusState =
  | { readonly state: 'pending' }
  | { readonly state: 'failed' }
  | { readonly state: 'ready'; readonly status: PaperlessStatusResponse };

/**
 * Host hook of the Documents panel. Owns the Paperless status, the entity's links, the
 * auto-itemize setting (invoices only) and the open state, so it lives in the page and survives
 * the sheet closing (an Undo after close still refreshes the count). A page with the summary
 * strip puts `fact` into the strip; a page without it uses `DocumentsPanelButton`.
 */
export function useDocumentsPanel(
  entityType: DocumentLinkEntityType,
  entityId: string,
): DocumentsPanelHost {
  const { t } = useTranslation('documents');
  const links = useDocumentLinks(entityType, entityId);
  const systemLinked = useAllLinkedDocumentIds();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [initialView, setInitialView] = useState<'list' | 'picker'>('list');
  const [status, setStatus] = useState<StatusState>({ state: 'pending' });
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [autoItemizeEnabled, setAutoItemizeEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getSharedPaperlessStatus(statusAttempt > 0);
        if (!cancelled) setStatus({ state: 'ready', status: result });
      } catch {
        if (!cancelled) setStatus({ state: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusAttempt]);

  useEffect(() => {
    if (entityType !== 'invoice') return;
    let cancelled = false;
    void (async () => {
      try {
        const config = await fetchConfig();
        if (!cancelled) setAutoItemizeEnabled(config.autoItemizeEnabled);
      } catch {
        // The Itemize action stays hidden when the config cannot be read.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  const retryStatus = useCallback(() => {
    setStatus({ state: 'pending' });
    setStatusAttempt((attempt) => attempt + 1);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const count = links.isLoading ? null : links.links.length;
  const keptLinks = links.error !== null || links.links.length > 0;
  const paperlessUrl = status.state === 'ready' ? status.status.paperlessUrl : null;

  let mode: DocumentsPanelHost['mode'];
  let readOnlyReason: 'notConfigured' | 'statusFailed' = 'notConfigured';
  if (status.state === 'pending') {
    mode = 'pending';
  } else if (status.state === 'ready' && status.status.configured) {
    mode = status.status.reachable ? 'full' : 'unreachable';
  } else {
    readOnlyReason = status.state === 'failed' ? 'statusFailed' : 'notConfigured';
    if (links.isLoading) mode = 'pending';
    else mode = keptLinks ? 'readOnly' : 'hidden';
  }

  // Only a resolved panel can open, so a click before the status is known can never pop it later.
  const canOpen = mode !== 'pending' && mode !== 'hidden';
  const open = useCallback(() => {
    if (!canOpen) return;
    setInitialView('list');
    setIsOpen(true);
  }, [canOpen]);
  const openLink = useCallback(() => {
    if (mode !== 'full') return;
    setInitialView('picker');
    setIsOpen(true);
  }, [mode]);

  // No fact while pending: a click would have no panel to open and the strip would read "Not set".
  const fact: SummaryFact | null =
    mode === 'hidden' || mode === 'pending'
      ? null
      : {
          kind: 'button',
          id: 'documents',
          label: t('panel.factLabel'),
          value: count,
          onClick: open,
          buttonRef: triggerRef,
          expanded: isOpen,
          testId: 'summary-fact-documents',
        };

  const panel =
    mode === 'full' || mode === 'readOnly' || mode === 'unreachable' ? (
      <DocumentsPanel
        entityType={entityType}
        entityId={entityId}
        open={isOpen}
        initialView={initialView}
        onClose={close}
        triggerRef={triggerRef}
        mode={mode}
        readOnlyReason={readOnlyReason}
        paperlessUrl={paperlessUrl}
        autoItemizeEnabled={autoItemizeEnabled}
        onRetryStatus={retryStatus}
        links={links.links}
        isLoading={links.isLoading}
        error={links.error}
        addLink={links.addLink}
        removeLink={links.removeLink}
        restoreLink={links.restoreLink}
        updateAttachmentType={links.updateAttachmentType}
        refresh={links.refresh}
        systemLinkedIds={systemLinked.ids}
        fetchSystemLinkedIds={systemLinked.fetch}
      />
    ) : null;

  return { mode, count, isOpen, open, openLink, triggerRef, fact, panel };
}
