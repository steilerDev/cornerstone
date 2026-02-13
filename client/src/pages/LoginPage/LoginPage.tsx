import { useState, useEffect, type FormEvent } from 'react';
import { login, getAuthMe } from '../../lib/authApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import sharedStyles from '../shared/AuthPage.module.css';
import styles from './LoginPage.module.css';

interface FormErrors {
  email?: string;
  password?: string;
}

const OIDC_ERROR_MESSAGES: Record<string, string> = {
  oidc_not_configured: 'Single sign-on is not configured.',
  oidc_error: 'Authentication failed. Please try again.',
  invalid_state: 'Authentication session expired. Please try again.',
  missing_email: 'Your identity provider did not provide an email address.',
  email_conflict: 'This email is already associated with a different account.',
  account_deactivated: 'Your account has been deactivated. Please contact an administrator.',
};

export function LoginPage() {
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
    if (errorCode && OIDC_ERROR_MESSAGES[errorCode]) {
      setApiError(OIDC_ERROR_MESSAGES[errorCode]);
    }

    void loadConfig();
  }, []);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email) {
      newErrors.email = 'Email is required';
    }

    if (!password) {
      newErrors.password = 'Password is required';
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
      window.location.href = '/';
    } catch (error) {
      if (error instanceof ApiClientError) {
        setApiError(error.error.message);
      } else {
        setApiError('An unexpected error occurred. Please try again.');
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
        <h1 className={sharedStyles.title}>Sign In</h1>
        <p className={sharedStyles.description}>Sign in to your Cornerstone account.</p>

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
              Login with SSO
            </button>

            <div className={styles.divider}>
              <span className={styles.dividerText}>or</span>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className={sharedStyles.form} noValidate>
          <div className={sharedStyles.field}>
            <label htmlFor="email" className={sharedStyles.label}>
              Email
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
              Password
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
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
