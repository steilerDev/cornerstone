import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDavToken } from '../../hooks/useDavToken.js';
import { formatDate } from '../../lib/formatters.js';
import { FormError } from '../FormError/FormError.js';
import styles from './DavAccessCard.module.css';

export function DavAccessCard() {
  const { t } = useTranslation('settings');
  const { status, isLoading, error, newToken, generate, revoke, clearNewToken } = useDavToken();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generate();
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevoke = async () => {
    if (window.confirm(t('dav.revokeConfirm'))) {
      setIsRevoking(true);
      try {
        await revoke();
      } finally {
        setIsRevoking(false);
      }
    }
  };

  const handleCopyToken = async () => {
    if (!newToken) return;

    try {
      await navigator.clipboard.writeText(newToken);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = newToken;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('dav.heading')}</h2>
        <div className={styles.loading}>{t('dav.loading')}</div>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t('dav.heading')}</h2>
      <p className={styles.cardDescription}>{t('dav.description')}</p>

      {error && <FormError message={error} />}

      {/* Token Status */}
      <div className={styles.statusSection}>
        {status?.hasToken && status.createdAt ? (
          <div className={styles.statusMessage}>
            {t('dav.tokenActive', { date: formatDate(status.createdAt) })}
          </div>
        ) : (
          <div className={styles.statusMessage}>{t('dav.noTokenInfo')}</div>
        )}
      </div>

      {/* New Token Display */}
      {newToken && (
        <div className={styles.tokenDisplaySection} role="status" aria-atomic="true">
          <div className={styles.tokenWarning}>{t('dav.tokenWarning')}</div>
          <div className={styles.tokenDisplayBox}>
            <code className={styles.tokenValue}>{newToken}</code>
            <button
              type="button"
              className={styles.copyButton}
              onClick={() => void handleCopyToken()}
              aria-label={t('dav.copyToken')}
            >
              {copySuccess ? t('dav.tokenCopied') : t('dav.copyToken')}
            </button>
          </div>
        </div>
      )}

      {/* Server URL for Manual Setup */}
      <div className={styles.serverUrlSection}>
        <div className={styles.serverUrlLabel}>
          {t('dav.serverUrl')}:
        </div>
        <div className={styles.serverUrl}>
          {window.location.origin}/dav/
        </div>
      </div>

      {/* Action Buttons */}
      <div className={styles.actionButtons}>
        {status?.hasToken ? (
          <>
            <button
              type="button"
              className={styles.regenerateButton}
              onClick={() => void handleGenerate()}
              disabled={isGenerating || isRevoking}
            >
              {isGenerating ? t('dav.generating') : t('dav.regenerateToken')}
            </button>
            <button
              type="button"
              className={styles.revokeButton}
              onClick={() => void handleRevoke()}
              disabled={isGenerating || isRevoking}
            >
              {isRevoking ? t('dav.revoking') : t('dav.revokeToken')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.generateButton}
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
          >
            {isGenerating ? t('dav.generating') : t('dav.generateToken')}
          </button>
        )}
      </div>

      {/* Download Profile Link */}
      {status?.hasToken && (
        <div className={styles.downloadSection}>
          <a
            href="/api/users/me/dav/profile"
            download="Cornerstone-DAV.mobileconfig"
            className={styles.downloadLink}
          >
            {t('dav.downloadProfile')}
          </a>
        </div>
      )}

      {/* Clear the token display after it's been seen */}
      {newToken && (
        <button
          type="button"
          className={styles.hideTokenButton}
          onClick={clearNewToken}
          title="Hide token display"
        >
          ×
        </button>
      )}
    </section>
  );
}
