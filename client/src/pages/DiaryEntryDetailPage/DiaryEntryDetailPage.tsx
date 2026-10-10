import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  DiaryEntryDetail,
  DiarySignatureEntry,
  DiarySourceEntityType,
} from '@cornerstone/shared';
import { isDiaryEntrySignatureLocked, routeUrl } from '@cornerstone/shared';
import { getDiaryEntry, deleteDiaryEntry } from '../../lib/diaryApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import type { VendorOption } from '../../components/diary/SignatureCapture/SignatureCapture.js';
import { usePhotos } from '../../hooks/usePhotos.js';
import { useFormatters } from '../../lib/formatters.js';
import { DiaryEntryTypeBadge } from '../../components/diary/DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { DiaryMetadataSummary } from '../../components/diary/DiaryMetadataSummary/DiaryMetadataSummary.js';
import { SignatureDisplay } from '../../components/diary/SignatureDisplay/SignatureDisplay.js';
import { PhotoGrid } from '../../components/photos/PhotoGrid.js';
import { PhotoViewer } from '../../components/photos/PhotoViewer.js';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/index.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import shared from '../../styles/shared.module.css';
import { useOriginState } from '../../navigation/useOriginState.js';
import type { OriginState } from '../../navigation/origin.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useDiaryEntryTitle } from '../../hooks/useDiaryEntryTitle.js';
import styles from './DiaryEntryDetailPage.module.css';

export default function DiaryEntryDetailPage() {
  const {
    formatCurrency: _formatCurrency,
    formatDate,
    formatTime: _formatTime,
    formatDateTime,
  } = useFormatters();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('diary');
  const { t: tErrors } = useTranslation('errors');
  const { t: tc } = useTranslation('common');
  const { showToast } = useToast();
  const { user: _user } = useAuth();
  const [_vendorOptions, setVendorOptions] = useState<VendorOption[]>([]);

  useEffect(() => {
    void fetchVendors({ pageSize: 100 })
      .then((res) => {
        setVendorOptions(res.vendors.map((v) => ({ id: v.id, name: v.name })));
      })
      .catch(() => {
        // Vendors are optional — gracefully degrade
      });
  }, []);

  const [entry, setEntry] = useState<DiaryEntryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact(
    'diary_entry',
    showDeleteModal ? (entry?.id ?? null) : null,
  );

  // Photo state
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [openAsAnnotator, setOpenAsAnnotator] = useState(false);
  const photosResult = usePhotos(id ? 'diary_entry' : '', id || '');

  useEffect(() => {
    if (!id) {
      /* eslint-disable @eslint-react/set-state-in-effect -- initializing error and loading state based on route params */
      setNotFound(true);
      setIsLoading(false);
      /* eslint-enable @eslint-react/set-state-in-effect */
      return;
    }

    const loadEntry = async () => {
      setIsLoading(true);
      setError('');
      setNotFound(false);
      try {
        const data = await getDiaryEntry(id);
        setEntry(data);
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.statusCode === 404) {
            setNotFound(true);
          } else {
            setError(translateApiError(err.error.code, tErrors));
          }
        } else {
          setError(t('detail.errorMessage'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadEntry();
  }, [id, t, tErrors]);

  const displayTitle = useDiaryEntryTitle(entry);
  const originState = useOriginState(displayTitle);
  const backToDiary = tc('navigation.backTo', { origin: tc('navigation.siteDiary') });
  const h1Text = isLoading
    ? tc('navigation.diaryEntry')
    : notFound || (!error && !entry)
      ? tc('navigation.diaryEntryNotFound')
      : (displayTitle ?? tc('navigation.diaryEntry'));
  useDocumentTitle(h1Text);

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteError('');
    setDeleteBlocked(false);
  };

  const handleDelete = async () => {
    if (!entry) return;
    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteDiaryEntry(entry.id);
      showToast('success', t('detailPage.deleteSuccess'));
      navigate(routeUrl('diary'), { replace: true });
    } catch (err) {
      setDeleteBlocked(err instanceof ApiClientError && err.statusCode === 409);
      setDeleteError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('detailPage.deleteError'),
      );
      console.error('Failed to delete diary entry:', err);
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageBreadcrumbs />
        <h1 className={styles.title}>{h1Text}</h1>
        <div className={shared.loading}>{t('detail.loading')}</div>
      </div>
    );
  }

  if (notFound || (!error && !entry)) {
    return (
      <div className={styles.page}>
        <PageBreadcrumbs />
        <h1 className={styles.title}>{h1Text}</h1>
        <div className={shared.emptyState}>
          <p>{t('detail.notFoundMessage')}</p>
          <Link to={routeUrl('diary')} className={shared.btnPrimary}>
            {backToDiary}
          </Link>
        </div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className={styles.page}>
        <PageBreadcrumbs />
        <h1 className={styles.title}>{h1Text}</h1>
        <div className={shared.bannerError}>{error}</div>
        <Link to={routeUrl('diary')} className={shared.btnSecondary}>
          {backToDiary}
        </Link>
      </div>
    );
  }

  const isLocked = isDiaryEntrySignatureLocked(entry);

  return (
    <div className={styles.page}>
      <PageBreadcrumbs />
      {(!entry.isAutomatic || isLocked) && (
        <div className={styles.topBar}>
          <div className={styles.actionButtons}>
            {!entry.isAutomatic && !isLocked && (
              <>
                <Link
                  to={routeUrl('diaryEntryEdit', { id: entry.id })}
                  state={originState}
                  className={styles.editButton}
                >
                  {t('detailPage.edit')}
                </Link>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => setShowDeleteModal(true)}
                >
                  {t('detailPage.delete')}
                </button>
              </>
            )}
            {isLocked && (
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => setShowDeleteModal(true)}
              >
                {t('detailPage.delete')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.card}>
        <header className={styles.header}>
          <div className={styles.typeBadgeContainer}>
            <DiaryEntryTypeBadge entryType={entry.entryType} size="lg" />
          </div>
          <div className={styles.headerContent}>
            <h1 className={styles.title}>{h1Text}</h1>
            <div className={styles.meta}>
              <span className={styles.date}>{formatDate(entry.entryDate)}</span>
              {entry.isAutomatic && (
                <span className={styles.badge}>{t('detailPage.automatic')}</span>
              )}
            </div>
          </div>
        </header>

        <div className={styles.body}>{entry.body}</div>

        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div className={styles.metadataSection}>
            <DiaryMetadataSummary entryType={entry.entryType} metadata={entry.metadata} />
          </div>
        )}

        {/* Signature Display */}
        {entry.metadata &&
          (entry.entryType === 'daily_log' ||
            entry.entryType === 'site_visit' ||
            entry.entryType === 'issue') &&
          Array.isArray((entry.metadata as { signatures?: DiarySignatureEntry[] }).signatures) &&
          (entry.metadata as { signatures: DiarySignatureEntry[] }).signatures.map((sig, i) => (
            <div
              key={`${sig.signerType}-${sig.signerName}-${i}`} // eslint-disable-line @eslint-react/no-array-index-key -- signatures list may have duplicates; composite key with signerType+name+index is stable
              className={styles.signatureSection}
            >
              <SignatureDisplay
                signatureDataUrl={sig.signatureDataUrl}
                signerName={sig.signerName}
                signedDate={
                  sig.signedAt ? formatDateTime(sig.signedAt) : formatDate(entry.entryDate)
                }
              />
            </div>
          ))}

        {/* Photos Section */}
        {!(isLocked && photosResult.photos.length === 0) && !entry.isAutomatic && (
          <div className={styles.photoSection}>
            <div className={styles.photoSectionHeader}>
              <h2 className={styles.photoHeading}>
                {t('detailPage.photosHeading', { count: photosResult.photos.length })}
              </h2>
            </div>

            {photosResult.photos.length === 0 ? (
              <div className={styles.photoEmptyState}>
                <p>{t('detailPage.photosEmpty')}</p>
                {!entry.isAutomatic && (
                  <Link
                    to={routeUrl('diaryEntryEdit', { id: entry.id })}
                    state={originState}
                    className={styles.addPhotoLink}
                  >
                    {t('detailPage.addPhotos')}
                  </Link>
                )}
              </div>
            ) : (
              <>
                <PhotoGrid
                  photos={photosResult.photos}
                  onPhotoClick={(photo) => {
                    const index = photosResult.photos.findIndex((p) => p.id === photo.id);
                    setOpenAsAnnotator(false);
                    setSelectedPhotoIndex(index);
                  }}
                  onEdit={(photo) => {
                    const index = photosResult.photos.findIndex((p) => p.id === photo.id);
                    setOpenAsAnnotator(true);
                    setSelectedPhotoIndex(index);
                  }}
                  loading={photosResult.loading}
                  editable={!isLocked}
                />
              </>
            )}
          </div>
        )}

        {/* Photo Viewer Modal */}
        {selectedPhotoIndex !== null && selectedPhotoIndex >= 0 && (
          <PhotoViewer
            photos={photosResult.photos}
            initialIndex={selectedPhotoIndex}
            onClose={() => {
              setSelectedPhotoIndex(null);
              setOpenAsAnnotator(false);
            }}
            onPhotoChanged={photosResult.updatePhotoInList}
            editable={!isLocked}
            startInAnnotator={openAsAnnotator}
            onDelete={async (photoId) => {
              await photosResult.deletePhoto(photoId);
              setSelectedPhotoIndex(null);
            }}
          />
        )}

        {entry.sourceEntityType && entry.sourceEntityId && (
          <div className={styles.sourceSection}>
            <p className={styles.sourceLabel}>{t('detailPage.relatedTo')}</p>
            <SourceEntityLink
              sourceType={entry.sourceEntityType}
              sourceId={entry.sourceEntityId}
              sourceTitle={entry.sourceEntityTitle}
              originState={originState}
            />
            {entry.sourceEntityType === 'work_item' && (
              <AreaBreadcrumb area={entry.sourceEntityArea ?? null} variant="compact" />
            )}
          </div>
        )}

        <div className={styles.timestamps}>
          <div className={styles.timestamp}>
            <span className={styles.label}>{t('detailPage.created')}</span>
            <span>{formatDateTime(entry.createdAt)}</span>
          </div>
          {entry.updatedAt && (
            <div className={styles.timestamp}>
              <span className={styles.label}>{t('detailPage.updated')}</span>
              <span>{formatDateTime(entry.updatedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteModal && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', {
            name: displayTitle ?? formatDate(entry.entryDate),
          })}
          consequences={deleteConsequences}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={isDeleting}
          error={deleteError || null}
          blocked={deleteBlocked}
          onConfirm={() => void handleDelete()}
          onCancel={() => {
            if (!isDeleting) closeDeleteModal();
          }}
          testIdPrefix="diary-delete"
        />
      )}
    </div>
  );
}

interface SourceEntityLinkProps {
  sourceType: DiarySourceEntityType;
  sourceId: string;
  sourceTitle?: string | null;
  originState: OriginState;
}

function SourceEntityLink({
  sourceType,
  sourceId,
  sourceTitle,
  originState,
}: SourceEntityLinkProps) {
  const { t } = useTranslation('diary');

  const getRoute = (): string | null => {
    switch (sourceType) {
      case 'work_item':
        return routeUrl('workItem', { id: sourceId });
      case 'invoice':
        return routeUrl('invoice', { id: sourceId });
      case 'milestone':
        return routeUrl('milestone', { id: sourceId });
      case 'budget_source':
        return routeUrl('budgetSources');
      case 'subsidy_program':
        return routeUrl('budgetSubsidies');
      default:
        return null;
    }
  };

  const route = getRoute();
  const label = sourceTitle ?? t(I18N_UNION_KEYS.diarySourceType.key(sourceType));

  if (!route) {
    return <span>{label}</span>;
  }

  return (
    <Link to={route} state={originState}>
      {label}
    </Link>
  );
}
