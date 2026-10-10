import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { OidcLoginErrorCode } from '@cornerstone/shared';
import { OIDC_LOGIN_ERROR_CODES, routeUrl } from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { Logo } from '../../components/Logo/Logo.js';
import { login, getAuthMe, oidcLoginUrl } from '../../lib/authApi.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { readNextParam } from '../../navigation/nextParam.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import sharedStyles from '../shared/AuthPage.module.css';
import styles from './LoginPage.module.css';

/** Known OIDC error code from the `?error=` query param, or null (unknown codes are ignored). */
function readOidcErrorCode(search: string): OidcLoginErrorCode | null {
  const code = new URLSearchParams(search).get('error');
  return code !== null && (OIDC_LOGIN_ERROR_CODES as readonly string[]).includes(code)
    ? (code as OidcLoginErrorCode)
    : null;
}

/**
 * Ref callback: focuses the banner when it attaches. The URL-derived OIDC error is already in the
 * DOM on first render, and VoiceOver/Safari often don't announce a role="alert" present at load.
 */
function focusOnAttach(el: HTMLDivElement | null) {
  el?.focus();
}

interface FormErrors {
  email?: string;
  password?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshAuth } = useAuth();
  const { t } = useTranslation('auth');
  const { t: tErrors } = useTranslation('errors');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string>('');
  const [oidcErrorCode, setOidcErrorCode] = useState<OidcLoginErrorCode | null>(() =>
    readOidcErrorCode(window.location.search),
  );
  const bannerError =
    apiError || (oidcErrorCode ? t(I18N_UNION_KEYS.oidcLoginError.key(oidcErrorCode)) : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  useDocumentTitle(t('login.title'), { section: false, house: false });

  // Where to land after signing in: the deep link the user asked for, else Home
  const next = useMemo(() => readNextParam(location.search), [location.search]);
  const target = next ?? routeUrl('home');

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const authMeResponse = await getAuthMe();
        // If user is already authenticated, redirect to home
        if (authMeResponse.user) {
          navigate(target, { replace: true });
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

    void loadConfig();
  }, [navigate, target]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email) {
      newErrors.email = t('login.validation.emailRequired');
    }

    if (!password) {
      newErrors.password = t('login.validation.passwordRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setApiError('');
    setOidcErrorCode(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login({ email, password });
      // Refresh the auth state first so guards and the house name see the new session
      await refreshAuth();
      navigate(target, { replace: true });
    } catch (error) {
      if (error instanceof ApiClientError) {
        setApiError(translateApiError(error.error.code, tErrors));
      } else {
        setApiError(t('login.error'));
      }
      setIsSubmitting(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = oidcLoginUrl(next);
  };

  return (
    <div className={sharedStyles.container}>
      <div className={sharedStyles.card}>
        <Logo size={72} variant="full" className={sharedStyles.logo} />
        <h1 className={sharedStyles.title}>{t('login.title')}</h1>
        <p className={sharedStyles.description}>{t('login.description')}</p>

        {bannerError && (
          <div
            className={sharedStyles.errorBanner}
            role="alert"
            tabIndex={-1}
            ref={oidcErrorCode && !apiError ? focusOnAttach : undefined}
          >
            {bannerError}
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
              <span className={styles.dividerText}>{t('login.divider')}</span>
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
            {isSubmitting ? t('login.submitting') : t('login.submitButton')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
