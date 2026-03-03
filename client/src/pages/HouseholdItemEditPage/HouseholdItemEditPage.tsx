import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TagResponse, HouseholdItemCategory, HouseholdItemStatus } from '@cornerstone/shared';
import { getHouseholdItem, updateHouseholdItem } from '../../lib/householdItemsApi.js';
import { fetchTags, createTag } from '../../lib/tagsApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { TagPicker } from '../../components/TagPicker/TagPicker.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import styles from './HouseholdItemEditPage.module.css';

const CATEGORIES: Array<{ value: HouseholdItemCategory; label: string }> = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'appliances', label: 'Appliances' },
  { value: 'fixtures', label: 'Fixtures' },
  { value: 'decor', label: 'Decor' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'storage', label: 'Storage' },
  { value: 'other', label: 'Other' },
];

const STATUSES: Array<{ value: HouseholdItemStatus; label: string }> = [
  { value: 'not_ordered', label: 'Not Ordered' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
];

interface Vendor {
  id: string;
  name: string;
}

export function HouseholdItemEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<HouseholdItemCategory>('other');
  const [status, setStatus] = useState<HouseholdItemStatus>('not_ordered');
  const [quantity, setQuantity] = useState(1);
  const [vendorId, setVendorId] = useState('');
  const [url, setUrl] = useState('');
  const [room, setRoom] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [actualDeliveryDate, setActualDeliveryDate] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [availableTags, setAvailableTags] = useState<TagResponse[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [notFound, setNotFound] = useState(false);

  // Load item data, tags, and vendors on mount
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      try {
        const [tagsResponse, vendorsResponse, item] = await Promise.all([
          fetchTags(),
          fetchVendors({ pageSize: 200 }),
          getHouseholdItem(id!),
        ]);

        setAvailableTags(tagsResponse.tags);
        setVendors(vendorsResponse.vendors);

        // Populate form with item data
        setName(item.name);
        setDescription(item.description || '');
        setCategory(item.category);
        setStatus(item.status);
        setQuantity(item.quantity);
        setVendorId(item.vendor?.id ?? '');
        setUrl(item.url || '');
        setRoom(item.room || '');
        setOrderDate(item.orderDate || '');
        setExpectedDeliveryDate(item.expectedDeliveryDate || '');
        setActualDeliveryDate(item.actualDeliveryDate || '');
        setSelectedTagIds(item.tagIds);
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

    if (quantity < 1) {
      errors.quantity = 'Quantity must be at least 1';
    }

    if (actualDeliveryDate && orderDate && actualDeliveryDate < orderDate) {
      errors.deliveryDates = 'Actual delivery date must be after or equal to order date';
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
        status,
        quantity,
        vendorId: vendorId || null,
        url: url.trim() || null,
        room: room.trim() || null,
        orderDate: orderDate || null,
        expectedDeliveryDate: expectedDeliveryDate || null,
        actualDeliveryDate: actualDeliveryDate || null,
        tagIds: selectedTagIds,
      });

      showToast('success', 'Household item updated successfully');
      navigate(`/household-items/${id}`);
    } catch (err) {
      setError('Failed to update household item. Please try again.');
      console.error('Failed to update household item:', err);
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

  if (notFound) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/household-items')}
          >
            ← Back to Household Items
          </button>
          <h1 className={styles.title}>Household Item Not Found</h1>
        </div>
        <div className={styles.errorBanner}>
          The household item you are looking for does not exist.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(`/household-items/${id}`)}
          disabled={isSubmitting}
        >
          ← Back to Item
        </button>
        <h1 className={styles.title}>Edit Household Item</h1>
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
              className={styles.select}
              value={category}
              onChange={(e) => setCategory(e.target.value as HouseholdItemCategory)}
              disabled={isSubmitting}
              aria-required="true"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
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
            <label htmlFor="expectedDeliveryDate" className={styles.label}>
              Expected Delivery
            </label>
            <input
              type="date"
              id="expectedDeliveryDate"
              className={styles.input}
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

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
                validationErrors.deliveryDates ? 'hi-edit-delivery-error' : undefined
              }
            />
            {validationErrors.deliveryDates && (
              <div id="hi-edit-delivery-error" className={styles.errorText} role="alert">
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
            onClick={() => navigate(`/household-items/${id}`)}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default HouseholdItemEditPage;
