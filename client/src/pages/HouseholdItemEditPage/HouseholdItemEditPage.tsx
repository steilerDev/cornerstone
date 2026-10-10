import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../../lib/apiClient.js';
import type { HouseholdItemCategory, HouseholdItemCategoryEntity } from '@cornerstone/shared';
import { getHouseholdItem, updateHouseholdItem } from '../../lib/householdItemsApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { useAreas } from '../../hooks/useAreas.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { AreaPicker } from '../../components/AreaPicker/AreaPicker.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { readOrigin, pathnameOf } from '../../navigation/origin.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import styles from './HouseholdItemEditPage.module.css';
import { routeUrl } from '@cornerstone/shared';

interface Vendor {
  id: string;
  name: string;
}

export function HouseholdItemEditPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const { t } = useTranslation('householdItems');
  const { t: tc } = useTranslation('common');
  const { areas, isLoading: areasLoading } = useAreas();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<HouseholdItemCategory>('' as HouseholdItemCategory);
  const [quantity, setQuantity] = useState(1);
  const [areaId, setAreaId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [url, setUrl] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<HouseholdItemCategoryEntity[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [notFound, setNotFound] = useState(false);
  const [loadedName, setLoadedName] = useState<string | null>(null);

  const h1Text = notFound ? tc('navigation.purchaseNotFound') : tc('navigation.editPurchase');
  useDocumentTitle(h1Text);
  const breadcrumbName = loadedName
    ? loadedName.trim() || tc('navigation.untitledPurchase')
    : undefined;

  // Opened from the purchase itself: return with history; otherwise replace this page.
  const returnToPurchase = () => {
    const purchaseUrl = routeUrl('householdItem', { id: id! });
    const origin = readOrigin(location.state);
    if (origin && pathnameOf(origin.to) === purchaseUrl) {
      navigate(-1);
    } else {
      navigate(purchaseUrl, { replace: true });
    }
  };

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
        setLoadedName(item.name);
        setDescription(item.description || '');
        setCategory(item.category);
        setQuantity(item.quantity);
        setAreaId(item.area?.id ?? '');
        setVendorId(item.vendor?.id ?? '');
        setUrl(item.url || '');
      } catch (err) {
        console.error('Failed to load data:', err);
        if (err instanceof ApiClientError && err.statusCode === 404) {
          setNotFound(true);
        } else {
          setError(t('edit.errors.loadFailed'));
        }
      } finally {
        setIsLoadingData(false);
      }
    }

    if (id) {
      loadData();
    }
  }, [id, t]);

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
        areaId: areaId || null,
        vendorId: vendorId || null,
        url: url.trim() || null,
      });

      showToast('success', t('edit.success'));
      returnToPurchase();
    } catch (err) {
      setError(t('edit.errorBanner'));
      console.error('Failed to update household item:', err);
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs objectNames={{ householdItem: breadcrumbName }} />
        <h1 className={styles.title}>{h1Text}</h1>
        <div className={styles.loading}>{t('edit.loading')}</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs objectNames={{ householdItem: breadcrumbName }} />
        <div className={styles.header}>
          <h1 className={styles.title}>{h1Text}</h1>
        </div>
        <div className={styles.errorBanner}>{t('edit.notFoundMessage')}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageBreadcrumbs objectNames={{ householdItem: breadcrumbName }} />
      <div className={styles.header}>
        <h1 className={styles.title}>{h1Text}</h1>
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
              onWheel={(e) => e.currentTarget.blur()}
            />
            {validationErrors.quantity && (
              <div id="hi-edit-quantity-error" className={styles.errorText} role="alert">
                {validationErrors.quantity}
              </div>
            )}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="area" className={styles.label}>
            {t('edit.form.area.label')}
          </label>
          {areasLoading ? (
            <div className={styles.select} style={{ opacity: 0.6 }}>
              {t('edit.loading')}
            </div>
          ) : (
            <AreaPicker
              areas={areas}
              value={areaId}
              onChange={setAreaId}
              disabled={isSubmitting}
              nullable
            />
          )}
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
            onClick={returnToPurchase}
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
