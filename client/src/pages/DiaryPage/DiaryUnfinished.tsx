import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { useDiscardDraft } from '../../capture/useDiscardDraft.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useDiaryEntryTitle } from '../../hooks/useDiaryEntryTitle.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { listDiaryEntries } from '../../lib/diaryApi.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import styles from './DiaryUnfinished.module.css';

const SHOWN = 3;

export interface DiaryUnfinishedProps {
  /** "Show all n": the feed switches to drafts only. */
  onShowAll: () => void;
  /** Takes focus when the last draft is discarded. */
  headingRef: RefObject<HTMLElement | null>;
}

/** The "Unfinished" row above the toolbar: up to three drafts with Continue and Discard. */
export function DiaryUnfinished({ onShowAll, headingRef }: DiaryUnfinishedProps) {
  const { t } = useTranslation('diary');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { showToast } = useToast();
  const { discard, waitingCount } = useDiscardDraft();
  const sectionRef = useRef<HTMLElement>(null);
  const [drafts, setDrafts] = useState<DiaryEntrySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [discarding, setDiscarding] = useState<DiaryEntrySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await listDiaryEntries({
        automatic: false,
        status: 'draft',
        page: 1,
        pageSize: SHOWN,
      });
      setDrafts(response.items);
      setTotal(response.pagination.totalItems);
    } catch {
      setDrafts([]);
      setTotal(0);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDiscard = async (entry: DiaryEntrySummary) => {
    setBusy(true);
    setError(null);
    try {
      await discard(entry.id);

      // Focus the next row's Continue, else the previous row's, else the page heading.
      const links = Array.from(
        sectionRef.current!.querySelectorAll<HTMLElement>('[data-continue]'),
      );
      const index = drafts.findIndex((draft) => draft.id === entry.id);
      const target = links[index + 1] ?? links[index - 1] ?? headingRef.current;

      setDrafts((prev) => prev.filter((draft) => draft.id !== entry.id));
      setTotal((prev) => Math.max(0, prev - 1));
      setDiscarding(null);
      setBusy(false);
      // After the dialog has handed focus back to the heading.
      requestAnimationFrame(() => target?.focus());
      showToast('success', t('unfinished.discarded'));
      void load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('capture.discardFailed'),
      );
      setBusy(false);
    }
  };

  const waiting = discarding ? waitingCount(discarding.id) : 0;
  const photoTotal = discarding ? discarding.photoCount + waiting : 0;
  const lead =
    photoTotal === 0
      ? undefined
      : waiting > 0
        ? t('capture.discardLeadWaiting', { count: photoTotal, waiting })
        : t('capture.discardLead', { count: photoTotal });

  if (drafts.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      className={styles.section}
      aria-labelledby="diary-unfinished-heading"
      data-testid="diary-unfinished"
    >
      <h2 id="diary-unfinished-heading" className={styles.heading}>
        {t('unfinished.heading')}
      </h2>
      <ul className={styles.list}>
        {drafts.map((entry) => (
          <UnfinishedItem
            key={entry.id}
            entry={entry}
            onDiscard={() => {
              setError(null);
              setDiscarding(entry);
            }}
          />
        ))}
      </ul>
      {total > SHOWN ? (
        <button
          type="button"
          className={styles.showAll}
          onClick={onShowAll}
          data-testid="diary-unfinished-show-all"
        >
          {t('unfinished.showAll', { count: total })}
        </button>
      ) : null}

      {discarding ? (
        <ConfirmDialog
          title={tCommon('confirmDialog.discardEntryTitle')}
          lead={lead}
          tone="danger"
          confirmLabel={tCommon('confirmDialog.discard')}
          busyLabel={tCommon('confirmDialog.discarding')}
          cancelLabel={tCommon('confirmDialog.keepEntry')}
          busy={busy}
          error={error}
          returnFocusRef={headingRef}
          onConfirm={() => void confirmDiscard(discarding)}
          onCancel={() => {
            setError(null);
            setDiscarding(null);
          }}
          testIdPrefix="diary-draft-discard"
        />
      ) : null}
    </section>
  );
}

interface UnfinishedItemProps {
  entry: DiaryEntrySummary;
  onDiscard: () => void;
}

function UnfinishedItem({ entry, onDiscard }: UnfinishedItemProps) {
  const { t } = useTranslation('diary');
  const { formatDayMonth } = useFormatters();
  const originState = useOriginState();
  const title = useDiaryEntryTitle(entry)!;

  return (
    <li className={styles.item} data-testid={`diary-unfinished-${entry.id}`}>
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.date}>{formatDayMonth(entry.entryDate)}</span>
      </div>
      <div className={styles.actions}>
        <NavAnchor
          to={routeUrl('diaryEntryEdit', { id: entry.id })}
          state={originState}
          className={styles.continue}
          aria-label={t('unfinished.continueAria', { title })}
          data-continue=""
          data-testid={`diary-unfinished-${entry.id}-continue`}
        >
          {t('unfinished.continue')}
        </NavAnchor>
        <button
          type="button"
          className={styles.discard}
          aria-label={t('unfinished.discardAria', { title })}
          onClick={onDiscard}
          data-testid={`diary-unfinished-${entry.id}-discard`}
        >
          {t('unfinished.discard')}
        </button>
      </div>
    </li>
  );
}
