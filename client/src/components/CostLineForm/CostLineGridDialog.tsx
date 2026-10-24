import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaperlessStatusResponse } from '@cornerstone/shared';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useDocumentLinks } from '../../hooks/useDocumentLinks.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { createBudgetLinesBatch } from '../../lib/budgetLinesBatchApi.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { getSharedPaperlessStatus } from '../../lib/paperlessStatusCache.js';
import sharedStyles from '../../styles/shared.module.css';
import { AutoItemizePdfPreview } from '../autoItemize/AutoItemizePdfPreview.js';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { FormError } from '../FormError/FormError.js';
import { Modal } from '../Modal/Modal.js';
import { Sheet } from '../Modal/Sheet.js';
import { OBJECT_FORM_MEDIA_QUERY } from '../ObjectForm/ObjectForm.js';
import { CostLineGrid } from './CostLineGrid.js';
import {
  blankGridRow,
  buildBatch,
  isBlankRow,
  mapServerErrors,
  nextRowId,
  rowsToSave,
  validateGridRows,
} from './costLineGridModel.js';
import { hostTarget } from './costLineValues.js';
import type {
  CostLineGridDialogProps,
  CostLineGridOptions,
  CostLineGridRow,
  CostLineGridRowErrors,
} from './types.js';
import type { CostLineTarget } from '../CostLineTable/types.js';
import { useCostLineOptions } from './useCostLineOptions.js';
import styles from './CostLineGridDialog.module.css';

/** The document preview sits beside the grid from this width (the dialog's wide layout). */
const PREVIEW_COLUMN_QUERY = '(min-width: 1024px)';

const DOCUMENT_OPTIONS: CostLineGridOptions = {
  targets: true,
  requireTarget: true,
  positiveGross: true,
  columns: ['category'],
  existingLines: true,
};

const ITEM_OPTIONS: CostLineGridOptions = {
  targets: false,
  requireTarget: false,
  positiveGross: false,
  columns: ['category'],
};

/**
 * The many-lines path: a dialog (Modal from 768px, full-screen Sheet below) around the cost line
 * grid. Document hosts (an offer or invoice) save every row in one transaction through the batch
 * endpoint, linked to the document; task and purchase hosts add estimates. With Paperless on and a
 * linked document, the document shows beside the grid (from 1024px) or in a side sheet.
 */
export function CostLineGridDialog({
  host,
  mode,
  remainingAmount,
  onSaved,
  onClose,
  returnFocusRef,
}: CostLineGridDialogProps) {
  const { t } = useTranslation('costLines');
  const { t: tb } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { resolvedLocale, vatRate } = useLocale();
  const locale = resolvedLocale === 'de' ? 'de' : 'en';
  const options = useCostLineOptions();
  const wide = useMediaQuery(OBJECT_FORM_MEDIA_QUERY);
  const sideBySide = useMediaQuery(PREVIEW_COLUMN_QUERY);
  const sheetId = useId();
  const documentSheetId = useId();
  const onDocument = host.kind === 'invoice';
  const gridOptions = onDocument ? DOCUMENT_OPTIONS : ITEM_OPTIONS;

  const [rows, setRows] = useState<readonly CostLineGridRow[]>(() => [blankGridRow(nextRowId())]);
  const [assignAll, setAssignAll] = useState<CostLineTarget | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<ReadonlyMap<string, CostLineGridRowErrors>>(
    () => new Map(),
  );
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [status, setStatus] = useState<PaperlessStatusResponse | null>(null);

  const firstDescriptionRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const showDocumentRef = useRef<HTMLButtonElement>(null);
  const focusInvalidRef = useRef(false);

  const links = useDocumentLinks(host.kind, host.id);
  useEffect(() => {
    let cancelled = false;
    getSharedPaperlessStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        // Without a status there is no preview; the grid works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const latestLink = [...links.links].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const previewAvailable =
    status !== null && status.configured && status.reachable && latestLink !== undefined;

  const messages = {
    description: t('form.errorDescription'),
    quantity: t('form.errorQuantity'),
    unitPrice: t('form.errorUnitPrice'),
    number: t('grid.errorNumber'),
    amountPositive: t('form.errorAmountPositive'),
    belongsTo: t('form.errorBelongsTo'),
  };
  const validation = validateGridRows(rows, gridOptions, assignAll, { locale, vatRate }, messages);
  const toSave = rowsToSave(rows, gridOptions);
  const dirty = rows.some((row) => !isBlankRow(row)) || assignAll !== null;

  // Focus the first invalid cell once the commit that marks it has landed.
  useLayoutEffect(() => {
    if (!focusInvalidRef.current) return;
    focusInvalidRef.current = false;
    bodyRef.current!.querySelector<HTMLElement>('[aria-invalid="true"]')!.focus();
  });

  const reveal = () => {
    setShowAllErrors(true);
    focusInvalidRef.current = true;
  };

  const requestClose = () => {
    if (saving || confirmOpen) return;
    if (dirty) setConfirmOpen(true);
    else onClose();
  };

  // Saving needs the funding sources (the batch contract requires one per line).
  const optionsBlocked = options.loading || options.failed;
  const blockedReason = options.loading ? t('grid.optionsLoading') : t('section.loadError');

  const save = async () => {
    if (saving || optionsBlocked) return;
    if (toSave.length === 0) {
      setAnnouncement(t('grid.status', { count: 0 }));
      firstDescriptionRef.current!.focus();
      return;
    }
    if (validation.size > 0) {
      reveal();
      return;
    }
    setSaving(true);
    setBanner(null);
    setServerErrors(new Map());
    setAnnouncement(t('grid.saving'));
    const { lines, rowIds } = buildBatch(toSave, {
      assignAll,
      fallbackTarget: hostTarget(host),
      documentStatus: host.kind === 'invoice' ? host.status : null,
      discretionarySourceId: options.discretionarySourceId,
      locale,
      vatRate,
    });
    try {
      const response = await createBudgetLinesBatch({
        ...(host.kind === 'invoice' ? { invoiceId: host.id } : {}),
        lines,
      });
      onSaved(response.lines.length);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const mapped = mapServerErrors(error, rowIds, {
          description: t('form.errorDescription'),
          quantity: t('form.errorQuantity'),
          unitPrice: t('form.errorUnitPrice'),
          belongsTo: t('form.errorBelongsTo'),
          overInvoice: t('form.errorOverInvoice'),
          alreadyLinked: t('linkInvoice.errorAlreadyLinked'),
        });
        setServerErrors(mapped.errors);
        setBanner(
          mapped.unmapped || mapped.errors.size === 0
            ? translateApiError(error.error.code, tErrors)
            : null,
        );
        if (mapped.errors.size > 0) focusInvalidRef.current = true;
      } else if (error instanceof NetworkError) {
        setBanner(tc('requestErrors.network'));
      } else {
        setBanner(tc('objectForm.saveFailed'));
      }
      setAnnouncement('');
      setSaving(false);
    }
  };

  const title = mode === 'split' ? t('grid.titleSplit', { name: host.label }) : t('grid.title');

  const attention = validation.size;
  const statusBar = (
    <span className={styles.status}>
      {t('grid.status', { count: toSave.length })}
      {attention > 0 && (
        <>
          {', '}
          <button type="button" className={styles.attention} onClick={reveal}>
            {t('grid.needAttention', { count: attention })}
          </button>
        </>
      )}
    </span>
  );

  const footer = (
    <>
      {statusBar}
      <button
        type="button"
        className={sharedStyles.btnSecondary}
        aria-disabled={saving || undefined}
        onClick={requestClose}
        data-testid="cost-line-grid-cancel"
      >
        {tc('button.cancel')}
      </button>
      <button
        type="button"
        className={styles.save}
        aria-disabled={saving || optionsBlocked || undefined}
        aria-describedby={optionsBlocked ? 'cost-line-grid-save-reason' : undefined}
        aria-keyshortcuts="Control+S Meta+S"
        onClick={() => void save()}
        data-testid="cost-line-grid-save"
      >
        {saving ? t('grid.saving') : tc('button.save')}
      </button>
      {optionsBlocked && (
        <span
          id="cost-line-grid-save-reason"
          className={sharedStyles.srOnly}
          data-testid="cost-line-grid-save-reason"
        >
          {blockedReason}
        </span>
      )}
      <span role="status" className={sharedStyles.srOnly} data-testid="cost-line-grid-status">
        {announcement}
      </span>
    </>
  );

  const preview: ReactNode =
    previewAvailable && latestLink ? (
      <section
        className={styles.preview}
        aria-label={t('grid.documentPreview', { title: latestLink.document?.title ?? '' })}
        data-testid="cost-line-grid-preview"
      >
        <h3 className={styles.previewHeading}>{t('grid.previewHeading')}</h3>
        <AutoItemizePdfPreview
          documentId={latestLink.paperlessDocumentId}
          paperlessUrl={status.paperlessUrl}
          t={tb}
        />
      </section>
    ) : null;

  const grid = (
    <CostLineGrid
      rows={rows}
      onRowsChange={(next) => {
        setRows(next);
        setServerErrors(new Map());
      }}
      options={gridOptions}
      assignAll={assignAll}
      onAssignAllChange={setAssignAll}
      remainingAmount={onDocument ? remainingAmount : undefined}
      categoryOptions={options.categoryOptions}
      sourceOptions={options.sourceOptions}
      showAllErrors={showAllErrors}
      serverErrors={serverErrors}
      onSaveShortcut={() => void save()}
      onAnnounce={setAnnouncement}
      firstDescriptionRef={firstDescriptionRef}
    />
  );

  const body = (
    <div
      ref={bodyRef}
      className={previewAvailable && sideBySide ? styles.twoColumns : styles.oneColumn}
    >
      <div className={styles.gridColumn}>
        <FormError message={banner} />
        {options.failed && <FormError message={t('section.loadError')} />}
        {previewAvailable && !sideBySide && (
          <button
            ref={showDocumentRef}
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={() => setDocumentOpen(true)}
            data-testid="cost-line-grid-show-document"
          >
            {t('grid.showDocument')}
          </button>
        )}
        {grid}
      </div>
      {previewAvailable && sideBySide && <div className={styles.previewColumn}>{preview}</div>}
    </div>
  );

  const dialog = wide ? (
    <Modal
      title={title}
      onClose={requestClose}
      footer={<div className={styles.footer}>{footer}</div>}
      className={previewAvailable && sideBySide ? styles.dialogWide : styles.dialog}
      initialFocusRef={firstDescriptionRef}
      dismissible={!saving && !confirmOpen}
      returnFocusRef={returnFocusRef}
    >
      {body}
    </Modal>
  ) : (
    <Sheet
      id={sheetId}
      open
      variant="fullScreen"
      title={title}
      onClose={requestClose}
      footer={<div className={styles.footer}>{footer}</div>}
      initialFocusRef={firstDescriptionRef}
      dismissible={!saving && !confirmOpen}
      returnFocusRef={returnFocusRef}
      restoreFocusOnUnmount
      testId="cost-line-grid-sheet"
    >
      {body}
    </Sheet>
  );

  return (
    <>
      {dialog}
      {documentOpen && previewAvailable && (
        <Sheet
          id={documentSheetId}
          open
          variant={wide ? 'side' : 'fullScreen'}
          title={t('grid.previewHeading')}
          onClose={() => setDocumentOpen(false)}
          returnFocusRef={showDocumentRef}
          restoreFocusOnUnmount
          testId="cost-line-grid-document-sheet"
        >
          {preview}
        </Sheet>
      )}
      {confirmOpen && (
        <ConfirmDialog
          title={tc('confirmDialog.discardChangesTitle')}
          lead={t('grid.discardLead')}
          confirmLabel={tc('confirmDialog.discard')}
          busyLabel={tc('confirmDialog.discarding')}
          cancelLabel={tc('confirmDialog.keepEditing')}
          busy={false}
          restoreToOpenerOnConfirm={false}
          onConfirm={() => {
            setConfirmOpen(false);
            onClose();
          }}
          onCancel={() => setConfirmOpen(false)}
          testIdPrefix="cost-line-grid-discard"
        />
      )}
    </>
  );
}

export default CostLineGridDialog;
