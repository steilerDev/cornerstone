import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupMeta } from '@cornerstone/shared';
import { SettingsSubNav } from '../../components/SettingsSubNav/SettingsSubNav.js';
import { Modal } from '../../components/Modal/Modal.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { listBackups, createBackup, deleteBackup, restoreBackup } from '../../lib/backupsApi.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './BackupsPage.module.css';

/**
 * Format a file size in bytes to a human-readable string.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupsPage() {
  const { t } = useTranslation('settings');
  const { formatDate } = useFormatters();

  // Data state
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotConfigured, setIsNotConfigured] = useState(false);
  const [loadError, setLoadError] = useState<string>('');

  // Create backup state
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<BackupMeta | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  // Restore modal state
  const [restoreTarget, setRestoreTarget] = useState<BackupMeta | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreInitiated, setRestoreInitiated] = useState(false);
  const [restoreError, setRestoreError] = useState<string>('');

  // Load backups on mount
  useEffect(() => {
    const loadBackupsData = async () => {
      setIsLoading(true);
      setLoadError('');
      setIsNotConfigured(false);

      try {
        const response = await listBackups();
        setBackups(response.backups);
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.statusCode === 503 && err.error.code === 'BACKUP_NOT_CONFIGURED') {
            setIsNotConfigured(true);
          } else {
            setLoadError(err.error.message);
          }
        } else {
          setLoadError(t('backups.loadError'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadBackupsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    setCreateError('');

    try {
      const response = await createBackup();
      setBackups([response.backup, ...backups]);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('backups.createError'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteBackup(deleteTarget.filename);
      setBackups(backups.filter((b) => b.filename !== deleteTarget.filename));
      setDeleteTarget(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteError(err.error.message);
      } else {
        setDeleteError(t('backups.deleteModal.error'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;

    setIsRestoring(true);
    setRestoreError('');

    try {
      await restoreBackup(restoreTarget.filename);
      setRestoreInitiated(true);
      setRestoreTarget(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setRestoreError(err.error.message);
      } else {
        setRestoreError(t('backups.restoreModal.error'));
      }
    } finally {
      setIsRestoring(false);
    }
  };

  // If restore has been initiated, show the restarting message
  if (restoreInitiated) {
    return (
      <div className={styles.page}>
        <SettingsSubNav />
        <EmptyState
          icon="⏳"
          message={t('backups.restartingMessage')}
        />
      </div>
    );
  }

  // If backup is not configured, show informational empty state
  if (isNotConfigured && !isLoading) {
    return (
      <div className={styles.page}>
        <SettingsSubNav />
        <h1 className={styles.pageTitle}>{t('backups.pageTitle')}</h1>
        <EmptyState
          icon="⚙️"
          message={t('backups.notConfiguredMessage')}
          description={t('backups.notConfiguredDescription')}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('backups.pageTitle')}</h1>
      </div>
      <SettingsSubNav />

      {/* Loading state */}
      {isLoading && <Skeleton lines={5} loadingLabel={t('backups.loading')} />}

      {/* Error state */}
      {!isLoading && loadError && (
        <div className={sharedStyles.bannerError} role="alert">
          {loadError}
        </div>
      )}

      {/* Backups content */}
      {!isLoading && !isNotConfigured && (
        <>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={sharedStyles.btnPrimary}
              onClick={handleCreateBackup}
              disabled={isCreating}
            >
              {isCreating ? t('backups.creating') : t('backups.createButton')}
            </button>
          </div>

          {createError && (
            <div className={sharedStyles.bannerError} role="alert">
              {createError}
            </div>
          )}

          {backups.length === 0 ? (
            <EmptyState
              icon="📦"
              message={t('backups.emptyStateMessage')}
              description={t('backups.emptyStateDescription')}
            />
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colFilename}>{t('backups.tableHeaders.filename')}</th>
                    <th className={styles.colCreatedAt}>{t('backups.tableHeaders.createdAt')}</th>
                    <th className={styles.colSize}>{t('backups.tableHeaders.size')}</th>
                    <th className={styles.colActions}>{t('backups.tableHeaders.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.filename}>
                      <td className={styles.colFilename}>{backup.filename}</td>
                      <td className={styles.colCreatedAt}>{formatDate(backup.createdAt)}</td>
                      <td className={styles.colSize}>{formatFileSize(backup.sizeBytes)}</td>
                      <td className={styles.colActions}>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={sharedStyles.btnSecondary}
                            onClick={() => setRestoreTarget(backup)}
                            aria-label={t('backups.actions.restore')}
                          >
                            {t('backups.actions.restore')}
                          </button>
                          <button
                            type="button"
                            className={sharedStyles.btnConfirmDelete}
                            onClick={() => setDeleteTarget(backup)}
                            aria-label={t('backups.actions.delete')}
                          >
                            {t('backups.actions.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal
          title={t('backups.deleteModal.title')}
          onClose={() => !isDeleting && setDeleteTarget(null)}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                {t('backups.deleteModal.cancel')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnConfirmDelete}
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? t('backups.deleteModal.confirming') : t('backups.deleteModal.confirm')}
              </button>
            </>
          }
        >
          {deleteError && (
            <div className={sharedStyles.bannerError} role="alert">
              {deleteError}
            </div>
          )}
          <p>
            {(() => {
              const parts = t('backups.deleteModal.message', {
                filename: '\u0000',
              }).split('\u0000');
              return (
                <>
                  {parts[0]}
                  <strong>{deleteTarget.filename}</strong>
                  {parts[1]}
                </>
              );
            })()}
          </p>
          <p className={styles.warningText}>{t('backups.deleteModal.warning')}</p>
        </Modal>
      )}

      {/* Restore Confirmation Modal */}
      {restoreTarget && (
        <Modal
          title={t('backups.restoreModal.title')}
          onClose={() => !isRestoring && setRestoreTarget(null)}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => setRestoreTarget(null)}
                disabled={isRestoring}
              >
                {t('backups.restoreModal.cancel')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnConfirmDelete}
                onClick={handleRestoreConfirm}
                disabled={isRestoring}
              >
                {isRestoring ? t('backups.restoreModal.confirming') : t('backups.restoreModal.confirm')}
              </button>
            </>
          }
        >
          {restoreError && (
            <div className={sharedStyles.bannerError} role="alert">
              {restoreError}
            </div>
          )}
          <p>{t('backups.restoreModal.message')}</p>
          <p className={styles.highlightedFilename}>{restoreTarget.filename}</p>
          <p className={styles.warningText}>{t('backups.restoreModal.warning')}</p>
        </Modal>
      )}
    </div>
  );
}

export default BackupsPage;
