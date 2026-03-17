import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from '../../components/Logo/Logo.js';
import { setup, getAuthMe } from '../../lib/authApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import sharedStyles from '../shared/AuthPage.module.css';
import styles from './SetupPage.module.css';

interface FormErrors {
  email?: string;
  displayName?: string;
  password?: string;
  confirmPassword?: string;
}

export function SetupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);

  useEffect(() => {
    const checkSetupRequired = async () => {
      try {
        const response = await getAuthMe();
        if (!response.setupRequired) {
          // Setup already complete, redirect to login
          navigate('/login', { replace: true });
        }
      } catch {
        // If API call fails, allow setup form to render
      } finally {
        setIsCheckingSetup(false);
      }
    };

    void checkSetupRequired();
  }, [navigate]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email) {
      newErrors.email = t('setup.emailRequired');
    }

    if (!displayName) {
      newErrors.displayName = t('setup.displayNameRequired');
    } else if (displayName.length < 1 || displayName.length > 100) {
      newErrors.displayName = t('setup.displayNameLength');
    }

    if (!password) {
      newErrors.password = t('setup.passwordRequired');
    } else if (password.length < 12) {
      newErrors.password = t('setup.passwordMinLength');
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = t('setup.passwordMismatch');
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
      // Setup complete, redirect to login
      navigate('/login', { replace: true });
    } catch (error) {
      if (error instanceof ApiClientError) {
        setApiError(error.error.message);
      } else {
        setApiError(t('setup.unexpectedError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingSetup) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.card}>
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
        <p className={sharedStyles.description}>
          {t('setup.description')}
        </p>

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
            {isSubmitting ? t('setup.submitPending') : t('setup.submitIdle')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SetupPage;
