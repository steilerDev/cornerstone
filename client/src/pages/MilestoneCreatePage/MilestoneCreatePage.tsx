import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createMilestone } from '../../lib/milestonesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import styles from './MilestoneCreatePage.module.css';

export function MilestoneCreatePage() {
  const { t } = useTranslation('schedule');
  const navigate = useNavigate();

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

      navigate(`/project/milestones/${milestone.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to create milestone. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Link to="/project/milestones" className={styles.backLink}>
            {t('milestones.create.backLink')}
          </Link>
          <h1 className={styles.pageTitle}>{t('milestones.page.title')}</h1>
        </div>
      </div>
      <ProjectSubNav />

      <form onSubmit={handleSubmit} className={styles.formCard}>
        <h2 className={styles.formTitle}>{t('milestones.create.title')}</h2>

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
          <Link to="/project/milestones" className={styles.cancelLink}>
            {t('milestones.create.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}

export default MilestoneCreatePage;
