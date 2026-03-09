import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createMilestone } from '../../lib/milestonesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import styles from './MilestoneCreatePage.module.css';

export function MilestoneCreatePage() {
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
      setError('Title is required.');
      return;
    }

    if (!formData.targetDate.trim()) {
      setError('Target date is required.');
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
            ← Milestones
          </Link>
          <h1 className={styles.pageTitle}>Project</h1>
        </div>
      </div>
      <ProjectSubNav />

      <form onSubmit={handleSubmit} className={styles.formCard}>
        <h2 className={styles.formTitle}>Create Milestone</h2>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        <div className={styles.formGroup}>
          <label htmlFor="title" className={styles.label}>
            Title <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="Enter milestone title"
            required
            data-testid="milestone-title-input"
            autoFocus
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="targetDate" className={styles.label}>
            Target Date <span className={styles.required}>*</span>
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
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            className={styles.textarea}
            placeholder="Optional description for this milestone"
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
            {isSubmitting ? 'Creating...' : 'Create Milestone'}
          </button>
          <Link to="/project/milestones" className={styles.cancelLink}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default MilestoneCreatePage;
