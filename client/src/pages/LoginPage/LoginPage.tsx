import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from '../../components/Logo/Logo.js';
import { login, getAuthMe } from '../../lib/authApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import sharedStyles from '../shared/AuthPage.module.css';
import styles from './LoginPage.module.css';

interface FormErrors {
  email?: string;
  password?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const authMeResponse = await getAuthMe();
        // If user is already authenticated, redirect to home
        if (authMeResponse.user) {
          navigate('/', { replace: true });
          return;
        }
        setOidcEnabled(authMeResponse.oidcEnabled);
      } catch {
        // If getAuthMe fails, OIDC is not enabled
        setOidcEnabled(false);
      } finally {
        setIsLoadingConfig(false);
      }
    };

    // Check for OIDC error in URL
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    if (errorCode) {
      const oidcErrorKey = `login.oidcError.${errorCode}`;
      const errorMessage = t(oidcErrorKey);
      // Only set error if the key exists (t() returns the key itself if not found)
      if (errorMessage !== oidcErrorKey) {
        setApiError(errorMessage);
      }
    }

    void loadConfig();
  }, [navigate]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email) {
      newErrors.email = t('login.emailRequired');
    }

    if (!password) {
      newErrors.password = t('login.passwordRequired');
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
      await login({ email, password });
      // Successful login - redirect to app
      navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof ApiClientError) {
        setApiError(error.error.message);
      } else {
        setApiError(t('login.unexpectedError'));
      }
      setIsSubmitting(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = '/api/auth/oidc/login';
  };

  return (
    <div className={sharedStyles.container}>
      <div className={sharedStyles.card}>
        <Logo size={72} variant="full" className={sharedStyles.logo} />
        <h1 className={sharedStyles.title}>{t('login.title')}</h1>
        <p className={sharedStyles.description}>{t('login.description')}</p>

        {apiError && (
          <div className={sharedStyles.errorBanner} role="alert">
            {apiError}
          </div>
        )}

        {!isLoadingConfig && oidcEnabled && (
          <>
            <button
              type="button"
              onClick={handleOidcLogin}
              className={styles.ssoButton}
              disabled={isSubmitting}
            >
              {t('login.ssoButton')}
            </button>

            <div className={styles.divider}>
              <span className={styles.dividerText}>{t('login.dividerOr')}</span>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className={sharedStyles.form} noValidate>
          <div className={sharedStyles.field}>
            <label htmlFor="email" className={sharedStyles.label}>
              {t('login.emailLabel')}
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
            <label htmlFor="password" className={sharedStyles.label}>
              {t('login.passwordLabel')}
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
              autoComplete="current-password"
              maxLength={256}
            />
            {errors.password && (
              <span id="password-error" className={sharedStyles.error} role="alert">
                {errors.password}
              </span>
            )}
          </div>

          <button type="submit" className={sharedStyles.button} disabled={isSubmitting}>
            {isSubmitting ? t('login.submitPending') : t('login.submitIdle')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
