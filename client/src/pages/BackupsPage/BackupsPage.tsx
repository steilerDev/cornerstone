import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupMeta, BackupSchedulerStatus } from '@cornerstone/shared';
import { useAuth } from '../../contexts/AuthContext.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav, type SubNavTab } from '../../components/SubNav/SubNav.js';
import { Modal } from '../../components/Modal/Modal.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import {
  listBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  getSchedulerStatus,
} from '../../lib/backupsApi.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './BackupsPage.module.css';

export function BackupsPage() {
  const { t } = useTranslation('settings');
  const { formatDate, formatDateTime, formatFileSize } = useFormatters();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';

  const settingsTabs: SubNavTab[] = [
    { labelKey: 'subnav.settings.profile', to: '/settings/profile', ns: 'common' },
    { labelKey: 'subnav.settings.manage', to: '/settings/manage', ns: 'common' },
    { labelKey: 'subnav.settings.vendors', to: '/settings/vendors', ns: 'common' },
    {
      labelKey: 'subnav.settings.userManagement',
      to: '/settings/users',
      ns: 'common',
      visible: isAdmin,
    },
    {
      labelKey: 'subnav.settings.backups',
      to: '/settings/backups',
      ns: 'common',
      visible: isAdmin,
    },
  ];

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

  // Scheduler status state
  const [schedulerStatus, setSchedulerStatus] = useState<BackupSchedulerStatus | null>(null);
  const [isSchedulerLoading, setIsSchedulerLoading] = useState(true);
  const [schedulerError, setSchedulerError] = useState<string>('');

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
  }, [t]);

  // Load scheduler status independently
  useEffect(() => {
    const loadSchedulerStatus = async () => {
      setIsSchedulerLoading(true);
      setSchedulerError('');
      try {
        const response = await getSchedulerStatus();
        setSchedulerStatus(response.scheduler);
      } catch (err) {
        // A 503 here means backups aren't configured at all — the page-level
        // isNotConfigured branch already hides this whole section in that case.
        if (err instanceof ApiClientError && err.error.code === 'BACKUP_NOT_CONFIGURED') {
          return;
        }
        if (err instanceof ApiClientError) {
          setSchedulerError(err.error.message);
        } else {
          setSchedulerError(t('backups.scheduler.loadError'));
        }
      } finally {
        setIsSchedulerLoading(false);
      }
    };

    void loadSchedulerStatus();
  }, [t]);

  const schedulerEnabledVariants = useMemo(
    (): BadgeVariantMap => ({
      enabled: { label: t('backups.scheduler.enabled'), className: badgeStyles.success! },
      disabled: { label: t('backups.scheduler.disabled'), className: badgeStyles.info! },
    }),
    [t],
  );

  const lastRunOutcomeVariants = useMemo(
    (): BadgeVariantMap => ({
      success: { label: t('backups.scheduler.lastRunSuccess'), className: badgeStyles.success! },
      failure: { label: t('backups.scheduler.lastRunFailure'), className: badgeStyles.error! },
    }),
    [t],
  );

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
      <PageLayout
        maxWidth="narrow"
        title={t('backups.pageTitle')}
        subNav={<SubNav tabs={settingsTabs} ariaLabel="Settings section navigation" />}
      >
        <EmptyState icon="⏳" message={t('backups.restartingMessage')} />
      </PageLayout>
    );
  }

  // If backup is not configured, show informational empty state
  if (isNotConfigured && !isLoading) {
    return (
      <PageLayout
        maxWidth="narrow"
        title={t('backups.pageTitle')}
        subNav={<SubNav tabs={settingsTabs} ariaLabel="Settings section navigation" />}
      >
        <EmptyState
          icon="⚙️"
          message={t('backups.notConfiguredMessage')}
          description={t('backups.notConfiguredDescription')}
        />
      </PageLayout>
    );
  }

  const deleteModalMessageParts = deleteTarget
    ? t('backups.deleteModal.message', { filename: '\u0000' }).split('\u0000')
    : null;

  return (
    <PageLayout
      maxWidth="narrow"
      title={t('backups.pageTitle')}
      subNav={<SubNav tabs={settingsTabs} ariaLabel="Settings section navigation" />}
    >
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
          <section className={styles.schedulerStatus} aria-labelledby="scheduler-status-heading">
            <h2 id="scheduler-status-heading" className={styles.schedulerStatusHeading}>
              {t('backups.scheduler.heading')}
            </h2>

            {isSchedulerLoading && (
              <Skeleton lines={2} loadingLabel={t('backups.scheduler.loading')} />
            )}

            {!isSchedulerLoading && schedulerError && (
              <div className={sharedStyles.bannerError} role="alert">
                {schedulerError}
              </div>
            )}

            {!isSchedulerLoading && !schedulerError && schedulerStatus && (
              <dl className={styles.schedulerStatusGrid}>
                <div className={styles.schedulerStatusRow}>
                  <dt>{t('backups.scheduler.statusLabel')}</dt>
                  <dd>
                    <Badge
                      variants={schedulerEnabledVariants}
                      value={schedulerStatus.enabled ? 'enabled' : 'disabled'}
                    />
                  </dd>
                </div>

                {!schedulerStatus.enabled && (
                  <p className={styles.schedulerStatusHint}>
                    {t('backups.scheduler.disabledHint')}
                  </p>
                )}

                {schedulerStatus.enabled && (
                  <>
                    <div className={styles.schedulerStatusRow}>
                      <dt>{t('backups.scheduler.lastRunLabel')}</dt>
                      <dd>
                        {schedulerStatus.lastRun ? (
                          <>
                            <span className={styles.schedulerStatusTimestamp}>
                              {formatDateTime(schedulerStatus.lastRun.timestamp)}
                            </span>
                            <Badge
                              variants={lastRunOutcomeVariants}
                              value={schedulerStatus.lastRun.success ? 'success' : 'failure'}
                            />
                          </>
                        ) : (
                          <span className={styles.schedulerStatusMuted}>
                            {t('backups.scheduler.noRunsYet')}
                          </span>
                        )}
                      </dd>
                    </div>

                    <div className={styles.schedulerStatusRow}>
                      <dt>{t('backups.scheduler.nextRunLabel')}</dt>
                      <dd>
                        <span className={styles.schedulerStatusTimestamp}>
                          {formatDateTime(schedulerStatus.nextRuns[0])}
                        </span>
                        {schedulerStatus.nextRuns[1] && (
                          <span className={styles.schedulerStatusMuted}>
                            {' · '}
                            {t('backups.scheduler.thenLabel')}{' '}
                            {formatDateTime(schedulerStatus.nextRuns[1])}
                          </span>
                        )}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            )}
          </section>

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
                {isDeleting
                  ? t('backups.deleteModal.confirming')
                  : t('backups.deleteModal.confirm')}
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
            {deleteModalMessageParts && (
              <>
                {deleteModalMessageParts[0]}
                <strong>{deleteTarget!.filename}</strong>
                {deleteModalMessageParts[1]}
              </>
            )}
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
                {isRestoring
                  ? t('backups.restoreModal.confirming')
                  : t('backups.restoreModal.confirm')}
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
    </PageLayout>
  );
}

export default BackupsPage;
