import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { updateProfile, changePassword } from '../../lib/usersApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useLocale, type LocalePreference } from '../../contexts/LocaleContext.js';
import { useTheme, type ThemePreference } from '../../contexts/ThemeContext.js';
import { useFormatters } from '../../lib/formatters.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { FormError } from '../../components/FormError/FormError.js';
import { DavAccessCard } from '../../components/DavAccessCard/DavAccessCard.js';
import styles from './ProfilePage.module.css';

interface PasswordFormErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/** Endonyms are deliberately not translated. */
const LOCALE_LABELS: Record<'en' | 'de', string> = { en: 'English', de: 'Deutsch' };
const LANGUAGE_OPTIONS = ['en', 'de', 'system'] as const satisfies readonly LocalePreference[];
const THEME_OPTIONS = ['light', 'dark', 'system'] as const satisfies readonly ThemePreference[];

export function ProfilePage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const pageTitle = tCommon('navigation.account');
  useDocumentTitle(pageTitle);
  const { formatDate } = useFormatters();
  const { user, oidcEnabled, isLoading, error: loadError, refreshAuth } = useAuth();
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();

  // Display name state
  const [displayName, setDisplayName] = useState('');
  const [displayNameError, setDisplayNameError] = useState<string>('');
  const [displayNameApiError, setDisplayNameApiError] = useState<string>('');
  const [isUpdatingDisplayName, setIsUpdatingDisplayName] = useState(false);
  const [displayNameSuccess, setDisplayNameSuccess] = useState<string>('');
  const displayNameInputRef = useRef<HTMLInputElement>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<PasswordFormErrors>({});
  const [passwordApiError, setPasswordApiError] = useState<string>('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string>('');
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  // Sync from auth only when the saved name changes, so an unsaved edit survives a user refresh.
  const savedDisplayName = user?.displayName;
  useEffect(() => {
    if (savedDisplayName !== undefined) {
      /* eslint-disable @eslint-react/set-state-in-effect -- syncing displayName from auth user state */
      setDisplayName(savedDisplayName);
      /* eslint-enable @eslint-react/set-state-in-effect */
    }
  }, [savedDisplayName]);

  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    setDisplayNameSuccess('');
    setDisplayNameApiError('');
    setDisplayNameError('');
  };

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
    if (isUpdatingDisplayName || !user || displayName.trim() === user.displayName) {
      return;
    }
    setDisplayNameSuccess('');
    setDisplayNameApiError('');
    setDisplayNameError('');

    if (!validateDisplayName()) {
      displayNameInputRef.current?.focus();
      return;
    }

    setIsUpdatingDisplayName(true);

    try {
      await updateProfile({ displayName: displayName.trim() });
      await refreshAuth();
      setDisplayNameSuccess(t('profile.displayNameUpdatedSuccess'));
    } catch (error) {
      if (error instanceof ApiClientError) {
        setDisplayNameApiError(translateApiError(error.error.code, tErrors));
      } else {
        setDisplayNameApiError(t('profile.displayNameUpdateFailed'));
      }
    } finally {
      setIsUpdatingDisplayName(false);
    }
  };

  const clearPasswordFeedback = () => {
    setPasswordApiError('');
    setPasswordSuccess('');
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

    if (newErrors.currentPassword) {
      currentPasswordRef.current?.focus();
    } else if (newErrors.newPassword) {
      newPasswordRef.current?.focus();
    } else if (newErrors.confirmPassword) {
      confirmPasswordRef.current?.focus();
    }

    return Object.keys(newErrors).length === 0;
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isChangingPassword) {
      return;
    }
    clearPasswordFeedback();

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
        setPasswordApiError(translateApiError(error.error.code, tErrors));
      } else {
        setPasswordApiError(t('profile.passwordChangeFailed'));
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <PageLayout maxWidth="narrow" title={pageTitle}>
        <div className={styles.sections}>
          <Skeleton lines={4} />
        </div>
      </PageLayout>
    );
  }

  if (loadError) {
    return (
      <PageLayout maxWidth="narrow" title={pageTitle}>
        <FormError message={loadError} />
      </PageLayout>
    );
  }

  if (!user) {
    return null;
  }

  const isLocalAuth = user.authProvider === 'local';
  const showSignInMethod = oidcEnabled || user.authProvider === 'oidc' || user.oidcLinked;
  let signInMethod = t('profile.signInLocal');
  if (user.authProvider === 'oidc') {
    signInMethod = t('profile.signInSso');
  } else if (user.oidcLinked) {
    signInMethod = t('profile.signInLocalAndSso');
  }

  const themeLabels: Record<ThemePreference, string> = {
    light: tCommon('theme.light'),
    dark: tCommon('theme.dark'),
    system: tCommon('theme.system'),
  };

  return (
    <PageLayout maxWidth="narrow" title={pageTitle}>
      <div className={styles.sections}>
        {/* Your details */}
        <section
          className={styles.card}
          aria-labelledby="account-profile-heading"
          data-testid="account-profile"
        >
          <h2 id="account-profile-heading" className={styles.cardTitle}>
            {t('profile.heading')}
          </h2>

          {displayNameSuccess && (
            <div className={styles.bannerSuccess} role="status" aria-atomic="true">
              {displayNameSuccess}
            </div>
          )}

          {displayNameApiError && (
            <div className={styles.bannerError} role="alert">
              {displayNameApiError}
            </div>
          )}

          <dl className={styles.facts}>
            <div className={styles.factRow}>
              <dt className={styles.factLabel}>{t('profile.email')}</dt>
              <dd className={styles.factValue}>{user.email}</dd>
            </div>
            <div className={styles.factRow}>
              <dt className={styles.factLabel}>{t('profile.role')}</dt>
              <dd className={styles.factValue}>
                {user.role === 'admin' ? t('profile.roleAdmin') : t('profile.roleMember')}
              </dd>
            </div>
            {showSignInMethod && (
              <div className={styles.factRow}>
                <dt className={styles.factLabel}>{t('profile.signInMethod')}</dt>
                <dd className={styles.factValue}>{signInMethod}</dd>
              </div>
            )}
            <div className={styles.factRow}>
              <dt className={styles.factLabel}>{t('profile.memberSince')}</dt>
              <dd className={styles.factValue}>{formatDate(user.createdAt)}</dd>
            </div>
          </dl>

          <form onSubmit={handleDisplayNameSubmit} className={styles.nameForm} noValidate>
            <div className={styles.field}>
              <label htmlFor="displayName" className={styles.label}>
                {t('profile.displayName')}
              </label>
              <input
                ref={displayNameInputRef}
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                className={styles.input}
                maxLength={100}
                readOnly={isUpdatingDisplayName}
                autoComplete="name"
                aria-invalid={!!displayNameError}
                aria-describedby={displayNameError ? 'displayName-error' : undefined}
              />
              {displayNameError && (
                <span id="displayName-error" className={styles.fieldError} role="alert">
                  {displayNameError}
                </span>
              )}
            </div>

            <button
              type="submit"
              className={styles.primaryButton}
              data-testid="account-display-name-save"
              aria-disabled={
                isUpdatingDisplayName || displayName.trim() === user.displayName
                  ? 'true'
                  : undefined
              }
            >
              {isUpdatingDisplayName ? t('profile.saving') : tCommon('button.save')}
            </button>
          </form>
        </section>

        {/* Calendar & contacts sync */}
        <DavAccessCard />

        {/* Preferences */}
        <section
          className={styles.card}
          aria-labelledby="account-preferences-heading"
          data-testid="account-preferences"
        >
          <h2 id="account-preferences-heading" className={styles.cardTitle}>
            {t('profile.preferences')}
          </h2>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="languageSelect">
                {t('profile.language')}
              </label>
              <select
                id="languageSelect"
                className={styles.select}
                data-testid="account-language"
                value={locale}
                onChange={(e) => {
                  const next = LANGUAGE_OPTIONS.find((option) => option === e.target.value);
                  if (next) setLocale(next);
                }}
              >
                <option value="en" lang="en">
                  {LOCALE_LABELS.en}
                </option>
                <option value="de" lang="de">
                  {LOCALE_LABELS.de}
                </option>
                <option value="system">{t('profile.systemLanguage')}</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="themeSelect">
                {t('profile.theme')}
              </label>
              <select
                id="themeSelect"
                className={styles.select}
                data-testid="account-theme"
                value={theme}
                onChange={(e) => {
                  const next = THEME_OPTIONS.find((option) => option === e.target.value);
                  if (next) setTheme(next);
                }}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {themeLabels[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Password */}
        <section
          className={styles.card}
          aria-labelledby="account-password-heading"
          data-testid="account-password"
        >
          <h2 id="account-password-heading" className={styles.cardTitle}>
            {t('profile.password')}
          </h2>

          {isLocalAuth ? (
            <>
              <p className={styles.description}>{t('profile.passwordHint')}</p>

              {passwordSuccess && (
                <div className={styles.bannerSuccess} role="status" aria-atomic="true">
                  {passwordSuccess}
                </div>
              )}

              {passwordApiError && (
                <div className={styles.bannerError} role="alert">
                  {passwordApiError}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className={styles.form} noValidate>
                <div className={styles.field}>
                  <label htmlFor="currentPassword" className={styles.label}>
                    {t('profile.currentPassword')}
                  </label>
                  <input
                    ref={currentPasswordRef}
                    type="password"
                    id="currentPassword"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      clearPasswordFeedback();
                    }}
                    className={styles.input}
                    aria-invalid={!!passwordErrors.currentPassword}
                    aria-describedby={
                      passwordErrors.currentPassword ? 'currentPassword-error' : undefined
                    }
                    readOnly={isChangingPassword}
                    autoComplete="current-password"
                    maxLength={256}
                  />
                  {passwordErrors.currentPassword && (
                    <span id="currentPassword-error" className={styles.fieldError} role="alert">
                      {passwordErrors.currentPassword}
                    </span>
                  )}
                </div>

                <div className={styles.field}>
                  <label htmlFor="newPassword" className={styles.label}>
                    {t('profile.newPassword')}
                  </label>
                  <input
                    ref={newPasswordRef}
                    type="password"
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      clearPasswordFeedback();
                    }}
                    className={styles.input}
                    aria-invalid={!!passwordErrors.newPassword}
                    aria-describedby={passwordErrors.newPassword ? 'newPassword-error' : undefined}
                    readOnly={isChangingPassword}
                    autoComplete="new-password"
                    maxLength={256}
                  />
                  {passwordErrors.newPassword && (
                    <span id="newPassword-error" className={styles.fieldError} role="alert">
                      {passwordErrors.newPassword}
                    </span>
                  )}
                </div>

                <div className={styles.field}>
                  <label htmlFor="confirmPassword" className={styles.label}>
                    {t('profile.confirmNewPassword')}
                  </label>
                  <input
                    ref={confirmPasswordRef}
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearPasswordFeedback();
                    }}
                    className={styles.input}
                    aria-invalid={!!passwordErrors.confirmPassword}
                    aria-describedby={
                      passwordErrors.confirmPassword ? 'confirmPassword-error' : undefined
                    }
                    readOnly={isChangingPassword}
                    autoComplete="new-password"
                    maxLength={256}
                  />
                  {passwordErrors.confirmPassword && (
                    <span id="confirmPassword-error" className={styles.fieldError} role="alert">
                      {passwordErrors.confirmPassword}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className={styles.secondaryButton}
                  data-testid="account-password-submit"
                  aria-disabled={isChangingPassword ? 'true' : undefined}
                >
                  {isChangingPassword ? t('profile.changingPassword') : t('profile.changePassword')}
                </button>
              </form>
            </>
          ) : (
            <p className={styles.note}>{t('profile.passwordManagedByProvider')}</p>
          )}
        </section>
      </div>
    </PageLayout>
  );
}

export default ProfilePage;
