import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { updateProfile, changePassword } from '../../lib/usersApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useLocale, type LocalePreference } from '../../contexts/LocaleContext.js';
import { formatDate } from '../../lib/formatters.js';
import { SettingsSubNav } from '../../components/SettingsSubNav/SettingsSubNav.js';
import styles from './ProfilePage.module.css';

interface PasswordFormErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function ProfilePage() {
  const { t } = useTranslation('settings');
  const { user, isLoading, error: loadError, refreshAuth } = useAuth();
  const { locale, setLocale } = useLocale();

  // Display name state
  const [displayName, setDisplayName] = useState('');
  const [displayNameError, setDisplayNameError] = useState<string>('');
  const [isUpdatingDisplayName, setIsUpdatingDisplayName] = useState(false);
  const [displayNameSuccess, setDisplayNameSuccess] = useState<string>('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<PasswordFormErrors>({});
  const [passwordApiError, setPasswordApiError] = useState<string>('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string>('');

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
    }
  }, [user]);

  const validateDisplayName = (): boolean => {
    if (!displayName.trim()) {
      setDisplayNameError(t('profile.displayName.required'));
      return false;
    }
    if (displayName.length > 100) {
      setDisplayNameError(t('profile.displayName.tooLong'));
      return false;
    }
    setDisplayNameError('');
    return true;
  };

  const handleDisplayNameSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setDisplayNameSuccess('');
    setDisplayNameError('');

    if (!validateDisplayName()) {
      return;
    }

    setIsUpdatingDisplayName(true);

    try {
      await updateProfile({ displayName: displayName.trim() });
      await refreshAuth();
      setDisplayNameSuccess(t('profile.displayName.success'));
    } catch (error) {
      if (error instanceof ApiClientError) {
        setDisplayNameError(error.error.message);
      } else {
        setDisplayNameError(t('profile.displayName.failedGeneric'));
      }
    } finally {
      setIsUpdatingDisplayName(false);
    }
  };

  const validatePasswordForm = (): boolean => {
    const newErrors: PasswordFormErrors = {};

    if (!currentPassword) {
      newErrors.currentPassword = t('profile.password.currentRequired');
    }

    if (!newPassword) {
      newErrors.newPassword = t('profile.password.newRequired');
    } else if (newPassword.length < 12) {
      newErrors.newPassword = t('profile.password.newMinLength');
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = t('profile.password.confirmRequired');
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = t('profile.password.mismatch');
    }

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordApiError('');
    setPasswordSuccess('');

    if (!validatePasswordForm()) {
      return;
    }

    setIsChangingPassword(true);

    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordSuccess(t('profile.password.success'));
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      if (error instanceof ApiClientError) {
        setPasswordApiError(error.error.message);
      } else {
        setPasswordApiError(t('profile.password.failedGeneric'));
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('profile.loading')}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('profile.errorTitle')}</h2>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isLocalAuth = user.authProvider === 'local';

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.pageTitle}>{t('profile.pageTitle')}</h1>
        <SettingsSubNav />

        {/* Profile Information Card */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('profile.info.sectionTitle')}</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile.info.emailLabel')}</span>
              <span className={styles.infoValue}>{user.email}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile.info.roleLabel')}</span>
              <span className={styles.infoValue}>
                {user.role === 'admin' ? t('profile.info.roleAdmin') : t('profile.info.roleMember')}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile.info.authLabel')}</span>
              <span className={styles.infoValue}>
                {user.authProvider === 'local'
                  ? t('profile.info.authLocal')
                  : t('profile.info.authOidc')}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile.info.memberSinceLabel')}</span>
              <span className={styles.infoValue}>{formatDate(user.createdAt)}</span>
            </div>
          </div>
        </section>

        {/* Display Name Edit Card */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('profile.displayName.sectionTitle')}</h2>
          <p className={styles.cardDescription}>{t('profile.displayName.description')}</p>

          {displayNameSuccess && (
            <div className={styles.successBanner} role="alert">
              {displayNameSuccess}
            </div>
          )}

          {displayNameError && (
            <div className={styles.errorBanner} role="alert">
              {displayNameError}
            </div>
          )}

          <form onSubmit={handleDisplayNameSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="displayName" className={styles.label}>
                {t('profile.displayName.label')}
              </label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={styles.input}
                maxLength={100}
                disabled={isUpdatingDisplayName}
                autoComplete="name"
              />
            </div>

            <button
              type="submit"
              className={styles.button}
              disabled={isUpdatingDisplayName || displayName.trim() === user.displayName}
            >
              {isUpdatingDisplayName
                ? t('profile.displayName.submitPending')
                : t('profile.displayName.submitIdle')}
            </button>
          </form>
        </section>

        {/* Password Change Card (local auth only) */}
        {isLocalAuth ? (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('profile.password.sectionTitle')}</h2>
            <p className={styles.cardDescription}>{t('profile.password.description')}</p>

            {passwordSuccess && (
              <div className={styles.successBanner} role="alert">
                {passwordSuccess}
              </div>
            )}

            {passwordApiError && (
              <div className={styles.errorBanner} role="alert">
                {passwordApiError}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="currentPassword" className={styles.label}>
                  {t('profile.password.currentLabel')}
                </label>
                <input
                  type="password"
                  id="currentPassword"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={styles.input}
                  aria-invalid={!!passwordErrors.currentPassword}
                  aria-describedby={
                    passwordErrors.currentPassword ? 'currentPassword-error' : undefined
                  }
                  disabled={isChangingPassword}
                  autoComplete="current-password"
                  maxLength={256}
                />
                {passwordErrors.currentPassword && (
                  <span id="currentPassword-error" className={styles.error} role="alert">
                    {passwordErrors.currentPassword}
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="newPassword" className={styles.label}>
                  {t('profile.password.newLabel')}
                </label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={styles.input}
                  aria-invalid={!!passwordErrors.newPassword}
                  aria-describedby={passwordErrors.newPassword ? 'newPassword-error' : undefined}
                  disabled={isChangingPassword}
                  autoComplete="new-password"
                  maxLength={256}
                />
                {passwordErrors.newPassword && (
                  <span id="newPassword-error" className={styles.error} role="alert">
                    {passwordErrors.newPassword}
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="confirmPassword" className={styles.label}>
                  {t('profile.password.confirmLabel')}
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={styles.input}
                  aria-invalid={!!passwordErrors.confirmPassword}
                  aria-describedby={
                    passwordErrors.confirmPassword ? 'confirmPassword-error' : undefined
                  }
                  disabled={isChangingPassword}
                  autoComplete="new-password"
                  maxLength={256}
                />
                {passwordErrors.confirmPassword && (
                  <span id="confirmPassword-error" className={styles.error} role="alert">
                    {passwordErrors.confirmPassword}
                  </span>
                )}
              </div>

              <button type="submit" className={styles.button} disabled={isChangingPassword}>
                {isChangingPassword
                  ? t('profile.password.submitPending')
                  : t('profile.password.submitIdle')}
              </button>
            </form>
          </section>
        ) : (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('profile.password.oidcSectionTitle')}</h2>
            <p className={styles.oidcMessage}>{t('profile.password.oidcMessage')}</p>
          </section>
        )}

        {/* Preferences Card */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('profile.preferences.sectionTitle')}</h2>
          <div className={styles.field}>
            <label htmlFor="languageSelect" className={styles.label}>
              {t('profile.preferences.languageLabel')}
            </label>
            <select
              id="languageSelect"
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocalePreference)}
              className={styles.input}
            >
              <option value="en">{t('profile.preferences.languageEn')}</option>
              <option value="de">{t('profile.preferences.languageDe')}</option>
              <option value="system">{t('profile.preferences.languageSystem')}</option>
            </select>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ProfilePage;
