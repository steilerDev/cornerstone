import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  HouseholdItemCategory,
  HouseholdItemStatus,
  HouseholdItemCategoryEntity,
} from '@cornerstone/shared';
import { createHouseholdItem } from '../../lib/householdItemsApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import styles from './HouseholdItemCreatePage.module.css';

interface Vendor {
  id: string;
  name: string;
}

export function HouseholdItemCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useTranslation('householdItems');

  const STATUSES: Array<{ value: HouseholdItemStatus; label: string }> = [
    { value: 'planned', label: t('status.planned') },
    { value: 'purchased', label: t('status.purchased') },
    { value: 'scheduled', label: t('status.scheduled') },
    { value: 'arrived', label: t('status.arrived') },
  ];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<HouseholdItemCategory>('' as HouseholdItemCategory);
  const [status, setStatus] = useState<HouseholdItemStatus>('planned');
  const [quantity, setQuantity] = useState(1);
  const [vendorId, setVendorId] = useState('');
  const [url, setUrl] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [earliestDeliveryDate, setEarliestDeliveryDate] = useState('');
  const [latestDeliveryDate, setLatestDeliveryDate] = useState('');
  const [actualDeliveryDate, setActualDeliveryDate] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<HouseholdItemCategoryEntity[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Load vendors and categories on mount
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      try {
        const [vendorsResponse, categoriesResponse] = await Promise.all([
          fetchVendors({ pageSize: 100 }),
          fetchHouseholdItemCategories(),
        ]);
        setVendors(vendorsResponse.vendors);
        setCategories(categoriesResponse.categories);
        // Set default category to first one from API for better UX
        if (categoriesResponse.categories.length > 0) {
          setCategory(categoriesResponse.categories[0].id as HouseholdItemCategory);
        }
      } catch (err) {
        setError('Failed to load form data. Please try again.');
        console.error('Failed to load data:', err);
      } finally {
        setIsLoadingData(false);
      }
    }

    loadData();
  }, []);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = t('create.form.name.error');
    }

    if (!category) {
      errors.category = t('create.form.category.error');
    }

    if (quantity < 1) {
      errors.quantity = t('create.form.quantity.error');
    }

    if (actualDeliveryDate && orderDate && actualDeliveryDate < orderDate) {
      errors.deliveryDates = t('create.form.deliveryDates.error');
    }

    if (earliestDeliveryDate && latestDeliveryDate && earliestDeliveryDate > latestDeliveryDate) {
      errors.deliveryWindow = t('create.form.deliveryWindow.error');
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
      const item = await createHouseholdItem({
        name: name.trim(),
        description: description.trim() || null,
        category,
        status,
        quantity,
        vendorId: vendorId || null,
        url: url.trim() || null,
        orderDate: orderDate || null,
        earliestDeliveryDate: earliestDeliveryDate || undefined,
        latestDeliveryDate: latestDeliveryDate || undefined,
        actualDeliveryDate: actualDeliveryDate || null,
      });

      showToast('success', t('create.success'));
      navigate(`/project/household-items/${item.id}`);
    } catch (err) {
      setError(t('create.errorBanner'));
      console.error('Failed to create household item:', err);
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('create.loading')}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/project/household-items')}
          disabled={isSubmitting}
        >
          {t('create.backButton')}
        </button>
        <h1 className={styles.title}>{t('create.title')}</h1>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="name" className={styles.label}>
            {t('create.form.name.label')}{' '}
            <span className={styles.required}>{t('create.form.name.required')}</span>
          </label>
          <input
            type="text"
            id="name"
            className={`${styles.input} ${validationErrors.name ? styles.inputError : ''}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('create.form.name.placeholder')}
            aria-required="true"
            aria-invalid={!!validationErrors.name}
            aria-describedby={validationErrors.name ? 'hi-create-name-error' : undefined}
          />
          {validationErrors.name && (
            <div id="hi-create-name-error" className={styles.errorText} role="alert">
              {validationErrors.name}
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="description" className={styles.label}>
            {t('create.form.description.label')}
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder={t('create.form.description.placeholder')}
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="category" className={styles.label}>
              {t('create.form.category.label')}{' '}
              <span className={styles.required}>{t('create.form.category.required')}</span>
            </label>
            <select
              id="category"
              className={`${styles.select} ${validationErrors.category ? styles.selectError : ''}`}
              value={category}
              onChange={(e) => setCategory(e.target.value as HouseholdItemCategory)}
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={!!validationErrors.category}
              aria-describedby={validationErrors.category ? 'hi-create-category-error' : undefined}
            >
              <option value="">{t('create.form.category.placeholder')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {validationErrors.category && (
              <div id="hi-create-category-error" className={styles.errorText} role="alert">
                {validationErrors.category}
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="status" className={styles.label}>
              {t('create.form.status.label')}
            </label>
            <select
              id="status"
              className={styles.select}
              value={status}
              onChange={(e) => setStatus(e.target.value as HouseholdItemStatus)}
              disabled={isSubmitting}
              aria-required="true"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="quantity" className={styles.label}>
              {t('create.form.quantity.label')}
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
              aria-describedby={validationErrors.quantity ? 'hi-create-quantity-error' : undefined}
            />
            {validationErrors.quantity && (
              <div id="hi-create-quantity-error" className={styles.errorText} role="alert">
                {validationErrors.quantity}
              </div>
            )}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="vendorId" className={styles.label}>
            {t('create.form.vendor.label')}
          </label>
          <select
            id="vendorId"
            className={styles.select}
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">{t('create.form.vendor.placeholder')}</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="url" className={styles.label}>
            {t('create.form.url.label')}
          </label>
          <input
            type="url"
            id="url"
            className={styles.input}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('create.form.url.placeholder')}
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="orderDate" className={styles.label}>
              {t('create.form.orderDate.label')}
            </label>
            <input
              type="date"
              id="orderDate"
              className={styles.input}
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="earliestDeliveryDate" className={styles.label}>
              {t('create.form.earliestDelivery.label')}
            </label>
            <input
              type="date"
              id="earliestDeliveryDate"
              className={`${styles.input} ${validationErrors.deliveryWindow ? styles.inputError : ''}`}
              value={earliestDeliveryDate}
              onChange={(e) => setEarliestDeliveryDate(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={!!validationErrors.deliveryWindow}
              aria-describedby={
                validationErrors.deliveryWindow ? 'hi-create-delivery-window-error' : undefined
              }
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="latestDeliveryDate" className={styles.label}>
              {t('create.form.latestDelivery.label')}
            </label>
            <input
              type="date"
              id="latestDeliveryDate"
              className={`${styles.input} ${validationErrors.deliveryWindow ? styles.inputError : ''}`}
              value={latestDeliveryDate}
              onChange={(e) => setLatestDeliveryDate(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={!!validationErrors.deliveryWindow}
              aria-describedby={
                validationErrors.deliveryWindow ? 'hi-create-delivery-window-error' : undefined
              }
            />
            {validationErrors.deliveryWindow && (
              <div id="hi-create-delivery-window-error" className={styles.errorText} role="alert">
                {validationErrors.deliveryWindow}
              </div>
            )}
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="actualDeliveryDate" className={styles.label}>
              {t('create.form.actualDelivery.label')}
            </label>
            <input
              type="date"
              id="actualDeliveryDate"
              className={`${styles.input} ${validationErrors.deliveryDates ? styles.inputError : ''}`}
              value={actualDeliveryDate}
              onChange={(e) => setActualDeliveryDate(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={!!validationErrors.deliveryDates}
              aria-describedby={
                validationErrors.deliveryDates ? 'hi-create-delivery-error' : undefined
              }
            />
            {validationErrors.deliveryDates && (
              <div id="hi-create-delivery-error" className={styles.errorText} role="alert">
                {validationErrors.deliveryDates}
              </div>
            )}
          </div>
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => navigate('/project/household-items')}
            disabled={isSubmitting}
          >
            {t('create.cancel')}
          </button>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? t('create.submitting') : t('create.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default HouseholdItemCreatePage;
