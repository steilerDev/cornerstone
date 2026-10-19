import { use, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { CaptureUploadsContext } from '../../../capture/captureUploadsContext.js';
import sharedStyles from '../../../styles/shared.module.css';
import styles from './PhotosWaitingNotice.module.css';

export interface PhotosWaitingNoticeProps {
  draftId: string;
  testId?: string;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function getOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * "‹n› photos waiting to upload" for one draft, with Retry now and the signed / no-room notes.
 * Static text: the host page announces count changes in its own status region. Renders nothing
 * without a CaptureUploadProvider or when nothing is waiting.
 */
export function PhotosWaitingNotice({
  draftId,
  testId = 'photos-waiting-notice',
}: PhotosWaitingNoticeProps) {
  const { t } = useTranslation('photos');
  const api = use(CaptureUploadsContext);
  const online = useSyncExternalStore(subscribeOnline, getOnline, () => true);

  if (!api) return null;
  const items = api.items.filter((item) => item.draftId === draftId);
  if (items.length === 0) return null;

  const anyFailed = items.some((item) => item.state === 'failed');
  const anyBlocked = items.some((item) => item.state === 'blocked');
  const anyMemoryOnly = items.some((item) => !item.persisted);

  return (
    <div className={styles.root} data-testid={testId}>
      <div className={styles.line}>
        <span data-testid={`${testId}-count`}>{t('waiting.count', { count: items.length })}</span>
        {anyFailed || !online ? (
          <button
            type="button"
            className={styles.retry}
            onClick={() => api.retry(draftId)}
            data-testid={`${testId}-retry`}
          >
            {t('waiting.retryNow')}
          </button>
        ) : null}
      </div>
      {anyBlocked ? (
        <p className={styles.note} data-testid={`${testId}-signed`}>
          {t('waiting.signed')}
        </p>
      ) : null}
      {anyMemoryOnly ? (
        <p className={sharedStyles.bannerWarning} data-testid={`${testId}-no-room`}>
          {t('waiting.noRoom')}
        </p>
      ) : null}
    </div>
  );
}
