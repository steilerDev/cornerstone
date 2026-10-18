import { useState, useEffect, useLayoutEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { AuthCheckFailed } from '../../components/AuthGuard/AuthCheckFailed.js';
import { Logo } from '../../components/Logo/Logo.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { setup } from '../../lib/authApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import sharedStyles from '../shared/AuthPage.module.css';
import styles from './SetupPage.module.css';
import { routeUrl } from '@cornerstone/shared';

interface FormErrors {
  email?: string;
  displayName?: string;
  password?: string;
  confirmPassword?: string;
}

export function SetupPage() {
  const navigate = useNavigate();
  const { refreshAuth, status } = useAuth();
  const { t: tCommon } = useTranslation('common');
  const { t } = useTranslation('auth');
  const { t: tErrors } = useTranslation('errors');
  useDocumentTitle(status === 'error' ? tCommon('authGuard.errorHeading') : t('setup.title'), {
    section: false,
    house: false,
  });
  const emailRef = useRef<HTMLInputElement>(null);
  const previousStatusRef = useRef(status);

  // When a retry succeeds the error panel (with the focused button) is replaced by the form.
  useLayoutEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (previous === 'error' && status === 'setupRequired') emailRef.current?.focus();
  }, [status]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The session check belongs to AuthContext: react to its outcome.
  useEffect(() => {
    if (status === 'authenticated' || status === 'signedOut') {
      // Setup already complete, redirect to login
      navigate(routeUrl('login'), { replace: true });
    }
  }, [status, navigate]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email) {
      newErrors.email = t('setup.validation.emailRequired');
    }

    if (!displayName) {
      newErrors.displayName = t('setup.validation.displayNameRequired');
    } else if (displayName.length < 1 || displayName.length > 100) {
      newErrors.displayName = t('setup.validation.displayNameLength');
    }

    if (!password) {
      newErrors.password = t('setup.validation.passwordRequired');
    } else if (password.length < 12) {
      newErrors.password = t('setup.validation.passwordTooShort');
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = t('setup.validation.passwordsDoNotMatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setApiError('');

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await setup({ email, displayName, password });
      // Refresh the auth context first: it still says setupRequired until re-checked
      await refreshAuth();
      // Setup complete, redirect to login
      navigate(routeUrl('login'), { replace: true });
    } catch (error) {
      if (error instanceof ApiClientError) {
        setApiError(translateApiError(error.error.code, tErrors));
      } else {
        setApiError(t('setup.error'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'error') {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.card}>
          <AuthCheckFailed embedded />
        </div>
      </div>
    );
  }

  if (status !== 'setupRequired') {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.card}>
          <h1 className={sharedStyles.title}>{t('setup.title')}</h1>
          <p>{t('setup.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={sharedStyles.container}>
      <div className={sharedStyles.card}>
        <Logo size={72} variant="full" className={sharedStyles.logo} />
        <h1 className={sharedStyles.title}>{t('setup.title')}</h1>
        <p className={sharedStyles.description}>{t('setup.description')}</p>

        {apiError && (
          <div className={sharedStyles.errorBanner} role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className={sharedStyles.form} noValidate>
          <div className={sharedStyles.field}>
            <label htmlFor="email" className={sharedStyles.label}>
              {t('setup.emailLabel')}
            </label>
            <input
              ref={emailRef}
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={sharedStyles.input}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              disabled={isSubmitting}
              autoComplete="email"
              maxLength={256}
            />
            {errors.email && (
              <span id="email-error" className={sharedStyles.error} role="alert">
                {errors.email}
              </span>
            )}
          </div>

          <div className={sharedStyles.field}>
            <label htmlFor="displayName" className={sharedStyles.label}>
              {t('setup.displayNameLabel')}
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={sharedStyles.input}
              aria-invalid={!!errors.displayName}
              aria-describedby={errors.displayName ? 'displayName-error' : undefined}
              disabled={isSubmitting}
              autoComplete="name"
            />
            {errors.displayName && (
              <span id="displayName-error" className={sharedStyles.error} role="alert">
                {errors.displayName}
              </span>
            )}
          </div>

          <div className={sharedStyles.field}>
            <label htmlFor="password" className={sharedStyles.label}>
              {t('setup.passwordLabel')}
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={sharedStyles.input}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              disabled={isSubmitting}
              autoComplete="new-password"
              maxLength={256}
            />
            {errors.password && (
              <span id="password-error" className={sharedStyles.error} role="alert">
                {errors.password}
              </span>
            )}
            <span className={styles.hint}>{t('setup.passwordHint')}</span>
          </div>

          <div className={sharedStyles.field}>
            <label htmlFor="confirmPassword" className={sharedStyles.label}>
              {t('setup.confirmPasswordLabel')}
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={sharedStyles.input}
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
              disabled={isSubmitting}
              autoComplete="new-password"
              maxLength={256}
            />
            {errors.confirmPassword && (
              <span id="confirmPassword-error" className={sharedStyles.error} role="alert">
                {errors.confirmPassword}
              </span>
            )}
          </div>

          <button type="submit" className={sharedStyles.button} disabled={isSubmitting}>
            {isSubmitting ? t('setup.submitting') : t('setup.submitButton')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SetupPage;
