import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaperlessDocumentSearchResult, PaperlessCorrespondent } from '@cornerstone/shared';
import { listPaperlessCorrespondents } from '../../lib/paperlessApi.js';
import { useAllLinkedDocumentIds } from '../../hooks/useDocumentLinks.js';
import { Modal } from '../Modal/Modal.js';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import { DocumentBrowser } from '../documents/DocumentBrowser.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './InvoicePaperlessPickerModal.module.css';

interface InvoicePaperlessPickerModalProps {
  onDocumentSelected: (doc: PaperlessDocumentSearchResult) => void;
  onManualEntry: () => void;
  onClose: () => void;
  paperlessUrl: string | null;
}

export function InvoicePaperlessPickerModal({
  onDocumentSelected,
  onManualEntry,
  onClose,
  paperlessUrl,
}: InvoicePaperlessPickerModalProps) {
  const { t } = useTranslation(['budget', 'documents']);
  const [correspondents, setCorrespondents] = useState<PaperlessCorrespondent[]>([]);
  const [selectedCorrespondentId, setSelectedCorrespondentId] = useState<string>('');
  const [isLoadingCorrespondents, setIsLoadingCorrespondents] = useState(true);
  const systemLinkedIds = useAllLinkedDocumentIds();

  // Load correspondents on mount
  useEffect(() => {
    let cancelled = false;

    async function loadCorrespondents() {
      try {
        const response = await listPaperlessCorrespondents();
        if (!cancelled) {
          setCorrespondents(response.correspondents || []);
        }
      } catch {
        if (!cancelled) {
          setCorrespondents([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCorrespondents(false);
        }
      }
    }

    void loadCorrespondents();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch system-wide linked document IDs on mount so the hide-linked filter works
  useEffect(() => {
    // eslint-disable-next-line @eslint-react/web-api-no-leaked-fetch -- useAllLinkedDocumentIds.fetch is a custom hook method, not the Web Fetch API; no AbortController applies
    void systemLinkedIds.fetch();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- systemLinkedIds.fetch is a new reference each render; adding it would cause an infinite re-fetch loop
  }, []);

  const handleCorrespondentChange = (id: string) => {
    setSelectedCorrespondentId(id);
  };

  const footer = (
    <button
      type="button"
      className={styles.manualEscapeButton}
      onClick={onManualEntry}
      aria-label={t('budget:invoices.pickerModal.manualEntryAriaLabel')}
    >
      {t('budget:invoices.pickerModal.manualEntry')}
    </button>
  );

  return (
    <Modal
      title={t('budget:invoices.pickerModal.title')}
      onClose={onClose}
      footer={footer}
      className={styles.pickerModal}
    >
      <div className={styles.modalBody}>
        <div className={styles.correspondentRow}>
          <label htmlFor="correspondent-picker" className={sharedStyles.srOnly}>
            {t('documents:browser.correspondentLabel')}
          </label>
          <SearchPicker
            id="correspondent-picker"
            value={selectedCorrespondentId}
            onChange={handleCorrespondentChange}
            excludeIds={[]}
            searchFn={async (query) => {
              return correspondents.filter(
                (c) =>
                  c.name.toLowerCase().includes(query.toLowerCase()) ||
                  c.id.toString().includes(query),
              );
            }}
            renderItem={(correspondent) => ({
              id: String(correspondent.id),
              label: correspondent.name,
            })}
            placeholder={t('documents:browser.correspondentPlaceholder')}
            emptyHint={t('documents:browser.correspondentEmptyHint')}
            noResultsMessage={t('documents:browser.correspondentNoResults')}
            showItemsOnFocus
            disabled={isLoadingCorrespondents}
          />
        </div>
        <DocumentBrowser
          mode="modal"
          onSelect={onDocumentSelected}
          defaultHideLinked={true}
          linkedDocumentIds={systemLinkedIds.ids}
          paperlessUrl={paperlessUrl}
          correspondentId={selectedCorrespondentId ? Number(selectedCorrespondentId) : null}
        />
      </div>
    </Modal>
  );
}
