import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ENTRIES_LANGUAGES, routeUrl } from '@cornerstone/shared';
import type { EntriesLanguage, HouseholdSettings } from '@cornerstone/shared';
import { FormError } from '../../components/FormError/FormError.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useHouseName } from '../../contexts/HouseNameContext.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { fetchHouseholdSettings, updateHouseholdSettings } from '../../lib/settingsApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import styles from './HouseSection.module.css';

/** Endonyms are deliberately not translated (as in ProfilePage). */
const ENTRIES_LANGUAGE_LABELS: Record<EntriesLanguage, string> = { de: 'Deutsch', en: 'English' };

interface HouseSectionProps {
  /** Called once the first load has ended (success or failure). */
  readonly onSettled?: () => void;
}

/** Project setup › House: name, address and the language of the household's own entries. */
export function HouseSection({ onSettled }: HouseSectionProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { setHouseName, setEntriesLanguage } = useHouseName();
  const nameId = useId();
  const nameHintId = useId();
  const addressId = useId();
  const addressHintId = useId();
  const languageId = useId();
  const languageHintId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [loaded, setLoaded] = useState<HouseholdSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [language, setLanguage] = useState<EntriesLanguage>('en');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const settledRef = useRef(false);

  // Loads once on mount and on Retry. `t` is deliberately not a dependency: a language switch
  // must not reload the form.
  useEffect(() => {
    let cancelled = false;
    fetchHouseholdSettings()
      .then((settings) => {
        if (cancelled) return;
        setLoaded(settings);
        setName(settings.householdName ?? '');
        setAddress(settings.householdAddress ?? '');
        setLanguage(settings.entriesLanguage);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (loading || settledRef.current) return;
    settledRef.current = true;
    onSettled?.();
  }, [loading, onSettled]);

  const dirty =
    loaded !== null &&
    (name !== (loaded.householdName ?? '') ||
      address !== (loaded.householdAddress ?? '') ||
      language !== loaded.entriesLanguage);

  const handleRetry = () => {
    headingRef.current?.focus();
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !dirty || !loaded) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      // Only a changed language is sent: loading never saves the derived default.
      const updated = await updateHouseholdSettings({
        householdName: name.trim() || null,
        householdAddress: address.trim() || null,
        ...(language !== loaded.entriesLanguage ? { entriesLanguage: language } : {}),
      });
      setLoaded(updated);
      setName(updated.householdName ?? '');
      setAddress(updated.householdAddress ?? '');
      setLanguage(updated.entriesLanguage);
      setHouseName(updated.householdName);
      setEntriesLanguage(updated.entriesLanguage);
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('projectSetup.house.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  const renderBody = () => {
    if (loading) return <Skeleton lines={4} />;
    if (loadFailed || !loaded) {
      return (
        <div className={styles.loadError}>
          <FormError message={t('projectSetup.house.loadFailed')} />
          <button
            type="button"
            className={styles.retry}
            onClick={handleRetry}
            data-testid="project-setup-house-retry"
          >
            {tCommon('button.retry')}
          </button>
        </div>
      );
    }
    return (
      <form className={styles.form} noValidate onSubmit={(event) => void handleSave(event)}>
        {saved && (
          <div className={styles.success} role="status">
            {t('projectSetup.house.saved')}
          </div>
        )}
        {saveError && (
          <div className={styles.error} role="alert">
            {saveError}
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor={nameId} className={styles.label}>
            {t('projectSetup.house.nameLabel')}
          </label>
          <input
            id={nameId}
            type="text"
            className={styles.input}
            value={name}
            maxLength={200}
            autoComplete="off"
            aria-describedby={nameHintId}
            onChange={(event) => setName(event.target.value)}
            data-testid="project-setup-house-name"
          />
          <p id={nameHintId} className={styles.hint}>
            {t('projectSetup.house.nameHint')}
          </p>
        </div>

        <div className={styles.field}>
          <label htmlFor={addressId} className={styles.label}>
            {t('projectSetup.house.addressLabel')}
          </label>
          <textarea
            id={addressId}
            className={styles.textarea}
            rows={3}
            value={address}
            maxLength={500}
            aria-describedby={addressHintId}
            onChange={(event) => setAddress(event.target.value)}
            data-testid="project-setup-house-address"
          />
          <p id={addressHintId} className={styles.hint}>
            {t('projectSetup.house.addressHint')}
          </p>
        </div>

        <div className={styles.field}>
          <label htmlFor={languageId} className={styles.label}>
            {t('projectSetup.house.entriesLanguageLabel')}
          </label>
          <select
            id={languageId}
            className={styles.select}
            value={language}
            aria-describedby={languageHintId}
            onChange={(event) =>
              setLanguage(
                ENTRIES_LANGUAGES.find((value) => value === event.target.value) ?? language,
              )
            }
            data-testid="project-setup-language"
          >
            {ENTRIES_LANGUAGES.map((value) => (
              <option key={value} value={value} lang={value}>
                {ENTRIES_LANGUAGE_LABELS[value]}
              </option>
            ))}
          </select>
          <p id={languageHintId} className={styles.hint}>
            {t('projectSetup.house.entriesLanguageHint')}
          </p>
          <NavAnchor
            to={routeUrl('settingsProfile')}
            className={styles.link}
            data-testid="project-setup-app-language-link"
          >
            {t('projectSetup.house.appLanguageLink')}
          </NavAnchor>
        </div>

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.save}
            aria-disabled={saving || !dirty ? 'true' : undefined}
            data-testid="project-setup-house-save"
          >
            {saving ? tCommon('objectForm.saving') : tCommon('button.save')}
          </button>
        </div>
      </form>
    );
  };

  return (
    <section
      id="house"
      aria-labelledby="house-heading"
      className={styles.card}
      data-testid="project-setup-house"
    >
      <h2 id="house-heading" ref={headingRef} tabIndex={-1} className={styles.title}>
        {t('projectSetup.house.title')}
      </h2>
      {renderBody()}
    </section>
  );
}

export default HouseSection;
