import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDavToken } from '../../hooks/useDavToken.js';
import { useFormatters } from '../../lib/formatters.js';
import { FormError } from '../FormError/FormError.js';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { CALENDAR_SYNC_ANCHOR } from './calendarSyncAnchor.js';
import styles from './DavAccessCard.module.css';

export { CALENDAR_SYNC_ANCHOR };

type PendingFocus = 'copy' | 'regenerate' | null;

export function DavAccessCard() {
  const { t } = useTranslation('settings');
  const { formatDate } = useFormatters();
  const { hash } = useLocation();
  const { status, isLoading, error, newToken, generate, revoke, clearNewToken } = useDavToken();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const regenerateRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<PendingFocus>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Move focus to the control the last action calls for, once it is in the DOM.
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    const element = target === 'copy' ? copyRef.current : regenerateRef.current;
    if (element?.isConnected) {
      element.focus();
      pendingFocusRef.current = null;
    }
  }, [newToken, status, showRegenerateConfirm]);

  // Deep link: focus and scroll to the heading.
  useEffect(() => {
    if (hash !== `#${CALENDAR_SYNC_ANCHOR}`) return;
    // After focusPageHeadingWhenReady's first frame, so this focus wins.
    const frame = requestAnimationFrame(() => {
      const heading = headingRef.current;
      if (!heading) return;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const busy = isGenerating || isRevoking;

  const handleGenerate = async () => {
    if (busy) return;
    setIsGenerating(true);
    pendingFocusRef.current = 'copy';
    try {
      await generate();
    } catch {
      // The hook shows the translated error on the section; focus stays on Generate.
      pendingFocusRef.current = null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateConfirm = async () => {
    setIsGenerating(true);
    try {
      await generate();
      // Set after the await so focus never leaves the open dialog early.
      pendingFocusRef.current = 'copy';
    } catch {
      // The hook shows the translated error on the section.
    } finally {
      setIsGenerating(false);
      setShowRegenerateConfirm(false);
    }
  };

  const handleRevoke = async () => {
    setIsRevoking(true);
    try {
      await revoke();
    } catch {
      // The hook shows the translated error on the section.
    } finally {
      setIsRevoking(false);
      setShowRevokeConfirm(false);
    }
  };

  const handleHideToken = () => {
    pendingFocusRef.current = 'regenerate';
    clearNewToken();
  };

  const markCopied = () => {
    setCopySuccess(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleCopyToken = async () => {
    if (!newToken) return;

    try {
      await navigator.clipboard.writeText(newToken);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = newToken;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    markCopied();
  };

  return (
    <section
      className={styles.card}
      aria-labelledby={CALENDAR_SYNC_ANCHOR}
      data-testid="account-sync"
    >
      <h2 id={CALENDAR_SYNC_ANCHOR} ref={headingRef} tabIndex={-1} className={styles.cardTitle}>
        {t('dav.heading')}
      </h2>
      <p className={styles.description}>{t('dav.description')}</p>

      {/* Always mounted so the announcement is reliable; deliberately not atomic. */}
      <span role="status" className={styles.srOnly} data-testid="account-sync-copy-status">
        {copySuccess ? t('dav.tokenCopiedAnnouncement') : ''}
      </span>

      {isLoading ? (
        <Skeleton lines={2} />
      ) : (
        <>
          {error && <FormError message={error} />}

          <div className={styles.statusPanel}>
            {status?.hasToken && status.createdAt
              ? t('dav.tokenActive', { date: formatDate(status.createdAt) })
              : t('dav.noTokenInfo')}
          </div>

          {newToken && (
            <div className={styles.tokenPanel} data-testid="account-sync-token-panel">
              <div role="status" aria-atomic="true" className={styles.tokenMessage}>
                <p className={styles.warning}>{t('dav.tokenWarning')}</p>
                <code className={styles.tokenValue} data-testid="account-sync-token">
                  {newToken}
                </code>
              </div>
              <div className={styles.tokenActions}>
                <button
                  ref={copyRef}
                  type="button"
                  className={styles.compactButton}
                  data-testid="account-sync-copy"
                  onClick={() => void handleCopyToken()}
                >
                  {copySuccess ? t('dav.tokenCopied') : t('dav.copyToken')}
                </button>
                <button
                  type="button"
                  className={styles.compactButton}
                  data-testid="account-sync-hide"
                  onClick={handleHideToken}
                >
                  {t('dav.hideToken')}
                </button>
              </div>
            </div>
          )}

          {status && (
            <div className={styles.urlPanel}>
              <div className={styles.urlLabel}>{t('dav.serverUrl')}</div>
              <div className={styles.url}>{status.davUrl}</div>
            </div>
          )}

          <div className={styles.actions}>
            {status?.hasToken ? (
              <>
                <a
                  href="/api/users/me/dav/profile"
                  download="Cornerstone-DAV.mobileconfig"
                  className={styles.linkButton}
                  data-testid="account-sync-download"
                >
                  {t('dav.downloadProfile')}
                </a>
                <button
                  ref={regenerateRef}
                  type="button"
                  className={styles.secondaryButton}
                  data-testid="account-sync-regenerate"
                  aria-disabled={busy ? 'true' : undefined}
                  onClick={() => {
                    if (!busy) setShowRegenerateConfirm(true);
                  }}
                >
                  {isGenerating ? t('dav.generating') : t('dav.regenerateToken')}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  data-testid="account-sync-revoke"
                  aria-disabled={busy ? 'true' : undefined}
                  onClick={() => {
                    if (!busy) setShowRevokeConfirm(true);
                  }}
                >
                  {isRevoking ? t('dav.revoking') : t('dav.revokeToken')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.secondaryButton}
                data-testid="account-sync-generate"
                aria-disabled={isGenerating ? 'true' : undefined}
                onClick={() => void handleGenerate()}
              >
                {isGenerating ? t('dav.generating') : t('dav.generateToken')}
              </button>
            )}
          </div>
        </>
      )}

      {showRegenerateConfirm && (
        <ConfirmDialog
          title={t('dav.regenerateTitle')}
          lead={t('dav.regenerateLead')}
          irreversible
          confirmLabel={t('dav.regenerateAction')}
          busyLabel={t('dav.generating')}
          busy={isGenerating}
          onConfirm={() => void handleRegenerateConfirm()}
          onCancel={() => setShowRegenerateConfirm(false)}
          returnFocusRef={headingRef}
          testIdPrefix="dav-regenerate"
        />
      )}

      {showRevokeConfirm && (
        <ConfirmDialog
          title={t('dav.revokeTitle')}
          lead={t('dav.revokeLead')}
          irreversible
          confirmLabel={t('dav.revokeAction')}
          busyLabel={t('dav.revoking')}
          busy={isRevoking}
          onConfirm={() => void handleRevoke()}
          onCancel={() => setShowRevokeConfirm(false)}
          returnFocusRef={headingRef}
          testIdPrefix="dav-revoke"
        />
      )}
    </section>
  );
}
