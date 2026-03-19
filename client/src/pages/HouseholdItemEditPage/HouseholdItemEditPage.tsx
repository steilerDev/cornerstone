import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  HouseholdItemCategory,
  HouseholdItemCategoryEntity,
} from '@cornerstone/shared';
import { getHouseholdItem, updateHouseholdItem } from '../../lib/householdItemsApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import styles from './HouseholdItemEditPage.module.css';

interface Vendor {
  id: string;
  name: string;
}

export function HouseholdItemEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const { t } = useTranslation('householdItems');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<HouseholdItemCategory>('' as HouseholdItemCategory);
  const [quantity, setQuantity] = useState(1);
  const [vendorId, setVendorId] = useState('');
  const [url, setUrl] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<HouseholdItemCategoryEntity[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [notFound, setNotFound] = useState(false);

  // Load item data, vendors, and categories on mount
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      try {
        const [vendorsResponse, categoriesResponse, item] = await Promise.all([
          fetchVendors({ pageSize: 100 }),
          fetchHouseholdItemCategories(),
          getHouseholdItem(id!),
        ]);

        setVendors(vendorsResponse.vendors);
        setCategories(categoriesResponse.categories);

        // Populate form with item data
        setName(item.name);
        setDescription(item.description || '');
        setCategory(item.category);
        setQuantity(item.quantity);
        setVendorId(item.vendor?.id ?? '');
        setUrl(item.url || '');
      } catch (err) {
        console.error('Failed to load data:', err);
        if (
          err instanceof Error &&
          (err.message.includes('404') ||
            err.message.includes('not found') ||
            err.message.includes('Not found'))
        ) {
          setNotFound(true);
        } else {
          setError('Failed to load form data. Please try again.');
        }
      } finally {
        setIsLoadingData(false);
      }
    }

    if (id) {
      loadData();
    }
  }, [id]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = t('edit.form.name.error');
    }

    if (!category) {
      errors.category = t('edit.form.category.error');
    }

    if (quantity < 1) {
      errors.quantity = t('edit.form.quantity.error');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await updateHouseholdItem(id!, {
        name: name.trim(),
        description: description.trim() || null,
        category,
        quantity,
        vendorId: vendorId || null,
        url: url.trim() || null,
      });

      showToast('success', t('edit.success'));
      navigate(`/project/household-items/${id}`);
    } catch (err) {
      setError(t('edit.errorBanner'));
      console.error('Failed to update household item:', err);
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('edit.loading')}</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/project/household-items')}
          >
            {t('edit.backButton')}
          </button>
          <h1 className={styles.title}>{t('edit.notFound')}</h1>
        </div>
        <div className={styles.errorBanner}>{t('edit.notFoundMessage')}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(`/project/household-items/${id}`)}
          disabled={isSubmitting}
        >
          {t('edit.backButton')}
        </button>
        <h1 className={styles.title}>{t('edit.title')}</h1>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="name" className={styles.label}>
            {t('edit.form.name.label')}{' '}
            <span className={styles.required}>{t('edit.form.name.required')}</span>
          </label>
          <input
            type="text"
            id="name"
            className={`${styles.input} ${validationErrors.name ? styles.inputError : ''}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('edit.form.name.placeholder')}
            aria-required="true"
            aria-invalid={!!validationErrors.name}
            aria-describedby={validationErrors.name ? 'hi-edit-name-error' : undefined}
          />
          {validationErrors.name && (
            <div id="hi-edit-name-error" className={styles.errorText} role="alert">
              {validationErrors.name}
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="description" className={styles.label}>
            {t('edit.form.description.label')}
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder={t('edit.form.description.placeholder')}
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="category" className={styles.label}>
              {t('edit.form.category.label')}{' '}
              <span className={styles.required}>{t('edit.form.category.required')}</span>
            </label>
            <select
              id="category"
              className={`${styles.select} ${validationErrors.category ? styles.selectError : ''}`}
              value={category}
              onChange={(e) => setCategory(e.target.value as HouseholdItemCategory)}
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={!!validationErrors.category}
              aria-describedby={validationErrors.category ? 'hi-edit-category-error' : undefined}
            >
              <option value="">{t('edit.form.category.placeholder')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {validationErrors.category && (
              <div id="hi-edit-category-error" className={styles.errorText} role="alert">
                {validationErrors.category}
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="quantity" className={styles.label}>
              {t('edit.form.quantity.label')}
            </label>
            <input
              type="number"
              id="quantity"
              className={`${styles.input} ${validationErrors.quantity ? styles.inputError : ''}`}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              min={1}
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={!!validationErrors.quantity}
              aria-describedby={validationErrors.quantity ? 'hi-edit-quantity-error' : undefined}
            />
            {validationErrors.quantity && (
              <div id="hi-edit-quantity-error" className={styles.errorText} role="alert">
                {validationErrors.quantity}
              </div>
            )}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="vendorId" className={styles.label}>
            {t('edit.form.vendor.label')}
          </label>
          <select
            id="vendorId"
            className={styles.select}
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">{t('edit.form.vendor.placeholder')}</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="url" className={styles.label}>
            {t('edit.form.url.label')}
          </label>
          <input
            type="url"
            id="url"
            className={styles.input}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('edit.form.url.placeholder')}
          />
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => navigate(`/project/household-items/${id}`)}
            disabled={isSubmitting}
          >
            {t('edit.cancel')}
          </button>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? t('edit.submitting') : t('edit.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default HouseholdItemEditPage;
