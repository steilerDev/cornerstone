import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ATTACHMENT_TYPES, isRouteServed, routePattern, routeUrl } from '@cornerstone/shared';
import type {
  AttachmentType,
  DocumentLinkEntityType,
  DocumentLinkWithMetadata,
  PaperlessDocumentSearchResult,
  UndoToken,
} from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { IntegrationsLink } from '../../navigation/IntegrationsLink.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { Sheet } from '../Modal/Sheet.js';
import { markEscapeHandled, isEscapeHandled } from '../Modal/useFocusTrap.js';
import { useToast } from '../Toast/ToastContext.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import { DocumentBrowser } from '../documents/DocumentBrowser.js';
import { DocumentSkeleton } from '../documents/DocumentSkeleton.js';
import { LinkedDocumentCard } from '../documents/LinkedDocumentCard.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './DocumentsPanel.module.css';

/** Why the panel is read-only: Paperless is switched off, or the status request failed. */
export type DocumentsPanelReadOnlyReason = 'notConfigured' | 'statusFailed';

export interface DocumentsPanelProps {
  readonly entityType: DocumentLinkEntityType;
  readonly entityId: string;
  readonly open: boolean;
  readonly onClose: () => void;
  /** The host's trigger (the Documents fact or button): focus returns here on close. */
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  /** `full`/`unreachable`: link, unlink, preview. `readOnly`: kept links and a notice only. */
  readonly mode: 'full' | 'readOnly' | 'unreachable';
  readonly readOnlyReason: DocumentsPanelReadOnlyReason;
  readonly paperlessUrl: string | null;
  readonly autoItemizeEnabled: boolean;
  /** Re-checks the Paperless status (the "Try again" of the failed-status notice). */
  readonly onRetryStatus: () => void;
  readonly links: DocumentLinkWithMetadata[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly addLink: (
    paperlessDocumentId: number,
    attachmentType?: AttachmentType | null,
  ) => Promise<void>;
  readonly removeLink: (linkId: string) => Promise<UndoToken>;
  readonly restoreLink: (token: string) => Promise<void>;
  readonly updateAttachmentType: (
    linkId: string,
    attachmentType: AttachmentType | null,
  ) => Promise<void>;
  readonly refresh: () => void;
  /** Document ids linked anywhere in the system (the picker's "hide already linked"). */
  readonly systemLinkedIds: number[];
  readonly fetchSystemLinkedIds: () => Promise<void>;
  readonly testId?: string;
}

type PendingFocus =
  | { readonly kind: 'neighbours'; readonly ids: readonly string[] }
  | { readonly kind: 'linked'; readonly paperlessDocumentId: number };

/**
 * The Documents panel of an object page: a side sheet from 768 px, full screen below. List view:
 * linked documents (preview, Open in Paperless, Itemize, document type, Unlink with Undo). Picker
 * view (Link document): the Paperless document browser in the same sheet. Rendered once by
 * `useDocumentsPanel`, which owns the data; this component owns the view state only.
 */
export function DocumentsPanel({
  entityType,
  entityId,
  open,
  onClose,
  triggerRef,
  mode,
  readOnlyReason,
  paperlessUrl,
  autoItemizeEnabled,
  onRetryStatus,
  links,
  isLoading,
  error,
  addLink,
  removeLink,
  restoreLink,
  updateAttachmentType,
  refresh,
  systemLinkedIds,
  fetchSystemLinkedIds,
  testId = 'documents-panel',
}: DocumentsPanelProps) {
  const { t } = useTranslation('documents');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const originState = useOriginState();
  const { showUndoToast } = useToast();
  const wide = useMediaQuery('(min-width: 768px)');
  const sheetId = useId();

  const [view, setView] = useState<'list' | 'picker'>('list');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [updatingTypeId, setUpdatingTypeId] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<AttachmentType | null>(null);

  const linkButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const menuTriggerMapRef = useRef(new Map<string, RefObject<HTMLButtonElement | null>>());
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const focusLinkButtonRef = useRef(false);

  const readOnly = mode === 'readOnly';
  const isInvoice = entityType === 'invoice';
  const entityLabel = t(I18N_UNION_KEYS.documentLinkEntity.key(entityType));
  const fallbackTitle = useCallback(
    (link: DocumentLinkWithMetadata) =>
      link.document?.title ?? t('documentCard.fallbackTitle', { id: link.paperlessDocumentId }),
    [t],
  );

  const menuRefFor = (linkId: string): RefObject<HTMLButtonElement | null> => {
    let ref = menuTriggerMapRef.current.get(linkId);
    if (!ref) {
      ref = { current: null };
      menuTriggerMapRef.current.set(linkId, ref);
    }
    return ref;
  };

  const announceTimerRef = useRef<number | undefined>(undefined);
  const announce = useCallback((message: string) => {
    window.clearTimeout(announceTimerRef.current);
    setAnnouncement(message);
    announceTimerRef.current = window.setTimeout(() => setAnnouncement(''), 3000);
  }, []);
  useEffect(() => () => window.clearTimeout(announceTimerRef.current), []);

  // Focus after a list change: a neighbour's menu after an unlink, the new card after a link.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || isLoading || view !== 'list') return;
    if (pending.kind === 'neighbours') {
      pendingFocusRef.current = null;
      for (const id of pending.ids) {
        const trigger = menuTriggerMapRef.current.get(id)?.current;
        if (trigger?.isConnected) {
          trigger.focus();
          return;
        }
      }
      linkButtonRef.current?.focus();
      return;
    }
    pendingFocusRef.current = null;
    const added = links.find((link) => link.paperlessDocumentId === pending.paperlessDocumentId);
    const trigger = added ? menuTriggerMapRef.current.get(added.id)?.current : null;
    (trigger ?? linkButtonRef.current)?.focus();
  }, [links, isLoading, view]);

  // Entering the picker moves focus to Back (the Link document button it came from unmounts);
  // leaving it returns focus to Link document.
  useEffect(() => {
    if (view === 'picker') {
      backButtonRef.current?.focus();
    } else if (focusLinkButtonRef.current) {
      focusLinkButtonRef.current = false;
      linkButtonRef.current?.focus();
    }
  }, [view]);

  // Linked ids of the whole system are fetched when the picker opens.
  useEffect(() => {
    if (view !== 'picker') return;

    void fetchSystemLinkedIds();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- fetchSystemLinkedIds is a new reference each render; adding it would re-fetch in a loop
  }, [view]);

  const handleClose = () => {
    setView('list');
    setPendingType(null);
    onClose();
  };

  const backToList = () => {
    focusLinkButtonRef.current = true;
    setPendingType(null);
    setView('list');
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || view !== 'picker') return;
    if (event.defaultPrevented || isEscapeHandled(event.nativeEvent)) return;
    markEscapeHandled(event.nativeEvent);
    event.preventDefault();
    backToList();
  };

  const handleSelect = async (doc: PaperlessDocumentSearchResult) => {
    focusLinkButtonRef.current = false;
    setView('list');
    setLinkError(null);
    try {
      await addLink(doc.id, isInvoice ? pendingType : undefined);
      setPendingType(null);
      pendingFocusRef.current = { kind: 'linked', paperlessDocumentId: doc.id };
      announce(t('panel.linked', { title: doc.title }));
    } catch (err) {
      linkButtonRef.current?.focus();
      if (err instanceof ApiClientError && err.error.code === 'DUPLICATE_DOCUMENT_LINK') {
        setLinkError(t('panel.duplicateLink', { entity: entityLabel }));
      } else {
        setLinkError(t('panel.failedToLink'));
      }
    }
  };

  const handleUnlink = async (link: DocumentLinkWithMetadata) => {
    const ids = links.map((other) => other.id);
    const index = ids.indexOf(link.id);
    const neighbours = [ids[index + 1], ids[index - 1]].filter(
      (id): id is string => id !== undefined,
    );
    const title = fallbackTitle(link);
    setLinkError(null);
    try {
      const token = await removeLink(link.id);
      pendingFocusRef.current = { kind: 'neighbours', ids: neighbours };
      menuTriggerMapRef.current.delete(link.id);
      showUndoToast({
        message: t('panel.toast.unlinked', { title }),
        dedupeKey: `document-unlink-${link.id}`,
        focusFallback: () => linkButtonRef.current ?? triggerRef.current,
        onUndo: () => restoreLink(token.token),
      });
    } catch {
      setLinkError(t('panel.failedToUnlink'));
      refresh();
    }
  };

  const handleAttachmentTypeChange = async (
    link: DocumentLinkWithMetadata,
    type: AttachmentType | null,
  ) => {
    setUpdatingTypeId(link.id);
    setLinkError(null);
    try {
      await updateAttachmentType(link.id, type);
      const typeLabel = type
        ? t(I18N_UNION_KEYS.documentAttachmentType.key(type))
        : t('documentCard.attachmentType.none');
      announce(t('panel.attachmentTypeChanged', { title: fallbackTitle(link), type: typeLabel }));
    } catch (err) {
      setLinkError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('panel.failedToUpdateAttachmentType'),
      );
    } finally {
      setUpdatingTypeId(null);
    }
  };

  const handleItemize = (documentId: number) => {
    navigate(routeUrl('invoiceAutoItemize', { id: entityId, documentId }), {
      state: originState,
    });
  };

  const linkedDocumentIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...systemLinkedIds,
          ...links.map((link) => link.document?.id).filter((id): id is number => id !== undefined),
        ]),
      ),
    [systemLinkedIds, links],
  );

  const count = links.length;
  const picker = view === 'picker' && !readOnly;

  const footer =
    !readOnly && !picker ? (
      <>
        <button
          type="button"
          ref={linkButtonRef}
          className={styles.linkButton}
          onClick={() => {
            setPendingType(null);
            setLinkError(null);
            setView('picker');
          }}
          data-testid="documents-link-document"
        >
          {t('panel.linkDocument')}
        </button>
        {/* routeUrl() accepts served routes only; `documents` is planned until P5.8, so the pattern (no params) is used */}
        {isRouteServed('documents') && (
          <NavAnchor
            to={routePattern('documents')}
            state={originState}
            onNavigate={handleClose}
            className={styles.browseAll}
            data-testid="documents-browse-all"
          >
            {t('panel.browseAll')}
          </NavAnchor>
        )}
      </>
    ) : undefined;

  const backButton = picker ? (
    <button
      type="button"
      ref={backButtonRef}
      className={styles.backButton}
      onClick={backToList}
      onKeyDown={handleKeyDown}
      data-testid="documents-back"
    >
      <span aria-hidden="true">‹ </span>
      {t('panel.backToList')}
    </button>
  ) : undefined;

  return (
    <Sheet
      id={sheetId}
      open={open}
      onClose={handleClose}
      title={picker ? t('panel.pickerTitle') : t('panel.title', { count })}
      variant={wide ? 'side' : 'fullScreen'}
      focusTitleOnOpen
      returnFocusRef={triggerRef}
      restoreFocusOnUnmount
      testId={testId}
      footer={footer}
      headerStart={backButton}
    >
      <div className={styles.content} onKeyDown={handleKeyDown}>
        <div role="status" className={sharedStyles.srOnly}>
          {announcement}
        </div>

        {picker ? (
          <div className={styles.picker}>
            <p className={styles.pickerSubtitle}>
              {t('panel.pickerSubtitle', { entity: entityLabel })}
            </p>
            {isInvoice && (
              <div className={styles.typeRow}>
                <label htmlFor={`${sheetId}-type`} className={styles.typeLabel}>
                  {t('panel.attachmentTypeLabel')}
                </label>
                <select
                  id={`${sheetId}-type`}
                  className={styles.typeSelect}
                  value={pendingType ?? ''}
                  onChange={(e) =>
                    setPendingType((e.target.value || null) as AttachmentType | null)
                  }
                >
                  <option value="">{t('documentCard.attachmentType.none')}</option>
                  {ATTACHMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(I18N_UNION_KEYS.documentAttachmentType.key(type))}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <DocumentBrowser
              mode="modal"
              onSelect={(doc) => void handleSelect(doc)}
              linkedDocumentIds={linkedDocumentIds}
              defaultHideLinked={true}
              paperlessUrl={paperlessUrl}
            />
          </div>
        ) : (
          <>
            <FormError message={linkError} />

            {error && !isLoading && (
              <div className={styles.errorRow}>
                <FormError message={error} className={styles.errorText} />
                <button type="button" className={styles.retryButton} onClick={refresh}>
                  {t('panel.retry')}
                </button>
              </div>
            )}

            {readOnly && !isLoading && !error && (
              <p className={styles.notice} data-testid="documents-paperless-off">
                {readOnlyReason === 'statusFailed'
                  ? t('panel.paperlessUnreachable')
                  : t('panel.paperlessOff', { count: links.length })}{' '}
                {readOnlyReason === 'statusFailed' ? (
                  <button type="button" className={styles.retryButton} onClick={onRetryStatus}>
                    {t('panel.retry')}
                  </button>
                ) : (
                  <IntegrationsLink anchor="paperless" testId="documents-integrations-link" />
                )}
              </p>
            )}

            {isLoading && <DocumentSkeleton count={2} />}

            {!isLoading && !error && !readOnly && links.length === 0 && (
              <EmptyState
                icon="📄"
                message={t('panel.empty')}
                description={t(I18N_UNION_KEYS.documentLinkEmptyBody.key(entityType))}
              />
            )}

            {links.length > 0 && (
              <ul className={styles.list} data-testid="documents-list">
                {links.map((link) => (
                  <li key={link.id}>
                    <LinkedDocumentCard
                      link={link}
                      paperlessBaseUrl={paperlessUrl}
                      onUnlink={readOnly ? undefined : (l) => void handleUnlink(l)}
                      onItemize={isInvoice && autoItemizeEnabled ? handleItemize : undefined}
                      onAttachmentTypeChange={
                        isInvoice
                          ? (l, type) => void handleAttachmentTypeChange(l, type)
                          : undefined
                      }
                      isUpdatingAttachmentType={updatingTypeId === link.id}
                      readOnly={readOnly}
                      menuTriggerRef={menuRefFor(link.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
