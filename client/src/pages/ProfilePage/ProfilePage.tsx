import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { updateProfile, changePassword } from '../../lib/usersApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useLocale, type LocalePreference } from '../../contexts/LocaleContext.js';
import { useFormatters } from '../../lib/formatters.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav, type SubNavTab } from '../../components/SubNav/SubNav.js';
import { DavAccessCard } from '../../components/DavAccessCard/DavAccessCard.js';
import styles from './ProfilePage.module.css';

interface PasswordFormErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function ProfilePage() {
  const { t } = useTranslation('settings');
  const { formatCurrency, formatDate, formatTime, formatDateTime } = useFormatters();
  const { user, isLoading, error: loadError, refreshAuth } = useAuth();
  const { locale, setLocale } = useLocale();

  const settingsTabs: SubNavTab[] = [
    { labelKey: 'subnav.settings.profile', to: '/settings/profile', ns: 'common' },
    { labelKey: 'subnav.settings.manage', to: '/settings/manage', ns: 'common' },
    { labelKey: 'subnav.settings.userManagement', to: '/settings/users', ns: 'common', visible: user?.role === 'admin' },
    { labelKey: 'subnav.settings.backups', to: '/settings/backups', ns: 'common', visible: user?.role === 'admin' },
  ];

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
      setDisplayNameError(t('profile.displayNameRequired'));
      return false;
    }
    if (displayName.length > 100) {
      setDisplayNameError(t('profile.displayNameTooLong'));
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
      setDisplayNameSuccess(t('profile.displayNameUpdatedSuccess'));
    } catch (error) {
      if (error instanceof ApiClientError) {
        setDisplayNameError(error.error.message);
      } else {
        setDisplayNameError(t('profile.displayNameUpdateFailed'));
      }
    } finally {
      setIsUpdatingDisplayName(false);
    }
  };

  const validatePasswordForm = (): boolean => {
    const newErrors: PasswordFormErrors = {};

    if (!currentPassword) {
      newErrors.currentPassword = t('profile.currentPasswordRequired');
    }

    if (!newPassword) {
      newErrors.newPassword = t('profile.newPasswordRequired');
    } else if (newPassword.length < 12) {
      newErrors.newPassword = t('profile.newPasswordTooShort');
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = t('profile.confirmPasswordRequired');
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = t('profile.passwordsDoNotMatch');
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
      setPasswordSuccess(t('profile.passwordChangedSuccess'));
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      if (error instanceof ApiClientError) {
        setPasswordApiError(error.error.message);
      } else {
        setPasswordApiError(t('profile.passwordChangeFailed'));
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <PageLayout
      maxWidth="narrow"
        title={t('profile.pageTitle')}
        subNav={<SubNav tabs={settingsTabs} ariaLabel="Settings section navigation" />}
      >
        <div className={styles.loading}>{t('profile.loading')}</div>
      </PageLayout>
    );
  }

  if (loadError) {
    return (
      <PageLayout
      maxWidth="narrow"
        title={t('profile.pageTitle')}
        subNav={<SubNav tabs={settingsTabs} ariaLabel="Settings section navigation" />}
      >
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('profile.error')}</h2>
          <p>{loadError}</p>
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    return null;
  }

  const isLocalAuth = user.authProvider === 'local';

  return (
    <PageLayout
      maxWidth="narrow"
      title={t('profile.pageTitle')}
      subNav={<SubNav tabs={settingsTabs} ariaLabel="Settings section navigation" />}
    >

        {/* Profile Information Card */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('profile.profileInformation')}</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile.email')}</span>
              <span className={styles.infoValue}>{user.email}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile.role')}</span>
              <span className={styles.infoValue}>
                {user.role === 'admin' ? t('profile.roleAdmin') : t('profile.roleMember')}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile.authentication')}</span>
              <span className={styles.infoValue}>
                {user.authProvider === 'local' ? t('profile.authLocal') : t('profile.authOidc')}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('profile.memberSince')}</span>
              <span className={styles.infoValue}>{formatDate(user.createdAt)}</span>
            </div>
          </div>
        </section>

        {/* Display Name Edit Card */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('profile.displayName')}</h2>
          <p className={styles.cardDescription}>{t('profile.displayNameDescription')}</p>

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
                {t('profile.displayName')}
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
              {isUpdatingDisplayName ? t('profile.saving') : t('profile.saveChanges')}
            </button>
          </form>
        </section>

        {/* Password Change Card (local auth only) */}
        {isLocalAuth ? (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('profile.changePassword')}</h2>
            <p className={styles.cardDescription}>{t('profile.changePasswordDescription')}</p>

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
                  {t('profile.currentPassword')}
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
                  {t('profile.newPassword')}
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
                  {t('profile.confirmNewPassword')}
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
                {isChangingPassword ? t('profile.changingPassword') : t('profile.changePassword')}
              </button>
            </form>
          </section>
        ) : (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('profile.password')}</h2>
            <p className={styles.oidcMessage}>{t('profile.passwordManagedByProvider')}</p>
          </section>
        )}

        {/* Preferences Card */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('profile.preferences')}</h2>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="languageSelect">
              {t('profile.language')}
            </label>
            <select
              id="languageSelect"
              className={styles.input}
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocalePreference)}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="system">{t('profile.systemLanguage')}</option>
            </select>
          </div>
        </section>

      {/* DAV Access Card */}
      <DavAccessCard />
    </PageLayout>
  );
}

export default ProfilePage;
