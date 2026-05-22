import { useTranslation } from 'react-i18next';
import type { DocumentLinkWithMetadata } from '@cornerstone/shared';
import { Modal } from '../Modal/Modal.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './DocumentPickerModal.module.css';

interface DocumentPickerModalProps {
  isOpen: boolean;
  documents: DocumentLinkWithMetadata[];
  isLoading: boolean;
  onSelectDocument: (paperlessDocumentId: number, title: string) => void;
  onCancel: () => void;
}

export function DocumentPickerModal({
  isOpen,
  documents,
  isLoading,
  onSelectDocument,
  onCancel,
}: DocumentPickerModalProps) {
  const { t } = useTranslation('budget');

  if (!isOpen) return null;

  const availableDocs = documents.filter((doc) => doc.document !== null);

  return (
    <Modal
      title={t('invoiceDetail.budgetLines.autoItemize.docPickerTitle')}
      onClose={onCancel}
      footer={
        <button
          type="button"
          className={sharedStyles.btnSecondary}
          onClick={onCancel}
        >
          {t('invoiceDetail.budgetLines.autoItemize.cancelButton')}
        </button>
      }
    >
      <div className={styles.container}>
        {isLoading && <div className={styles.loading}>{t('invoiceDetail.budgetLines.loading')}</div>}

        {!isLoading && availableDocs.length === 0 && (
          <div className={styles.emptyState}>
            {t('invoiceDetail.budgetLines.autoItemize.noDocuments')}
          </div>
        )}

        {!isLoading && availableDocs.length > 0 && (
          <div className={styles.itemList}>
            {availableDocs.map((link) => (
              <button
                key={link.id}
                type="button"
                className={styles.item}
                onClick={() =>
                  onSelectDocument(
                    link.paperlessDocumentId,
                    link.document?.title || `Document #${link.paperlessDocumentId}`,
                  )
                }
              >
                <div className={styles.itemTitle}>{link.document?.title}</div>
                {link.document?.created && (
                  <div className={styles.itemDate}>
                    {new Date(link.document.created).toLocaleDateString()}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
