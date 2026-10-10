import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createMilestone } from '../../lib/milestonesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { forwardOriginState, originHrefOr } from '../../navigation/origin.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import styles from './MilestoneCreatePage.module.css';
import { routeUrl } from '@cornerstone/shared';

export function MilestoneCreatePage() {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const location = useLocation();
  useDocumentTitle(tCommon('navigation.newMilestone'));

  const [formData, setFormData] = useState({
    title: '',
    targetDate: '',
    description: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError(t('milestones.create.form.title.error'));
      return;
    }

    if (!formData.targetDate.trim()) {
      setError(t('milestones.create.form.targetDate.error'));
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const milestone = await createMilestone({
        title: formData.title,
        targetDate: formData.targetDate,
        description: formData.description || undefined,
      });

      navigate(routeUrl('milestone', { id: milestone.id }), {
        replace: true,
        state: forwardOriginState(location.state),
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
      } else {
        setError(t('milestones.create.errors.createFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <PageBreadcrumbs />
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1 className={styles.pageTitle}>{tCommon('navigation.newMilestone')}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.formCard} noValidate>
        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        <div className={styles.formGroup}>
          <label htmlFor="title" className={styles.label}>
            {t('milestones.create.form.title.label')}{' '}
            <span className={styles.required}>{t('milestones.create.form.title.required')}</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            className={styles.input}
            placeholder={t('milestones.create.form.title.placeholder')}
            required
            data-testid="milestone-title-input"
            autoFocus
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="targetDate" className={styles.label}>
            {t('milestones.create.form.targetDate.label')}{' '}
            <span className={styles.required}>
              {t('milestones.create.form.targetDate.required')}
            </span>
          </label>
          <input
            type="date"
            id="targetDate"
            name="targetDate"
            value={formData.targetDate}
            onChange={handleInputChange}
            className={styles.input}
            required
            data-testid="milestone-target-date-input"
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="description" className={styles.label}>
            {t('milestones.create.form.description.label')}
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            className={styles.textarea}
            placeholder={t('milestones.create.form.description.placeholder')}
            rows={4}
            data-testid="milestone-description-input"
          />
        </div>

        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSubmitting}
            data-testid="create-milestone-button"
          >
            {isSubmitting ? t('milestones.create.submitting') : t('milestones.create.submit')}
          </button>
          <Link
            to={originHrefOr(location.state, routeUrl('milestones'))}
            replace
            className={styles.cancelLink}
          >
            {t('milestones.create.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}

export default MilestoneCreatePage;
