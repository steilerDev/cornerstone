import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { DiaryEntryDetail, ManualDiaryEntryType, Photo } from '@cornerstone/shared';
import { foldSearchText, routeUrl } from '@cornerstone/shared';
import shared from '../../../styles/shared.module.css';
import { useCaptureUploads } from '../../../capture/captureUploadsContext.js';
import { clearStickyTags } from '../../../capture/stickyTags.js';
import { useAuth } from '../../../contexts/AuthContext.js';
import { useAreas } from '../../../hooks/useAreas.js';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle.js';
import { useOrientations } from '../../../hooks/useOrientations.js';
import { ApiClientError } from '../../../lib/apiClient.js';
import { translateApiError } from '../../../lib/errorTranslation.js';
import { useFormatters } from '../../../lib/formatters.js';
import { todayLocalIsoDate } from '../../../lib/localDate.js';
import { START_PARAM } from '../../../navigation/createQuery.js';
import type { QuickLogMode } from '../../../navigation/createQuery.js';
import { withFocusHeading } from '../../../navigation/focusHeading.js';
import {
  forwardOriginState,
  originHrefOr,
  pathnameOf,
  readOrigin,
} from '../../../navigation/origin.js';
import { AutosaveIndicator } from '../../AutosaveIndicator/AutosaveIndicator.js';
import type { AutosaveState } from '../../AutosaveIndicator/AutosaveIndicator.js';
import { ConfirmDialog } from '../../ConfirmDialog/ConfirmDialog.js';
import { DateChips } from '../../DateChips/DateChips.js';
import { FilterChipGroup } from '../../FilterChipGroup/FilterChipGroup.js';
import { FormError } from '../../FormError/FormError.js';
import { OverflowMenu } from '../../OverflowMenu/OverflowMenu.js';
import { PageLayout } from '../../PageLayout/PageLayout.js';
import { PhotoAnnotateDialog } from '../../photos/PhotoStrip/PhotoAnnotateDialog.js';
import { PhotoStrip } from '../../photos/PhotoStrip/PhotoStrip.js';
import { PhotoTagSheet } from '../../photos/PhotoStrip/PhotoTagSheet.js';
import { PhotosWaitingNotice } from '../../photos/PhotoStrip/PhotosWaitingNotice.js';
import { TagChips } from '../../photos/TagChips/TagChips.js';
import { RapidCamera } from '../../RapidCamera/RapidCamera.js';
import { Skeleton } from '../../Skeleton/Skeleton.js';
import { useToast } from '../../Toast/ToastContext.js';
import { StickyActionBar } from '../../StickyActionBar/StickyActionBar.js';
import { DiaryEntryTypeBadge } from '../DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { I18N_UNION_KEYS } from '../../../i18n/unionKeys.js';
import { EntryTypeChips } from './EntryTypeChips.js';
import { SiteDetailsFields } from './SiteDetailsFields.js';
import { moveToEntry, newMoveProgress } from './moveToEntry.js';
import type { MoveProgress } from './moveToEntry.js';
import {
  CAPTURE_FIELD_ORDER,
  hasContent,
  isSignatureComplete,
  typeHasSignatures,
  validateForSave,
} from './captureMetadata.js';
import type { CaptureMode, DroppedDetail, DroppedKey } from './captureMetadata.js';
import { floorOf, rankCompanies, recentTimes, recentTitles } from './captureSuggestions.js';
import { useCaptureDraft } from './useCaptureDraft.js';
import { useCapturePhotos } from './useCapturePhotos.js';
import { useCaptureSuggestions } from './useCaptureSuggestions.js';
import { useSameTitleLookup } from './useSameTitleLookup.js';
import styles from './CaptureScreen.module.css';

export interface CaptureScreenProps {
  mode: CaptureMode;
  entry: DiaryEntryDetail | null;
  photos: readonly Photo[];
  prefill: { areaId: string | null; date: string | null };
  /** Location trail, rendered by the page in every state. */
  breadcrumbs: ReactNode;
  /** The screen created the draft (the page must not reload it). */
  onDraftCreated: (id: string) => void;
  /** `?start=` (Log now tile): applied once on a new entry. */
  start?: QuickLogMode | null;
}

const START_ENTRY_TYPE: Readonly<Record<QuickLogMode, ManualDiaryEntryType>> = {
  photo: 'daily_log',
  note: 'general_note',
  delivery: 'delivery',
};

const DROPPED_LABEL_KEYS: Readonly<Record<DroppedKey, string>> = {
  signatures: 'capture.dropped.signatures',
  weather: 'capture.dropped.weather',
  temperature: 'capture.dropped.temperature',
  workers: 'capture.dropped.workers',
  company: 'capture.dropped.company',
  times: 'capture.dropped.times',
  inspector: 'capture.dropped.inspector',
  outcome: 'capture.dropped.outcome',
  severity: 'capture.dropped.severity',
  status: 'capture.dropped.status',
  materials: 'capture.dropped.materials',
  deliveryConfirmed: 'capture.dropped.deliveryConfirmed',
};

function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const target = el.matches('input, button, textarea')
    ? el
    : el.querySelector<HTMLElement>('input, button');
  target?.focus();
}

function CameraIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M5 17l5-5 4 4 2-2 3 3" />
    </svg>
  );
}

/**
 * The capture screen: photos first, then date, title, text, type and site details, with a
 * sticky bar that shows the autosave state and the Save button. Serves a new entry, a draft and
 * the edit of a saved entry.
 */
export function CaptureScreen({
  mode: initialMode,
  entry,
  photos: initialPhotos,
  prefill,
  breadcrumbs,
  onDraftCreated,
  start = null,
}: CaptureScreenProps) {
  const { t } = useTranslation('diary');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const api = useCaptureUploads();
  const { formatWeekdayShort, formatDayMonth, formatTime } = useFormatters();
  const { areas, isLoading: areasLoading, refetch: refetchAreas } = useAreas();
  const {
    orientations,
    isLoading: orientationsLoading,
    refetch: refetchOrientations,
  } = useOrientations();
  const baseId = useId();
  const titleLabelId = `${baseId}-title`;
  const reasonId = `${baseId}-reason`;

  const [announcement, setAnnouncement] = useState('');
  const [today] = useState(() => todayLocalIsoDate());
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const nullItemIdsRef = useRef<string[]>([]);
  const typeRowRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const moveProgressRef = useRef(new Map<string, MoveProgress>());

  const handleCreated = (id: string) => {
    onDraftCreated(id);
    if (nullItemIdsRef.current.length > 0) {
      api.assignDraft(nullItemIdsRef.current, id);
      nullItemIdsRef.current = [];
    }
    navigate(routeUrl('diaryEntryEdit', { id }), {
      replace: true,
      state: forwardOriginState(location.state),
    });
  };

  const [startMode] = useState<QuickLogMode | null>(() => (initialMode === 'new' ? start : null));
  const [arrival] = useState(() => ({
    search: location.search,
    hash: location.hash,
    state: location.state,
  }));

  const draft = useCaptureDraft({
    mode: initialMode,
    entry,
    prefillDate: prefill.date,
    prefillType: startMode ? START_ENTRY_TYPE[startMode] : null,
    onDraftCreated: handleCreated,
    announce: setAnnouncement,
  });
  const { form } = draft;
  const mode = draft.mode;

  const photos = useCapturePhotos({
    draftId: draft.draftId,
    getDraftId: draft.getDraftId,
    initialPhotos,
    prefillAreaId: prefill.areaId,
    areas,
    areasReady: !areasLoading,
    orientations,
    userId: user?.id ?? '',
    ensureDraft: draft.ensureDraft,
    nullItemIdsRef,
    announce: setAnnouncement,
  });

  // `?start=` is consumed once: removed from the URL (replace, no remount) so a reload does not
  // reopen the camera or reset the type.
  const consumedRef = useRef(false);
  useEffect(() => {
    if (!startMode || consumedRef.current) return;
    consumedRef.current = true;
    const params = new URLSearchParams(arrival.search);
    params.delete(START_PARAM);
    const search = params.toString();
    void navigate(
      { search: search ? `?${search}` : '', hash: arrival.hash },
      { replace: true, state: arrival.state },
    );
  }, [startMode, arrival, navigate]);

  // ... and applied once: photo opens the live camera (or focuses "Take photos"), note and
  // delivery focus the title. Nothing is written.
  const appliedRef = useRef(false);
  const { cameraKnown, openLiveCamera, takeButtonRef, chooseButtonRef } = photos.inputs;
  useEffect(() => {
    if (!startMode || appliedRef.current) return undefined;
    if (startMode === 'photo') {
      if (!cameraKnown) return undefined;
      if (openLiveCamera()) {
        appliedRef.current = true;
        return undefined;
      }
    }
    const frame = window.requestAnimationFrame(() => {
      appliedRef.current = true;
      if (startMode === 'photo') (takeButtonRef.current ?? chooseButtonRef.current)?.focus();
      else focusField('capture-title');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [startMode, cameraKnown, openLiveCamera, takeButtonRef, chooseButtonRef]);

  const floorId = floorOf(photos.chips.areaId ?? photos.mostCommonAreaId, areas);
  const suggestions = useCaptureSuggestions(floorId);
  const titles = useMemo(() => recentTitles(suggestions.entries), [suggestions.entries]);
  const companies = useMemo(
    () =>
      rankCompanies(suggestions.entries, form.title, suggestions.floorVendors, {
        requireId: form.entryType === 'daily_log',
      }),
    [form.entryType, form.title, suggestions.entries, suggestions.floorVendors],
  );
  const recentStart = useMemo(
    () => recentTimes(suggestions.entries, 'workStart'),
    [suggestions.entries],
  );
  const recentEnd = useMemo(
    () => recentTimes(suggestions.entries, 'workEnd'),
    [suggestions.entries],
  );

  const matches = useSameTitleLookup({
    entryDate: form.entryDate,
    title: form.title,
    excludeId: draft.draftId,
    onNewMatches: () => setAnnouncement(t('capture.announce.lookup')),
  });

  // ── Heading ─────────────────────────────────────────────────────────────────────────────────

  const [year = 1970, month = 1, day = 1] = form.entryDate.split('-').map(Number);
  const dateText = `${formatWeekdayShort(new Date(year, month - 1, day, 12))}, ${formatDayMonth(form.entryDate)}`;
  const h1Text = t(mode === 'saved' ? 'capture.titleEdit' : 'capture.titleNew', { date: dateText });
  useDocumentTitle(h1Text);

  const currentUserName = user ? user.displayName.trim() || user.email : undefined;
  const typeLabel = (type: ManualDiaryEntryType) =>
    tCommon(I18N_UNION_KEYS.statusVocabularyDiaryType.key(type));

  // ── Leave guards ────────────────────────────────────────────────────────────────────────────

  const guardUnload = (mode === 'saved' && draft.dirty) || photos.hasMemoryOnlyItems;
  useEffect(() => {
    if (!guardUnload) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [guardUnload]);

  const leaveTo = (destination: string) =>
    navigate(destination, {
      replace: true,
      state: withFocusHeading(forwardOriginState(location.state)),
    });

  const returnToEntry = (entryId: string) => {
    const entryPath = routeUrl('diaryEntry', { id: entryId });
    const origin = readOrigin(location.state);
    if (origin && pathnameOf(origin.to) === entryPath) navigate(-1);
    else leaveTo(entryPath);
  };

  // ── Discard and cancel ──────────────────────────────────────────────────────────────────────

  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const leaveEmpty = () => {
    for (const id of nullItemIdsRef.current) api.remove(id);
    nullItemIdsRef.current = [];
    leaveTo(originHrefOr(location.state, routeUrl('diary')));
  };

  const requestDiscard = () => {
    if (!draft.draftId) leaveEmpty();
    else setDiscardOpen(true);
  };

  const confirmDiscard = async () => {
    setDiscarding(true);
    setDiscardError(null);
    try {
      let discardedId: string | null = null;
      await draft.discard(async (id) => {
        discardedId = id;
        await api.discardDraft(id);
      });
      if (discardedId) clearStickyTags(discardedId);
      leaveTo(originHrefOr(location.state, routeUrl('diary')));
    } catch (err) {
      draft.resumeAfterFailedDiscard();
      setDiscardError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('capture.discardFailed'),
      );
      setDiscarding(false);
    }
  };

  const photoTotal = photos.uploadedCount + photos.pendingCount;
  const discardLead =
    photoTotal === 0
      ? undefined
      : photos.pendingCount > 0
        ? t('capture.discardLeadWaiting', { count: photoTotal, waiting: photos.pendingCount })
        : t('capture.discardLead', { count: photoTotal });

  const requestCancel = () => {
    if (draft.dirty) setCancelOpen(true);
    else if (entry) returnToEntry(entry.id);
  };

  // ── Entry type ──────────────────────────────────────────────────────────────────────────────

  const [switchDialog, setSwitchDialog] = useState<{
    to: ManualDiaryEntryType;
    dropped: DroppedDetail[];
  } | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const pressedTypeChip = () =>
    typeRowRef.current?.querySelector<HTMLElement>(
      '[aria-pressed="true"], [data-current="true"]',
    ) ?? null;

  const droppedLabel = (detail: DroppedDetail) =>
    t(DROPPED_LABEL_KEYS[detail.key], { count: detail.count ?? 0 });

  const afterTypeChange = (to: ManualDiaryEntryType, dropped: DroppedDetail[]) => {
    setMoreOpen(false);
    window.requestAnimationFrame(() => pressedTypeChip()?.focus());
    if (dropped.length > 0) {
      setAnnouncement(
        t('capture.announce.typeChanged', {
          type: typeLabel(to),
          list: dropped.map(droppedLabel).join(', '),
        }),
      );
    }
  };

  const handleTypeSelect = async (to: ManualDiaryEntryType) => {
    setActionError(null);
    const result = await draft.requestTypeChange(to);
    if (result.kind === 'confirm') {
      setSwitchError(null);
      setSwitchDialog({ to: result.to, dropped: result.dropped });
    } else if (result.kind === 'applied') {
      afterTypeChange(to, []);
    } else {
      setActionError(t('capture.typeChangeFailed'));
    }
  };

  const confirmSwitch = async () => {
    if (!switchDialog) return;
    setSwitchBusy(true);
    const ok = await draft.applyTypeChange(switchDialog.to);
    setSwitchBusy(false);
    if (ok) {
      const { to, dropped } = switchDialog;
      setSwitchDialog(null);
      afterTypeChange(to, dropped);
    } else {
      setSwitchError(t('capture.typeChangeFailed'));
    }
  };

  // ── Same title and day ──────────────────────────────────────────────────────────────────────

  const [move, setMove] = useState<{ id: string; status: 'busy' | 'failed' | 'signed' } | null>(
    null,
  );
  const f = form.fields;
  const hasSiteDetails =
    form.signatures.length > 0 ||
    f.weather !== null ||
    f.workers !== null ||
    f.vendorId !== null ||
    f.vendor !== null ||
    f.workStart !== null ||
    f.inspectorName.trim() !== '' ||
    f.outcome !== null ||
    f.severity !== null ||
    f.materials.length > 0;

  const addToMatch = async (match: (typeof matches)[number]) => {
    const draftId = draft.draftId;
    if (!draftId) return;
    setMove({ id: match.id, status: 'busy' });
    let progress = moveProgressRef.current.get(match.id);
    if (!progress) {
      progress = newMoveProgress();
      moveProgressRef.current.set(match.id, progress);
    }
    const result = await moveToEntry({
      draftId,
      match,
      body: form.body,
      serverPhotos: photos.serverPhotos,
      api,
      progress,
    });
    if (result.status === 'done') {
      showToast('success', t('capture.addedToast', { title: match.title }));
      navigate(routeUrl('diaryEntry', { id: match.id }), {
        replace: true,
        state: withFocusHeading(forwardOriginState(location.state)),
      });
    } else {
      setMove({ id: match.id, status: result.status });
    }
  };

  // ── Saving ──────────────────────────────────────────────────────────────────────────────────

  const errors = attempted
    ? validateForSave(form.entryType, mode, form.fields, form.signatures)
    : {};
  const contentOk = hasContent(form.title, form.body, photos.uploadedCount);
  const onlyWaitingPhotos = !contentOk && photos.uploadedCount === 0 && photos.pendingCount > 0;
  const saveReason = contentOk
    ? null
    : onlyWaitingPhotos
      ? t('capture.saveWaitForPhoto')
      : t('capture.saveDisabledReason');
  const saveBlocked = saveReason !== null || draft.submitting;
  const signed = typeHasSignatures(form.entryType) && form.signatures.some(isSignatureComplete);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saveBlocked) return;
    setAttempted(true);
    setSaveError(null);
    const found = validateForSave(form.entryType, mode, form.fields, form.signatures);
    const invalid = CAPTURE_FIELD_ORDER.filter((field) => found[field]);
    if (invalid.length > 0) {
      setAnnouncement(t('capture.announce.thingsToFix', { count: invalid.length }));
      window.requestAnimationFrame(() => focusField(`capture-field-${invalid[0]}`));
      return;
    }
    const result = await draft.submit();
    if (result.status === 'error') {
      setSaveError(result.photosMissing ? t('capture.saveDisabledReason') : result.message);
      return;
    }
    clearStickyTags(result.id);
    if (mode === 'saved') returnToEntry(result.id);
    else leaveTo(routeUrl('diaryEntry', { id: result.id }));
  };

  // ── Sticky bar ──────────────────────────────────────────────────────────────────────────────

  const statusState: AutosaveState =
    draft.saveStatus === 'saving'
      ? 'saving'
      : draft.saveStatus === 'saved'
        ? 'success'
        : draft.saveStatus === 'idle'
          ? 'idle'
          : 'error';
  const statusLabel =
    draft.saveStatus === 'saving'
      ? t('capture.savingStatus')
      : draft.saveStatus === 'saved'
        ? t('capture.saved', { time: formatTime(draft.savedAt) })
        : draft.saveStatus === 'failed'
          ? t('capture.saveFailed')
          : draft.saveStatus === 'offline'
            ? t('capture.offline')
            : '';

  const tagChipProps = {
    areas,
    orientations,
    recentAreaIds: photos.chips.recentAreaIds,
    recentOrientationIds: photos.chips.recentOrientationIds,
    areaId: photos.chips.areaId,
    orientationId: photos.chips.orientation,
    // An area or orientation created in place is not in the loaded lists yet.
    onAreaChange: (id: string | null) => {
      if (id && !areas.some((area) => area.id === id)) refetchAreas();
      photos.chips.onAreaChange(id);
    },
    onOrientationChange: (choice: string | null) => {
      if (choice && choice !== 'none' && !orientations.some((o) => o.id === choice)) {
        refetchOrientations();
      }
      photos.chips.onOrientationChange(choice);
    },
  };

  const titleChipValue =
    titles.find((title) => foldSearchText(title.trim()) === foldSearchText(form.title.trim())) ??
    '';
  const visibleMatches = draft.draftId ? matches : [];
  const tagsLoading = areasLoading || orientationsLoading;

  const menu =
    mode === 'saved' ? undefined : (
      <OverflowMenu
        usePortal
        triggerRef={menuTriggerRef}
        triggerAriaLabel={t('capture.moreActions')}
        data-testid="capture-menu"
        items={[
          {
            id: 'discard',
            label: t('capture.discardEntry'),
            variant: 'destructive',
            onClick: requestDiscard,
            testId: 'capture-discard',
          },
        ]}
      />
    );

  return (
    <PageLayout title={h1Text} breadcrumbs={breadcrumbs} action={menu} testId="capture-screen">
      <form
        className={styles.form}
        onSubmit={(event) => void handleSubmit(event)}
        onKeyDown={(event) => {
          // Enter in a text field must not save the entry; Save stays a button.
          if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
            event.preventDefault();
          }
        }}
        noValidate
      >
        <div className={styles.columns}>
          <div className={styles.column}>
            {photos.orphans.length > 0 && (
              <div className={styles.orphans} data-testid="capture-orphans">
                <span>{t('capture.orphans', { count: photos.orphans.length })}</span>
                <div className={styles.orphanActions}>
                  <button
                    type="button"
                    className={shared.btnSecondaryCompact}
                    onClick={() => void photos.continueOrphans()}
                  >
                    {t('capture.continue')}
                  </button>
                  <button
                    type="button"
                    className={shared.btnSecondaryCompact}
                    onClick={photos.discardOrphans}
                  >
                    {t('capture.discardOrphans')}
                  </button>
                </div>
              </div>
            )}

            {draft.draftId && <PhotosWaitingNotice draftId={draft.draftId} />}

            {draft.createFailed && !draft.draftId && (
              <div className={styles.inlineError}>
                <FormError message={t('capture.draftFailed')} />
                <button
                  type="button"
                  className={shared.btnSecondaryCompact}
                  onClick={() => void draft.ensureDraft()}
                >
                  {tCommon('button.retry')}
                </button>
              </div>
            )}

            <div
              className={`${styles.dropZone} ${photos.inputs.dragActive ? styles.dropActive : ''}`}
              {...photos.inputs.dropHandlers}
              data-testid="capture-drop-zone"
            >
              <div className={styles.photoButtons}>
                {photos.inputs.showTakePhotos && (
                  <button
                    ref={photos.inputs.takeButtonRef}
                    type="button"
                    className={`${shared.btnSecondary} ${styles.photoButton}`}
                    onClick={photos.inputs.takePhotos}
                    data-testid="capture-take-photos"
                  >
                    <CameraIcon />
                    {t('capture.takePhotos')}
                  </button>
                )}
                <button
                  ref={photos.inputs.chooseButtonRef}
                  type="button"
                  className={`${shared.btnSecondary} ${styles.photoButton}`}
                  onClick={photos.inputs.chooseFromLibrary}
                  data-testid="capture-choose-photos"
                >
                  <ImageIcon />
                  {t('capture.chooseFromLibrary')}
                </button>
              </div>
              <p className={styles.dropHint}>{t('capture.dropHint')}</p>
              <input
                ref={photos.inputs.libraryInputRef}
                type="file"
                accept="image/*"
                multiple
                className={shared.srOnly}
                tabIndex={-1}
                aria-hidden="true"
                onChange={photos.inputs.onLibraryChange}
                data-testid="capture-library-input"
              />
              <input
                ref={photos.inputs.cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className={shared.srOnly}
                tabIndex={-1}
                aria-hidden="true"
                onChange={photos.inputs.onCameraInputChange}
                data-testid="capture-camera-input"
              />
            </div>

            <PhotoStrip
              tiles={photos.tiles}
              selectedKeys={photos.selectedKeys}
              onToggleSelect={photos.toggleSelect}
              onOpen={photos.openTile}
              onRetry={() => photos.retry()}
              onRemove={(key) => void photos.removeTile(key)}
              emptyFocusRef={photos.inputs.chooseButtonRef}
            />

            <div className={styles.applyRow}>
              <span className={styles.applyText} data-testid="capture-tags-apply">
                {photos.selectedKeys.size > 0
                  ? t('capture.tagsApplySelected', { count: photos.selectedKeys.size })
                  : t('capture.tagsApplyNew')}
              </span>
              {photos.selectedKeys.size === 0 && photos.tiles.length >= 2 && (
                <button
                  type="button"
                  className={shared.btnSecondaryCompact}
                  onClick={photos.selectAll}
                >
                  {t('capture.selectAll')}
                </button>
              )}
              {photos.selectedKeys.size > 0 && (
                <button
                  type="button"
                  className={shared.btnSecondaryCompact}
                  onClick={photos.clearSelection}
                >
                  {t('capture.clearSelection')}
                </button>
              )}
            </div>

            {tagsLoading ? (
              <Skeleton lines={2} />
            ) : (
              <TagChips {...tagChipProps} layout="wrap" idPrefix="capture" />
            )}
          </div>

          <div className={styles.column}>
            <DateChips
              value={form.entryDate}
              onChange={draft.setEntryDate}
              today={today}
              max={today}
              labels={{
                group: t('capture.date'),
                today: t('capture.today'),
                yesterday: t('capture.yesterday'),
                pick: t('capture.pick'),
                pickWithDate: (formatted) => t('capture.pickWithDate', { date: formatted }),
                input: t('capture.entryDateInput'),
              }}
              formatPicked={(iso) => formatDayMonth(iso)}
              hint={photoTotal > 0 ? t('capture.photosUseDate') : undefined}
            />

            <div className={styles.group}>
              <span id={titleLabelId} className={styles.label}>
                {t('capture.title')}
              </span>
              {titles.length > 0 && (
                <div className={styles.titleChips}>
                  <FilterChipGroup
                    options={titles.map((title) => ({ value: title, label: title }))}
                    value={titleChipValue}
                    onChange={(value) => draft.setTitle(value, 'now')}
                    labelledBy={titleLabelId}
                    layout="wrap"
                    deselectable
                    testIdPrefix="capture-title-chip"
                  />
                </div>
              )}
              <label htmlFor="capture-title" className={shared.srOnly}>
                {t('capture.titleText')}
              </label>
              <input
                id="capture-title"
                type="text"
                className={`${shared.input} ${styles.input}`}
                autoComplete="off"
                maxLength={1000}
                placeholder={t('capture.titlePlaceholder')}
                value={form.title}
                onChange={(event) => draft.setTitle(event.target.value)}
                data-testid="capture-title-input"
              />
              {visibleMatches.map((match) => {
                const hintId = `${baseId}-hint-${match.id}`;
                const state = move?.id === match.id ? move.status : null;
                return (
                  <div key={match.id} className={styles.lookup} data-testid="capture-lookup">
                    <p className={styles.lookupText}>
                      {t('capture.lookupNotice', {
                        title: match.title,
                        date: dateText,
                      })}
                    </p>
                    <p className={styles.lookupMeta}>
                      {t('capture.lookupMeta', {
                        type: typeLabel(match.entryType),
                        count: match.photoCount,
                      })}
                    </p>
                    <span id={hintId} className={styles.lookupMeta}>
                      {hasSiteDetails
                        ? t('capture.addToThatHint')
                        : t('capture.addToThatHintNoDetails')}
                    </span>
                    {state === 'signed' && (
                      <FormError variant="field" message={t('capture.signedMatch')} />
                    )}
                    {state === 'failed' && (
                      <FormError variant="field" message={t('capture.addFailed')} />
                    )}
                    {state === 'failed' ? (
                      <button
                        type="button"
                        className={shared.btnSecondaryCompact}
                        onClick={() =>
                          navigate(routeUrl('diaryEntry', { id: match.id }), {
                            state: forwardOriginState(location.state),
                          })
                        }
                      >
                        {t('capture.openThat')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${shared.btnSecondaryCompact} ${styles.lookupButton}`}
                        aria-disabled={state === 'busy' || undefined}
                        aria-describedby={hintId}
                        onClick={() => {
                          if (state !== 'busy') void addToMatch(match);
                        }}
                        data-testid="capture-add-to-that"
                      >
                        {state === 'busy' ? t('capture.adding') : t('capture.addToThat')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.group}>
              <label htmlFor="capture-text" className={styles.label}>
                {t('capture.text')}
              </label>
              <textarea
                id="capture-text"
                className={`${shared.textarea} ${styles.textarea}`}
                rows={4}
                maxLength={10000}
                value={form.body}
                onChange={(event) => draft.setBody(event.target.value)}
                data-testid="capture-text-input"
              />
            </div>

            {mode === 'saved' ? (
              <div className={styles.group}>
                <span className={styles.label}>{t('capture.entryType')}</span>
                <div>
                  <DiaryEntryTypeBadge entryType={form.entryType} size="sm" />
                </div>
              </div>
            ) : (
              <EntryTypeChips
                value={form.entryType}
                onSelect={(type) => void handleTypeSelect(type)}
                rowRef={typeRowRef}
              />
            )}

            <SiteDetailsFields
              entryType={form.entryType}
              mode={mode}
              fields={form.fields}
              signatures={form.signatures}
              errors={errors}
              companies={companies}
              recentStart={recentStart}
              recentEnd={recentEnd}
              currentUserName={currentUserName}
              onFields={draft.setFields}
              onSignatures={draft.setSignatures}
              moreOpen={moreOpen}
              onMoreOpenChange={setMoreOpen}
            />
          </div>
        </div>

        <FormError message={saveError ?? actionError} />

        <StickyActionBar
          status={
            mode === 'saved' ? undefined : (
              <AutosaveIndicator state={statusState} variant="text" label={statusLabel} />
            )
          }
          announcement={announcement}
          note={signed ? t('capture.signedLock') : undefined}
        >
          {draft.saveStatus === 'failed' && (
            <button
              type="button"
              className={shared.btnSecondaryCompact}
              onClick={draft.retrySave}
              data-testid="capture-retry-save"
            >
              {tCommon('button.retry')}
            </button>
          )}
          {mode === 'saved' && (
            <button
              type="button"
              className={shared.btnSecondary}
              onClick={requestCancel}
              data-testid="capture-cancel"
            >
              {tCommon('button.cancel')}
            </button>
          )}
          <button
            type="submit"
            className={styles.saveButton}
            aria-disabled={saveBlocked || undefined}
            aria-describedby={saveReason ? reasonId : undefined}
            data-testid="capture-save"
          >
            {draft.submitting
              ? t('capture.saving')
              : mode === 'saved'
                ? t('capture.saveChanges')
                : t('capture.saveEntry')}
          </button>
          {saveReason && (
            <span id={reasonId} className={shared.srOnly}>
              {saveReason}
            </span>
          )}
        </StickyActionBar>
      </form>

      {photos.sheet.props && (
        <PhotoTagSheet
          {...photos.sheet.props}
          returnFocusRef={photos.sheet.returnFocusRef}
          onAnnotate={photos.sheet.onAnnotate}
          onRemove={photos.sheet.onRemove}
        />
      )}
      {photos.annotate.photo && (
        <PhotoAnnotateDialog
          photo={photos.annotate.photo}
          onSaved={photos.annotate.onSaved}
          onClose={photos.annotate.onClose}
          returnFocusRef={photos.sheet.annotateOpenerRef}
        />
      )}
      {photos.camera.open && (
        <RapidCamera
          open
          onShot={photos.camera.onShot}
          onClose={photos.camera.onClose}
          onUseCameraApp={photos.camera.onUseCameraApp}
          shotCount={photos.camera.shotCount}
          lastShotUrl={photos.camera.lastShotUrl}
          onRemoveLast={photos.camera.onRemoveLast}
          returnFocusRef={photos.inputs.takeButtonRef}
        >
          <TagChips {...tagChipProps} tone="onPhoto" layout="scroll" idPrefix="camera" />
        </RapidCamera>
      )}

      {discardOpen && (
        <ConfirmDialog
          title={tCommon('confirmDialog.discardEntryTitle')}
          lead={discardLead}
          tone="danger"
          confirmLabel={tCommon('confirmDialog.discard')}
          busyLabel={tCommon('confirmDialog.discarding')}
          cancelLabel={tCommon('confirmDialog.keepEntry')}
          busy={discarding}
          error={discardError}
          returnFocusRef={menuTriggerRef}
          onConfirm={() => void confirmDiscard()}
          onCancel={() => {
            if (!discarding) {
              setDiscardError(null);
              setDiscardOpen(false);
            }
          }}
          testIdPrefix="capture-discard"
        />
      )}

      {cancelOpen && entry && (
        <ConfirmDialog
          title={tCommon('confirmDialog.discardChangesTitle')}
          tone="danger"
          confirmLabel={tCommon('confirmDialog.discard')}
          busyLabel={tCommon('confirmDialog.discarding')}
          cancelLabel={tCommon('confirmDialog.keepEditing')}
          busy={false}
          onConfirm={() => returnToEntry(entry.id)}
          onCancel={() => setCancelOpen(false)}
          testIdPrefix="capture-cancel-dialog"
        />
      )}

      {switchDialog && (
        <ConfirmDialog
          title={t('capture.switchTitle', { type: typeLabel(switchDialog.to) })}
          lead={t('capture.switchLead', { type: typeLabel(switchDialog.to) })}
          tone="danger"
          confirmLabel={t('capture.switchAction')}
          busyLabel={t('capture.switching')}
          cancelLabel={tCommon('confirmDialog.keepEditing')}
          busy={switchBusy}
          error={switchError}
          onConfirm={() => void confirmSwitch()}
          onCancel={() => {
            if (switchBusy) return;
            setSwitchDialog(null);
            // The dialog restores focus to the chip that was tapped; the type did not change,
            // so focus belongs on the chip that is still pressed.
            window.requestAnimationFrame(() => pressedTypeChip()?.focus());
          }}
          testIdPrefix="capture-switch"
        >
          <ul className={styles.droppedList}>
            {switchDialog.dropped.map((detail) => (
              <li key={detail.key}>{droppedLabel(detail)}</li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </PageLayout>
  );
}
