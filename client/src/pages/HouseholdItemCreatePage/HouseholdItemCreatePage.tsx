import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  TagResponse,
  HouseholdItemCategory,
  HouseholdItemStatus,
  HouseholdItemCategoryEntity,
} from '@cornerstone/shared';
import { createHouseholdItem } from '../../lib/householdItemsApi.js';
import { fetchTags, createTag } from '../../lib/tagsApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { TagPicker } from '../../components/TagPicker/TagPicker.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import styles from './HouseholdItemCreatePage.module.css';

const STATUSES: Array<{ value: HouseholdItemStatus; label: string }> = [
  { value: 'planned', label: 'Planned' },
  { value: 'purchased', label: 'Purchased' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'arrived', label: 'Arrived' },
];

interface Vendor {
  id: string;
  name: string;
}

export function HouseholdItemCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<HouseholdItemCategory>('' as HouseholdItemCategory);
  const [status, setStatus] = useState<HouseholdItemStatus>('planned');
  const [quantity, setQuantity] = useState(1);
  const [vendorId, setVendorId] = useState('');
  const [url, setUrl] = useState('');
  const [room, setRoom] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [earliestDeliveryDate, setEarliestDeliveryDate] = useState('');
  const [latestDeliveryDate, setLatestDeliveryDate] = useState('');
  const [actualDeliveryDate, setActualDeliveryDate] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [availableTags, setAvailableTags] = useState<TagResponse[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<HouseholdItemCategoryEntity[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Load tags, vendors, and categories on mount
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      try {
        const [tagsResponse, vendorsResponse, categoriesResponse] = await Promise.all([
          fetchTags(),
          fetchVendors({ pageSize: 100 }),
          fetchHouseholdItemCategories(),
        ]);
        setAvailableTags(tagsResponse.tags);
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

  const handleCreateTag = async (name: string, color: string | null): Promise<TagResponse> => {
    const newTag = await createTag({ name, color });
    setAvailableTags((prev) => [...prev, newTag]);
    return newTag;
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Name is required';
    }

    if (!category) {
      errors.category = 'Category is required';
    }

    if (quantity < 1) {
      errors.quantity = 'Quantity must be at least 1';
    }

    if (actualDeliveryDate && orderDate && actualDeliveryDate < orderDate) {
      errors.deliveryDates = 'Actual delivery date must be after or equal to order date';
    }

    if (earliestDeliveryDate && latestDeliveryDate && earliestDeliveryDate > latestDeliveryDate) {
      errors.deliveryWindow =
        'Earliest delivery date must be before or equal to latest delivery date';
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
        room: room.trim() || null,
        orderDate: orderDate || null,
        earliestDeliveryDate: earliestDeliveryDate || undefined,
        latestDeliveryDate: latestDeliveryDate || undefined,
        actualDeliveryDate: actualDeliveryDate || null,
        tagIds: selectedTagIds,
      });

      showToast('success', 'Household item created successfully');
      navigate(`/household-items/${item.id}`);
    } catch (err) {
      setError('Failed to create household item. Please try again.');
      console.error('Failed to create household item:', err);
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/household-items')}
          disabled={isSubmitting}
        >
          ← Back to Household Items
        </button>
        <h1 className={styles.title}>New Household Item</h1>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="name" className={styles.label}>
            Name <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            id="name"
            className={`${styles.input} ${validationErrors.name ? styles.inputError : ''}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            placeholder="Enter item name"
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
            Description
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder="Describe the item"
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="category" className={styles.label}>
              Category <span className={styles.required}>*</span>
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
              <option value="">— Select Category —</option>
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
              Purchase Status
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
              Quantity
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
            Vendor
          </label>
          <select
            id="vendorId"
            className={styles.select}
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">No vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="url" className={styles.label}>
            URL
          </label>
          <input
            type="url"
            id="url"
            className={styles.input}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isSubmitting}
            placeholder="https://example.com"
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="room" className={styles.label}>
            Room
          </label>
          <input
            type="text"
            id="room"
            className={styles.input}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g., Kitchen, Bedroom"
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="orderDate" className={styles.label}>
              Order Date
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
              Earliest Delivery
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
              Latest Delivery
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
              Actual Delivery
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

        <div className={styles.formGroup}>
          <label className={styles.label}>Tags</label>
          <TagPicker
            availableTags={availableTags}
            selectedTagIds={selectedTagIds}
            onSelectionChange={setSelectedTagIds}
            onCreateTag={handleCreateTag}
            disabled={isSubmitting}
          />
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => navigate('/household-items')}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Item'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default HouseholdItemCreatePage;
