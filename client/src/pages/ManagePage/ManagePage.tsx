import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  TagResponse,
  BudgetCategory,
  HouseholdItemCategoryEntity,
  CreateTagRequest,
  UpdateTagRequest,
  CreateBudgetCategoryRequest,
  UpdateBudgetCategoryRequest,
  CreateHouseholdItemCategoryRequest,
  UpdateHouseholdItemCategoryRequest,
} from '@cornerstone/shared';
import { fetchTags, createTag, updateTag, deleteTag } from '../../lib/tagsApi.js';
import {
  fetchBudgetCategories,
  createBudgetCategory,
  updateBudgetCategory,
  deleteBudgetCategory,
} from '../../lib/budgetCategoriesApi.js';
import {
  fetchHouseholdItemCategories,
  createHouseholdItemCategory,
  updateHouseholdItemCategory,
  deleteHouseholdItemCategory,
} from '../../lib/householdItemCategoriesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { TagPill } from '../../components/TagPill/TagPill.js';
import { SettingsSubNav } from '../../components/SettingsSubNav/SettingsSubNav.js';
import styles from './ManagePage.module.css';

const DEFAULT_COLOR = '#3b82f6';

// ============================================================
// TAGS TAB
// ============================================================

type EditingTag = {
  id: string;
  name: string;
  color: string;
};

function TagsTab() {
  const { t } = useTranslation('settings');
  const [tags, setTags] = useState<TagResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Create tag state
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Edit tag state
  const [editingTag, setEditingTag] = useState<EditingTag | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');

  // Delete confirmation state
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto-scroll to top when error appears
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchTags();
      setTags(response.tags);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('manage.tags.error.load'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTag = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setSuccessMessage('');

    const trimmedName = newTagName.trim();
    if (!trimmedName) {
      setCreateError(t('manage.tags.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 50) {
      setCreateError(t('manage.tags.validation.nameTooLong'));
      return;
    }

    setIsCreating(true);

    try {
      const newTag = await createTag({ name: trimmedName, color: newTagColor } as CreateTagRequest);
      setTags([...tags, newTag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName('');
      setNewTagColor('#3b82f6');
      setSuccessMessage(t('manage.tags.toast.created', { name: newTag.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('manage.tags.error.create'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (tag: TagResponse) => {
    setEditingTag({
      id: tag.id,
      name: tag.name,
      color: tag.color ?? '#3b82f6',
    });
    setUpdateError('');
    setSuccessMessage('');
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setUpdateError('');
  };

  const handleUpdateTag = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingTag) return;

    setUpdateError('');
    setSuccessMessage('');

    const trimmedName = editingTag.name.trim();
    if (!trimmedName) {
      setUpdateError(t('manage.tags.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 50) {
      setUpdateError(t('manage.tags.validation.nameTooLong'));
      return;
    }

    setIsUpdating(true);

    try {
      const updatedTag = await updateTag(editingTag.id, {
        name: trimmedName,
        color: editingTag.color,
      } as UpdateTagRequest);
      setTags(
        tags
          .map((tag) => (tag.id === updatedTag.id ? updatedTag : tag))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingTag(null);
      setSuccessMessage(t('manage.tags.toast.updated', { name: updatedTag.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError(t('manage.tags.error.update'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    setIsDeleting(true);
    setSuccessMessage('');

    try {
      await deleteTag(tagId);
      const deletedTag = tags.find((tag) => tag.id === tagId);
      setTags(tags.filter((tag) => tag.id !== tagId));
      setDeletingTagId(null);
      setSuccessMessage(t('manage.tags.toast.deleted', { name: deletedTag?.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('manage.tags.error.delete'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>{t('manage.tags.loadingTags')}</div>;
  }

  if (error && tags.length === 0) {
    return (
      <div className={styles.errorCard} role="alert">
        <h2 className={styles.errorTitle}>{t('manage.error.title')}</h2>
        <p>{error}</p>
        <button type="button" className={styles.button} onClick={loadTags}>
          {t('manage.error.retry')}
        </button>
      </div>
    );
  }

  return (
    <>
      {successMessage && (
        <div className={styles.successBanner} role="alert">
          {successMessage}
        </div>
      )}

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Create new tag */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('manage.tags.createSection')}</h2>
        <p className={styles.cardDescription}>{t('manage.tags.createDescription')}</p>

        {createError && (
          <div className={styles.errorBanner} role="alert">
            {createError}
          </div>
        )}

        <form onSubmit={handleCreateTag} className={styles.form}>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="tagName" className={styles.label}>
                {t('manage.tags.nameLabel')}
              </label>
              <input
                type="text"
                id="tagName"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className={styles.input}
                placeholder="e.g., Plumbing, Electrical, Kitchen"
                maxLength={50}
                disabled={isCreating}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="tagColor" className={styles.label}>
                {t('manage.tags.colorLabel')}
              </label>
              <input
                type="color"
                id="tagColor"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className={styles.colorInput}
                disabled={isCreating}
              />
            </div>
          </div>

          <div className={styles.previewRow}>
            <span className={styles.previewLabel}>{t('manage.tags.previewLabel')}</span>
            <TagPill name={newTagName || t('manage.tags.previewDefault')} color={newTagColor} />
          </div>

          <button
            type="submit"
            className={styles.button}
            disabled={isCreating || !newTagName.trim()}
          >
            {isCreating ? t('manage.tags.submitPending') : t('manage.tags.submitIdle')}
          </button>
        </form>
      </section>

      {/* Tags list */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {t('manage.tags.existingTitle', { count: tags.length })}
        </h2>

        {tags.length === 0 ? (
          <p className={styles.emptyState}>{t('manage.tags.empty')}</p>
        ) : (
          <div className={styles.itemsList}>
            {tags.map((tag) => (
              <div key={tag.id} className={styles.itemRow}>
                {editingTag?.id === tag.id ? (
                  <form onSubmit={handleUpdateTag} className={styles.editForm}>
                    {updateError && (
                      <div className={styles.errorBanner} role="alert">
                        {updateError}
                      </div>
                    )}
                    <div className={styles.editFields}>
                      <input
                        type="text"
                        value={editingTag.name}
                        onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                        className={styles.input}
                        maxLength={50}
                        disabled={isUpdating}
                      />
                      <input
                        type="color"
                        value={editingTag.color}
                        onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                        className={styles.colorInput}
                        disabled={isUpdating}
                      />
                    </div>
                    <div className={styles.editActions}>
                      <button
                        type="submit"
                        className={styles.saveButton}
                        disabled={isUpdating || !editingTag.name.trim()}
                      >
                        {isUpdating ? t('manage.tags.savePending') : t('manage.tags.saveIdle')}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={cancelEdit}
                        disabled={isUpdating}
                      >
                        {t('manage.tags.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={styles.itemInfo}>
                      <TagPill name={tag.name} color={tag.color} />
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(tag)}
                        disabled={!!editingTag}
                      >
                        {t('manage.tags.edit')}
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => setDeletingTagId(tag.id)}
                        disabled={!!editingTag}
                      >
                        {t('manage.tags.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delete confirmation modal */}
      {deletingTagId && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setDeletingTagId(null)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('manage.tags.deleteModal.title')}</h2>
            <p className={styles.modalText}>
              {t('manage.tags.deleteModal.text', {
                name: tags.find((t) => t.id === deletingTagId)?.name,
              })}
            </p>
            <p className={styles.modalWarning}>{t('manage.tags.deleteModal.warning')}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingTagId(null)}
                disabled={isDeleting}
              >
                {t('manage.tags.deleteModal.cancel')}
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={() => handleDeleteTag(deletingTagId)}
                disabled={isDeleting}
              >
                {isDeleting
                  ? t('manage.tags.deleteModal.submitPending')
                  : t('manage.tags.deleteModal.submitIdle')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// BUDGET CATEGORIES TAB
// ============================================================

type EditingBudgetCategory = {
  id: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
};

function BudgetCategoriesTab() {
  const { t } = useTranslation('settings');
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [newSortOrder, setNewSortOrder] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Edit state
  const [editingCategory, setEditingCategory] = useState<EditingBudgetCategory | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');

  // Delete confirmation state
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  useEffect(() => {
    void loadCategories();
  }, []);

  const loadCategories = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchBudgetCategories();
      setCategories(response.categories);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('manage.budgetCategories.error.load'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCategory = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setSuccessMessage('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError(t('manage.budgetCategories.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setCreateError(t('manage.budgetCategories.validation.nameTooLong'));
      return;
    }

    const sortOrderValue = newSortOrder.trim() !== '' ? parseInt(newSortOrder, 10) : undefined;

    setIsCreating(true);

    try {
      const created = await createBudgetCategory({
        name: trimmedName,
        description: newDescription.trim() || null,
        color: newColor,
        sortOrder: sortOrderValue,
      } as CreateBudgetCategoryRequest);
      setCategories(
        [...categories, created].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        ),
      );
      setNewName('');
      setNewDescription('');
      setNewColor(DEFAULT_COLOR);
      setNewSortOrder('');
      setShowCreateForm(false);
      setSuccessMessage(t('manage.budgetCategories.toast.created', { name: created.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('manage.budgetCategories.error.create'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (category: BudgetCategory) => {
    setEditingCategory({
      id: category.id,
      name: category.name,
      description: category.description ?? '',
      color: category.color ?? DEFAULT_COLOR,
      sortOrder: category.sortOrder,
    });
    setUpdateError('');
    setSuccessMessage('');
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setUpdateError('');
  };

  const handleUpdateCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCategory) return;

    setUpdateError('');
    setSuccessMessage('');

    const trimmedName = editingCategory.name.trim();
    if (!trimmedName) {
      setUpdateError(t('manage.budgetCategories.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setUpdateError(t('manage.budgetCategories.validation.nameTooLong'));
      return;
    }

    setIsUpdating(true);

    try {
      const updated = await updateBudgetCategory(editingCategory.id, {
        name: trimmedName,
        description: editingCategory.description.trim() || null,
        color: editingCategory.color,
        sortOrder: editingCategory.sortOrder,
      } as UpdateBudgetCategoryRequest);
      setCategories(
        categories
          .map((cat) => (cat.id === updated.id ? updated : cat))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
      setEditingCategory(null);
      setSuccessMessage(t('manage.budgetCategories.toast.updated', { name: updated.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError(t('manage.budgetCategories.error.update'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteConfirm = (categoryId: string) => {
    setDeletingCategoryId(categoryId);
    setDeleteError('');
    setSuccessMessage('');
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setDeletingCategoryId(null);
      setDeleteError('');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteBudgetCategory(categoryId);
      const deleted = categories.find((cat) => cat.id === categoryId);
      setCategories(categories.filter((cat) => cat.id !== categoryId));
      setDeletingCategoryId(null);
      setSuccessMessage(t('manage.budgetCategories.toast.deleted', { name: deleted?.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(t('manage.budgetCategories.inUseError'));
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError(t('manage.budgetCategories.error.delete'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>{t('manage.budgetCategories.loadingCategories')}</div>;
  }

  if (error && categories.length === 0) {
    return (
      <div className={styles.errorCard} role="alert">
        <h2 className={styles.errorTitle}>{t('manage.error.title')}</h2>
        <p>{error}</p>
        <button type="button" className={styles.button} onClick={() => void loadCategories()}>
          {t('manage.error.retry')}
        </button>
      </div>
    );
  }

  return (
    <>
      {successMessage && (
        <div className={styles.successBanner} role="alert">
          {successMessage}
        </div>
      )}

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('manage.budgetCategories.newSection')}</h2>
          <p className={styles.cardDescription}>{t('manage.budgetCategories.newDescription')}</p>

          {createError && (
            <div className={styles.errorBanner} role="alert">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateCategory} className={styles.form}>
            <div className={styles.formRow}>
              <div className={styles.fieldGrow}>
                <label htmlFor="categoryName" className={styles.label}>
                  {t('manage.budgetCategories.nameLabel')}{' '}
                  <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  id="categoryName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={styles.input}
                  placeholder={t('manage.budgetCategories.namePlaceholder')}
                  maxLength={100}
                  disabled={isCreating}
                  autoFocus
                />
              </div>

              <div className={styles.fieldFixed}>
                <label htmlFor="categoryColor" className={styles.label}>
                  {t('manage.budgetCategories.colorLabel')}
                </label>
                <div className={styles.colorWrapper}>
                  <input
                    type="color"
                    id="categoryColor"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className={styles.colorInput}
                    disabled={isCreating}
                  />
                  <span
                    className={styles.colorSwatch}
                    style={{ backgroundColor: newColor }}
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div className={styles.fieldNarrow}>
                <label htmlFor="categorySortOrder" className={styles.label}>
                  {t('manage.budgetCategories.sortOrderLabel')}
                </label>
                <input
                  type="number"
                  id="categorySortOrder"
                  value={newSortOrder}
                  onChange={(e) => setNewSortOrder(e.target.value)}
                  className={styles.input}
                  placeholder="0"
                  min={0}
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="categoryDescription" className={styles.label}>
                {t('manage.budgetCategories.descriptionLabel')}
              </label>
              <input
                type="text"
                id="categoryDescription"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className={styles.input}
                placeholder={t('manage.budgetCategories.descriptionPlaceholder')}
                maxLength={500}
                disabled={isCreating}
              />
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.button}
                disabled={isCreating || !newName.trim()}
              >
                {isCreating
                  ? t('manage.budgetCategories.createPending')
                  : t('manage.budgetCategories.createIdle')}
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError('');
                  setNewName('');
                  setNewDescription('');
                  setNewColor(DEFAULT_COLOR);
                  setNewSortOrder('');
                }}
                disabled={isCreating}
              >
                {t('manage.budgetCategories.cancel')}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Categories list */}
      <section className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className={styles.cardTitle}>
            {t('manage.budgetCategories.listTitle', { count: categories.length })}
          </h2>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setShowCreateForm(true);
              setCreateError('');
            }}
            disabled={showCreateForm}
          >
            {t('manage.budgetCategories.addButton')}
          </button>
        </div>

        {categories.length === 0 ? (
          <p className={styles.emptyState}>{t('manage.budgetCategories.empty')}</p>
        ) : (
          <div className={styles.itemsList}>
            {categories.map((category) => (
              <div key={category.id} className={styles.itemRow}>
                {editingCategory?.id === category.id ? (
                  <form
                    onSubmit={handleUpdateCategory}
                    className={styles.editForm}
                    aria-label={`Edit ${category.name}`}
                  >
                    {updateError && (
                      <div className={styles.errorBanner} role="alert">
                        {updateError}
                      </div>
                    )}
                    <div className={styles.editFormRow}>
                      <div className={styles.fieldGrow}>
                        <label htmlFor={`edit-name-${category.id}`} className={styles.label}>
                          {t('manage.budgetCategories.nameLabel')}{' '}
                          <span className={styles.required}>*</span>
                        </label>
                        <input
                          type="text"
                          id={`edit-name-${category.id}`}
                          value={editingCategory.name}
                          onChange={(e) =>
                            setEditingCategory({ ...editingCategory, name: e.target.value })
                          }
                          className={styles.input}
                          maxLength={100}
                          disabled={isUpdating}
                          autoFocus
                        />
                      </div>

                      <div className={styles.fieldFixed}>
                        <label htmlFor={`edit-color-${category.id}`} className={styles.label}>
                          {t('manage.budgetCategories.colorLabel')}
                        </label>
                        <div className={styles.colorWrapper}>
                          <input
                            type="color"
                            id={`edit-color-${category.id}`}
                            value={editingCategory.color}
                            onChange={(e) =>
                              setEditingCategory({ ...editingCategory, color: e.target.value })
                            }
                            className={styles.colorInput}
                            disabled={isUpdating}
                          />
                          <span
                            className={styles.colorSwatch}
                            style={{ backgroundColor: editingCategory.color }}
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      <div className={styles.fieldNarrow}>
                        <label htmlFor={`edit-sortorder-${category.id}`} className={styles.label}>
                          {t('manage.budgetCategories.sortOrderLabel')}
                        </label>
                        <input
                          type="number"
                          id={`edit-sortorder-${category.id}`}
                          value={editingCategory.sortOrder}
                          onChange={(e) =>
                            setEditingCategory({
                              ...editingCategory,
                              sortOrder: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className={styles.input}
                          min={0}
                          disabled={isUpdating}
                        />
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor={`edit-description-${category.id}`} className={styles.label}>
                        {t('manage.budgetCategories.descriptionLabel')}
                      </label>
                      <input
                        type="text"
                        id={`edit-description-${category.id}`}
                        value={editingCategory.description}
                        onChange={(e) =>
                          setEditingCategory({
                            ...editingCategory,
                            description: e.target.value,
                          })
                        }
                        className={styles.input}
                        placeholder={t('manage.budgetCategories.descriptionPlaceholder')}
                        maxLength={500}
                        disabled={isUpdating}
                      />
                    </div>

                    <div className={styles.editActions}>
                      <button
                        type="submit"
                        className={styles.saveButton}
                        disabled={isUpdating || !editingCategory.name.trim()}
                      >
                        {isUpdating
                          ? t('manage.budgetCategories.savePending')
                          : t('manage.budgetCategories.saveIdle')}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={cancelEdit}
                        disabled={isUpdating}
                      >
                        {t('manage.budgetCategories.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={styles.itemInfo}>
                      <span
                        className={styles.itemSwatch}
                        style={{ backgroundColor: category.color ?? DEFAULT_COLOR }}
                        aria-hidden="true"
                      />
                      <div className={styles.itemDetails}>
                        <span className={styles.itemName}>{category.name}</span>
                        {category.description && (
                          <span className={styles.itemDescription}>{category.description}</span>
                        )}
                      </div>
                      <span className={styles.itemSortOrder} title="Sort order">
                        #{category.sortOrder}
                      </span>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(category)}
                        disabled={!!editingCategory}
                        aria-label={`Edit ${category.name}`}
                      >
                        {t('manage.budgetCategories.edit')}
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => openDeleteConfirm(category.id)}
                        disabled={!!editingCategory}
                        aria-label={`Delete ${category.name}`}
                      >
                        {t('manage.budgetCategories.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delete confirmation modal */}
      {deletingCategoryId && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteConfirm} />
          <div className={styles.modalContent}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              {t('manage.budgetCategories.deleteModal.title')}
            </h2>
            <p className={styles.modalText}>
              {t('manage.budgetCategories.deleteModal.text', {
                name: categories.find((c) => c.id === deletingCategoryId)?.name,
              })}
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>
                {t('manage.budgetCategories.deleteModal.warning')}
              </p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('manage.budgetCategories.deleteModal.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDeleteCategory(deletingCategoryId)}
                  disabled={isDeleting}
                >
                  {isDeleting
                    ? t('manage.budgetCategories.deleteModal.submitPending')
                    : t('manage.budgetCategories.deleteModal.submitIdle')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// HOUSEHOLD ITEM CATEGORIES TAB
// ============================================================

type EditingHICategory = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

function HouseholdItemCategoriesTab() {
  const { t } = useTranslation('settings');
  const [categories, setCategories] = useState<HouseholdItemCategoryEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [newSortOrder, setNewSortOrder] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Edit state
  const [editingCategory, setEditingCategory] = useState<EditingHICategory | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');

  // Delete confirmation state
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  useEffect(() => {
    void loadCategories();
  }, []);

  const loadCategories = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchHouseholdItemCategories();
      setCategories(response.categories);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('manage.hiCategories.error.load'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCategory = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setSuccessMessage('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError(t('manage.hiCategories.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setCreateError(t('manage.hiCategories.validation.nameTooLong'));
      return;
    }

    const sortOrderValue = newSortOrder.trim() !== '' ? parseInt(newSortOrder, 10) : undefined;

    setIsCreating(true);

    try {
      const created = await createHouseholdItemCategory({
        name: trimmedName,
        color: newColor,
        sortOrder: sortOrderValue,
      } as CreateHouseholdItemCategoryRequest);
      setCategories(
        [...categories, created].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        ),
      );
      setNewName('');
      setNewColor(DEFAULT_COLOR);
      setNewSortOrder('');
      setShowCreateForm(false);
      setSuccessMessage(t('manage.hiCategories.toast.created', { name: created.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('manage.hiCategories.error.create'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (category: HouseholdItemCategoryEntity) => {
    setEditingCategory({
      id: category.id,
      name: category.name,
      color: category.color ?? DEFAULT_COLOR,
      sortOrder: category.sortOrder,
    });
    setUpdateError('');
    setSuccessMessage('');
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setUpdateError('');
  };

  const handleUpdateCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCategory) return;

    setUpdateError('');
    setSuccessMessage('');

    const trimmedName = editingCategory.name.trim();
    if (!trimmedName) {
      setUpdateError(t('manage.hiCategories.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setUpdateError(t('manage.hiCategories.validation.nameTooLong'));
      return;
    }

    setIsUpdating(true);

    try {
      const updated = await updateHouseholdItemCategory(editingCategory.id, {
        name: trimmedName,
        color: editingCategory.color,
        sortOrder: editingCategory.sortOrder,
      } as UpdateHouseholdItemCategoryRequest);
      setCategories(
        categories
          .map((cat) => (cat.id === updated.id ? updated : cat))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
      setEditingCategory(null);
      setSuccessMessage(t('manage.hiCategories.toast.updated', { name: updated.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError(t('manage.hiCategories.error.update'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteConfirm = (categoryId: string) => {
    setDeletingCategoryId(categoryId);
    setDeleteError('');
    setSuccessMessage('');
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setDeletingCategoryId(null);
      setDeleteError('');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteHouseholdItemCategory(categoryId);
      const deleted = categories.find((cat) => cat.id === categoryId);
      setCategories(categories.filter((cat) => cat.id !== categoryId));
      setDeletingCategoryId(null);
      setSuccessMessage(t('manage.hiCategories.toast.deleted', { name: deleted?.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(t('manage.hiCategories.inUseError'));
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError(t('manage.hiCategories.error.delete'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>{t('manage.hiCategories.loadingCategories')}</div>;
  }

  if (error && categories.length === 0) {
    return (
      <div className={styles.errorCard} role="alert">
        <h2 className={styles.errorTitle}>{t('manage.error.title')}</h2>
        <p>{error}</p>
        <button type="button" className={styles.button} onClick={() => void loadCategories()}>
          {t('manage.error.retry')}
        </button>
      </div>
    );
  }

  return (
    <>
      {successMessage && (
        <div className={styles.successBanner} role="alert">
          {successMessage}
        </div>
      )}

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('manage.hiCategories.newSection')}</h2>
          <p className={styles.cardDescription}>{t('manage.hiCategories.newDescription')}</p>

          {createError && (
            <div className={styles.errorBanner} role="alert">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateCategory} className={styles.form}>
            <div className={styles.formRow}>
              <div className={styles.fieldGrow}>
                <label htmlFor="categoryName" className={styles.label}>
                  {t('manage.hiCategories.nameLabel')} <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  id="categoryName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={styles.input}
                  placeholder={t('manage.hiCategories.namePlaceholder')}
                  maxLength={100}
                  disabled={isCreating}
                  autoFocus
                />
              </div>

              <div className={styles.fieldFixed}>
                <label htmlFor="categoryColor" className={styles.label}>
                  {t('manage.hiCategories.colorLabel')}
                </label>
                <div className={styles.colorWrapper}>
                  <input
                    type="color"
                    id="categoryColor"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className={styles.colorInput}
                    disabled={isCreating}
                  />
                  <span
                    className={styles.colorSwatch}
                    style={{ backgroundColor: newColor }}
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div className={styles.fieldNarrow}>
                <label htmlFor="categorySortOrder" className={styles.label}>
                  {t('manage.hiCategories.sortOrderLabel')}
                </label>
                <input
                  type="number"
                  id="categorySortOrder"
                  value={newSortOrder}
                  onChange={(e) => setNewSortOrder(e.target.value)}
                  className={styles.input}
                  placeholder="0"
                  min={0}
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.button}
                disabled={isCreating || !newName.trim()}
              >
                {isCreating
                  ? t('manage.hiCategories.createPending')
                  : t('manage.hiCategories.createIdle')}
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError('');
                  setNewName('');
                  setNewColor(DEFAULT_COLOR);
                  setNewSortOrder('');
                }}
                disabled={isCreating}
              >
                {t('manage.hiCategories.cancel')}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Categories list */}
      <section className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className={styles.cardTitle}>
            {t('manage.hiCategories.listTitle', { count: categories.length })}
          </h2>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setShowCreateForm(true);
              setCreateError('');
            }}
            disabled={showCreateForm}
          >
            {t('manage.hiCategories.addButton')}
          </button>
        </div>

        {categories.length === 0 ? (
          <p className={styles.emptyState}>{t('manage.hiCategories.empty')}</p>
        ) : (
          <div className={styles.itemsList}>
            {categories.map((category) => (
              <div key={category.id} className={styles.itemRow}>
                {editingCategory?.id === category.id ? (
                  <form
                    onSubmit={handleUpdateCategory}
                    className={styles.editForm}
                    aria-label={`Edit ${category.name}`}
                  >
                    {updateError && (
                      <div className={styles.errorBanner} role="alert">
                        {updateError}
                      </div>
                    )}
                    <div className={styles.editFormRow}>
                      <div className={styles.fieldGrow}>
                        <label htmlFor={`edit-name-${category.id}`} className={styles.label}>
                          {t('manage.hiCategories.nameLabel')}{' '}
                          <span className={styles.required}>*</span>
                        </label>
                        <input
                          type="text"
                          id={`edit-name-${category.id}`}
                          value={editingCategory.name}
                          onChange={(e) =>
                            setEditingCategory({ ...editingCategory, name: e.target.value })
                          }
                          className={styles.input}
                          maxLength={100}
                          disabled={isUpdating}
                          autoFocus
                        />
                      </div>

                      <div className={styles.fieldFixed}>
                        <label htmlFor={`edit-color-${category.id}`} className={styles.label}>
                          {t('manage.hiCategories.colorLabel')}
                        </label>
                        <div className={styles.colorWrapper}>
                          <input
                            type="color"
                            id={`edit-color-${category.id}`}
                            value={editingCategory.color}
                            onChange={(e) =>
                              setEditingCategory({ ...editingCategory, color: e.target.value })
                            }
                            className={styles.colorInput}
                            disabled={isUpdating}
                          />
                          <span
                            className={styles.colorSwatch}
                            style={{ backgroundColor: editingCategory.color }}
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      <div className={styles.fieldNarrow}>
                        <label htmlFor={`edit-sortorder-${category.id}`} className={styles.label}>
                          {t('manage.hiCategories.sortOrderLabel')}
                        </label>
                        <input
                          type="number"
                          id={`edit-sortorder-${category.id}`}
                          value={editingCategory.sortOrder}
                          onChange={(e) =>
                            setEditingCategory({
                              ...editingCategory,
                              sortOrder: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className={styles.input}
                          min={0}
                          disabled={isUpdating}
                        />
                      </div>
                    </div>

                    <div className={styles.editActions}>
                      <button
                        type="submit"
                        className={styles.saveButton}
                        disabled={isUpdating || !editingCategory.name.trim()}
                      >
                        {isUpdating
                          ? t('manage.hiCategories.savePending')
                          : t('manage.hiCategories.saveIdle')}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={cancelEdit}
                        disabled={isUpdating}
                      >
                        {t('manage.hiCategories.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={styles.itemInfo}>
                      <span
                        className={styles.itemSwatch}
                        style={{ backgroundColor: category.color ?? DEFAULT_COLOR }}
                        aria-hidden="true"
                      />
                      <div className={styles.itemDetails}>
                        <span className={styles.itemName}>{category.name}</span>
                      </div>
                      <span className={styles.itemSortOrder} title="Sort order">
                        #{category.sortOrder}
                      </span>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(category)}
                        disabled={!!editingCategory}
                        aria-label={`Edit ${category.name}`}
                      >
                        {t('manage.hiCategories.edit')}
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => openDeleteConfirm(category.id)}
                        disabled={!!editingCategory}
                        aria-label={`Delete ${category.name}`}
                      >
                        {t('manage.hiCategories.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delete confirmation modal */}
      {deletingCategoryId && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteConfirm} />
          <div className={styles.modalContent}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              {t('manage.hiCategories.deleteModal.title')}
            </h2>
            <p className={styles.modalText}>
              {t('manage.hiCategories.deleteModal.text', {
                name: categories.find((c) => c.id === deletingCategoryId)?.name,
              })}
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>{t('manage.hiCategories.deleteModal.warning')}</p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('manage.hiCategories.deleteModal.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDeleteCategory(deletingCategoryId)}
                  disabled={isDeleting}
                >
                  {isDeleting
                    ? t('manage.hiCategories.deleteModal.submitPending')
                    : t('manage.hiCategories.deleteModal.submitIdle')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function ManagePage() {
  const { t } = useTranslation('settings');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'tags';

  const handleTabChange = (newTab: string) => {
    setSearchParams({ tab: newTab }, { replace: true });
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = ['tags', 'budget-categories', 'hi-categories'];
    const currentIndex = tabs.indexOf(tab);
    let newIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      newIndex = (currentIndex + 1) % tabs.length;
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      e.preventDefault();
    } else {
      return;
    }

    const newTab = tabs[newIndex];
    setSearchParams({ tab: newTab }, { replace: true });
    // Focus the new tab button
    setTimeout(() => {
      document.getElementById(`${newTab}-tab`)?.focus();
    }, 0);
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.pageTitle}>{t('manage.pageTitle')}</h1>
        <SettingsSubNav />

        <div role="tablist" className={styles.tabList} onKeyDown={handleTabKeyDown}>
          <button
            role="tab"
            aria-selected={tab === 'tags'}
            aria-controls="tags-panel"
            id="tags-tab"
            tabIndex={tab === 'tags' ? 0 : -1}
            onClick={() => handleTabChange('tags')}
            className={`${styles.tab} ${tab === 'tags' ? styles.tabActive : ''}`}
          >
            {t('manage.tabs.tags')}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'budget-categories'}
            aria-controls="budget-categories-panel"
            id="budget-categories-tab"
            tabIndex={tab === 'budget-categories' ? 0 : -1}
            onClick={() => handleTabChange('budget-categories')}
            className={`${styles.tab} ${tab === 'budget-categories' ? styles.tabActive : ''}`}
          >
            {t('manage.tabs.budgetCategories')}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'hi-categories'}
            aria-controls="hi-categories-panel"
            id="hi-categories-tab"
            tabIndex={tab === 'hi-categories' ? 0 : -1}
            onClick={() => handleTabChange('hi-categories')}
            className={`${styles.tab} ${tab === 'hi-categories' ? styles.tabActive : ''}`}
          >
            {t('manage.tabs.hiCategories')}
          </button>
        </div>

        <div
          role="tabpanel"
          id="tags-panel"
          aria-labelledby="tags-tab"
          className={styles.tabPanel}
          hidden={tab !== 'tags'}
        >
          {tab === 'tags' && <TagsTab />}
        </div>
        <div
          role="tabpanel"
          id="budget-categories-panel"
          aria-labelledby="budget-categories-tab"
          className={styles.tabPanel}
          hidden={tab !== 'budget-categories'}
        >
          {tab === 'budget-categories' && <BudgetCategoriesTab />}
        </div>
        <div
          role="tabpanel"
          id="hi-categories-panel"
          aria-labelledby="hi-categories-tab"
          className={styles.tabPanel}
          hidden={tab !== 'hi-categories'}
        >
          {tab === 'hi-categories' && <HouseholdItemCategoriesTab />}
        </div>
      </div>
    </div>
  );
}
