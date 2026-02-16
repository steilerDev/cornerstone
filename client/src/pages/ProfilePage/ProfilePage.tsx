import { useState, useEffect, type FormEvent } from 'react';
import { updateProfile, changePassword } from '../../lib/usersApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import styles from './ProfilePage.module.css';

interface PasswordFormErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function ProfilePage() {
  const { user, isLoading, error: loadError, refreshAuth } = useAuth();

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
      setDisplayNameError('Display name is required');
      return false;
    }
    if (displayName.length > 100) {
      setDisplayNameError('Display name must be 100 characters or less');
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
      setDisplayNameSuccess('Display name updated successfully');
    } catch (error) {
      if (error instanceof ApiClientError) {
        setDisplayNameError(error.error.message);
      } else {
        setDisplayNameError('Failed to update display name. Please try again.');
      }
    } finally {
      setIsUpdatingDisplayName(false);
    }
  };

  const validatePasswordForm = (): boolean => {
    const newErrors: PasswordFormErrors = {};

    if (!currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (newPassword.length < 12) {
      newErrors.newPassword = 'New password must be at least 12 characters';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
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
      setPasswordSuccess('Password changed successfully');
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      if (error instanceof ApiClientError) {
        setPasswordApiError(error.error.message);
      } else {
        setPasswordApiError('Failed to change password. Please try again.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading profile...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
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
        <h1 className={styles.pageTitle}>Profile</h1>

        {/* Profile Information Card */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Profile Information</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Email</span>
              <span className={styles.infoValue}>{user.email}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Role</span>
              <span className={styles.infoValue}>
                {user.role === 'admin' ? 'Administrator' : 'Member'}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Authentication</span>
              <span className={styles.infoValue}>
                {user.authProvider === 'local' ? 'Local Account' : 'Single Sign-On (OIDC)'}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Member Since</span>
              <span className={styles.infoValue}>
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </section>

        {/* Display Name Edit Card */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Display Name</h2>
          <p className={styles.cardDescription}>
            This is the name that will be displayed throughout the application.
          </p>

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
                Display Name
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
              {isUpdatingDisplayName ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </section>

        {/* Password Change Card (local auth only) */}
        {isLocalAuth ? (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Change Password</h2>
            <p className={styles.cardDescription}>
              Update your password to keep your account secure. Password must be at least 12
              characters.
            </p>

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
                  Current Password
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
                  New Password
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
                  Confirm New Password
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
                {isChangingPassword ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </section>
        ) : (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Password</h2>
            <p className={styles.oidcMessage}>
              Your credentials are managed by your identity provider.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;
