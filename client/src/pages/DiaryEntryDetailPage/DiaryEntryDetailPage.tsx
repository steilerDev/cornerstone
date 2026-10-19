import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  AreaSummary,
  DiaryEntryDetail,
  DiaryIssueResolution,
  DiarySignatureEntry,
  DiarySourceEntityType,
} from '@cornerstone/shared';
import { isDiaryEntrySignatureLocked, routeUrl } from '@cornerstone/shared';
import { getDiaryEntry, deleteDiaryEntry } from '../../lib/diaryApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { usePhotos } from '../../hooks/usePhotos.js';
import { useFormatters } from '../../lib/formatters.js';
import { Badge } from '../../components/Badge/Badge.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import { SignatureDisplay } from '../../components/diary/SignatureDisplay/SignatureDisplay.js';
import { PhotoGrid } from '../../components/photos/PhotoGrid.js';
import { SystemEventFeedRow } from '../../components/FeedRow/SystemEventFeedRow.js';
import { PhotosWaitingNotice } from '../../components/photos/PhotoStrip/PhotosWaitingNotice.js';
import { readFocusHeading } from '../../navigation/focusHeading.js';
import { PhotoViewer } from '../../components/photos/PhotoViewer.js';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/index.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { defectTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { changeDefectStatus } from '../../lib/statusChangeApi.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import shared from '../../styles/shared.module.css';
import { useOriginState } from '../../navigation/useOriginState.js';
import type { OriginState } from '../../navigation/origin.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useDiaryEntryTitle } from '../../hooks/useDiaryEntryTitle.js';
import { SiteDetails } from './SiteDetails.js';
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
  const location = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedKeyRef = useRef<string | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation('diary');
  const { t: tErrors } = useTranslation('errors');
  const { t: tc } = useTranslation('common');
  const { showToast } = useToast();
  const statusVariants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();
  const { user: _user } = useAuth();

  const [entry, setEntry] = useState<DiaryEntryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact('diary_entry', showDeleteModal ? entry!.id : null);

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

  // Photo changes in the viewer can change the entry's areas: refetch quietly (no loading state).
  const refreshEntry = async (entryId: string) => {
    try {
      setEntry(await getDiaryEntry(entryId));
    } catch {
      // The page keeps what it has.
    }
  };

  const displayTitle = useDiaryEntryTitle(entry);
  const resolutionStatus =
    (entry?.metadata as { resolutionStatus?: DiaryIssueResolution | null } | null)
      ?.resolutionStatus ?? null;
  const originState = useOriginState(displayTitle);
  const backToDiary = tc('navigation.backTo', { origin: tc('navigation.siteDiary') });
  const h1Text = isLoading
    ? tc('navigation.diaryEntry')
    : notFound || (!error && !entry)
      ? tc('navigation.diaryEntryNotFound')
      : (displayTitle ?? tc('navigation.diaryEntry'));
  useDocumentTitle(h1Text);

  // Arriving from the capture screen: the heading takes focus once per navigation.
  useEffect(() => {
    if (isLoading || !readFocusHeading(location.state)) return;
    if (focusedKeyRef.current === location.key || !headingRef.current) return;
    focusedKeyRef.current = location.key;
    headingRef.current.focus();
  }, [isLoading, location.key, location.state]);

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteError('');
    setDeleteBlocked(false);
  };

  const handleDelete = async (entry: DiaryEntryDetail) => {
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
          <NavAnchor to={routeUrl('diary')} className={shared.btnPrimary}>
            {backToDiary}
          </NavAnchor>
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
        <NavAnchor to={routeUrl('diary')} className={shared.btnSecondary}>
          {backToDiary}
        </NavAnchor>
      </div>
    );
  }

  const isLocked = isDiaryEntrySignatureLocked(entry);
  const isManual = !entry.isAutomatic;

  // Areas: the distinct areas of the photos plus the source task's area.
  const areaChips: AreaSummary[] = [];
  for (const area of [...(entry.photoAreas ?? []), entry.sourceEntityArea ?? null]) {
    if (area && !areaChips.some((existing) => existing.id === area.id)) areaChips.push(area);
  }

  const defectStatusControl =
    entry.entryType === 'issue' && resolutionStatus ? (
      <StatusMenu
        transitions={defectTransitions(tc, {
          resolutionStatus,
          locked: isDiaryEntrySignatureLocked(entry),
        })}
        badge={{ variants: statusVariants.defect, value: resolutionStatus }}
        currentLabel={statusVariants.defect[resolutionStatus].label}
        testId="defect-status"
        onApply={(to) =>
          runStatusChange({
            request: () => changeDefectStatus(entry, to),
            recordName: displayTitle!,
            statusLabel: statusVariants.defect[to].label,
            dedupeKey: `diary_entry:${entry.id}`,
            onChanged: (record) => setEntry(record),
            onUndone: async () => {
              setEntry(await getDiaryEntry(entry.id));
            },
          })
        }
      />
    ) : null;

  const signatures =
    entry.metadata &&
    (entry.entryType === 'daily_log' ||
      entry.entryType === 'site_visit' ||
      entry.entryType === 'issue') &&
    Array.isArray((entry.metadata as { signatures?: DiarySignatureEntry[] }).signatures)
      ? (entry.metadata as { signatures: DiarySignatureEntry[] }).signatures
      : [];

  return (
    <div className={styles.page}>
      <PageBreadcrumbs />
      {isManual && (
        <div className={styles.actions}>
          {!isLocked && (
            <>
              <NavAnchor
                to={routeUrl('diaryEntryEdit', { id: entry.id })}
                state={originState}
                className={`${shared.btnPrimary} ${styles.actionLink}`}
                data-testid="diary-entry-edit"
              >
                {t('detailPage.edit')}
              </NavAnchor>
              <NavAnchor
                to={routeUrl('diaryEntryEdit', { id: entry.id })}
                state={originState}
                className={`${shared.btnSecondary} ${styles.actionLink}`}
                data-testid="diary-entry-add-photos"
              >
                {t('detailPage.addPhotos')}
              </NavAnchor>
            </>
          )}
          <OverflowMenu
            triggerRef={menuTriggerRef}
            triggerAriaLabel={t('entryPage.moreActions')}
            triggerIcon="⋯"
            closeSignal={location.key}
            data-testid="diary-entry-more"
            items={[
              {
                id: 'delete',
                label: tc('button.delete'),
                variant: 'destructive',
                onClick: () => setShowDeleteModal(true),
                testId: 'diary-entry-delete',
              },
            ]}
          />
        </div>
      )}

      <div className={styles.card}>
        {isManual && (
          <section className={styles.photoSection}>
            <h2 className={shared.srOnly}>
              {t('entryPage.photosHeading', { count: photosResult.photos.length })}
            </h2>
            <PhotosWaitingNotice draftId={entry.id} />
            {photosResult.photos.length === 0 ? (
              !isLocked && (
                <div className={styles.photoEmptyState} data-testid="diary-entry-no-photos">
                  <p>{t('detailPage.photosEmpty')}</p>
                  <NavAnchor
                    to={routeUrl('diaryEntryEdit', { id: entry.id })}
                    state={originState}
                    className={styles.addPhotoLink}
                  >
                    {t('detailPage.addPhotos')}
                  </NavAnchor>
                </div>
              )
            ) : (
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
            )}
          </section>
        )}

        <div className={styles.meta}>
          {isManual && (
            <Badge
              variants={statusVariants.diaryType}
              value={entry.entryType}
              testId={`diary-type-badge-${entry.entryType}`}
            />
          )}
          <span className={styles.date}>{formatDate(entry.entryDate)}</span>
          {isManual && entry.createdBy && (
            <span>{t('entryPage.byAuthor', { name: entry.createdBy.displayName })}</span>
          )}
        </div>

        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {h1Text}
        </h1>

        {entry.isAutomatic ? (
          <SystemEventFeedRow entry={entry} as="div" variant="detail" />
        ) : (
          entry.body && <div className={styles.body}>{entry.body}</div>
        )}

        {isManual && <SiteDetails entry={entry} statusControl={defectStatusControl} />}

        {/* Signature Display */}
        {signatures.map((sig, i) => (
          <div
            key={`${sig.signerType}-${sig.signerName}-${i}`} // eslint-disable-line @eslint-react/no-array-index-key -- signatures list may have duplicates; composite key with signerType+name+index is stable
            className={styles.signatureSection}
          >
            <SignatureDisplay
              signatureDataUrl={sig.signatureDataUrl}
              signerName={sig.signerName}
              signedDate={sig.signedAt ? formatDateTime(sig.signedAt) : formatDate(entry.entryDate)}
            />
          </div>
        ))}

        {/* Photo Viewer Modal */}
        {selectedPhotoIndex !== null && selectedPhotoIndex >= 0 && (
          <PhotoViewer
            photos={photosResult.photos}
            initialIndex={selectedPhotoIndex}
            onClose={() => {
              setSelectedPhotoIndex(null);
              setOpenAsAnnotator(false);
            }}
            onPhotoChanged={(photo) => {
              photosResult.updatePhotoInList(photo);
              void refreshEntry(entry.id);
            }}
            editable={!isLocked}
            startInAnnotator={openAsAnnotator}
            onDelete={async (photoId) => {
              await photosResult.deletePhoto(photoId);
              setSelectedPhotoIndex(null);
              void refreshEntry(entry.id);
            }}
          />
        )}

        {isManual && areaChips.length > 0 && (
          <section className={styles.areasSection} data-testid="diary-entry-areas">
            <h2 className={styles.sectionHeading}>{t('entryPage.areas')}</h2>
            <ul className={styles.areaList}>
              {areaChips.map((area) => (
                <li key={area.id}>
                  <NavAnchor
                    // Interim until route `area` (P5.7) → routeUrl('area', { id: area.id })
                    to={routeUrl('areas')}
                    state={originState}
                    className={styles.areaChip}
                    data-testid={`diary-entry-area-${area.id}`}
                  >
                    <AreaBreadcrumb
                      variant="path"
                      segments={[...area.ancestors.map((a) => ({ id: a.id, name: a.name })), area]}
                    />
                  </NavAnchor>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isManual && entry.sourceEntityType && entry.sourceEntityId && (
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

        <details className={styles.history} data-testid="diary-entry-history">
          <summary className={styles.historySummary}>{t('entryPage.history')}</summary>
          <div className={styles.timestamps}>
            <div className={styles.timestamp}>
              <span className={styles.label}>{t('detailPage.created')}</span>
              <span>{formatDateTime(entry.createdAt)}</span>
              {entry.createdBy && <span>{entry.createdBy.displayName}</span>}
            </div>
            {entry.updatedAt && (
              <div className={styles.timestamp}>
                <span className={styles.label}>{t('detailPage.updated')}</span>
                <span>{formatDateTime(entry.updatedAt)}</span>
              </div>
            )}
          </div>
        </details>
      </div>

      {/* Delete confirmation */}
      {showDeleteModal && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', {
            name: displayTitle!,
          })}
          consequences={deleteConsequences}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={isDeleting}
          error={deleteError || null}
          blocked={deleteBlocked}
          returnFocusRef={menuTriggerRef}
          onConfirm={() => void handleDelete(entry)}
          onCancel={() => {
            closeDeleteModal();
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
    <NavAnchor to={route} state={originState}>
      {label}
    </NavAnchor>
  );
}
