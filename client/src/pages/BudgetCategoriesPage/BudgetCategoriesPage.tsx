import { useState, useEffect, type FormEvent } from 'react';
import type { BudgetCategory } from '@cornerstone/shared';
import {
  fetchBudgetCategories,
  createBudgetCategory,
  updateBudgetCategory,
  deleteBudgetCategory,
} from '../../lib/budgetCategoriesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import styles from './BudgetCategoriesPage.module.css';

const DEFAULT_COLOR = '#3b82f6';

type EditingCategory = {
  id: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
};

export function BudgetCategoriesPage() {
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
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null);
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
        setError('Failed to load budget categories. Please try again.');
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
      setCreateError('Category name is required');
      return;
    }

    if (trimmedName.length > 100) {
      setCreateError('Category name must be 100 characters or less');
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
      });
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
      setSuccessMessage(`Category "${created.name}" created successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError('Failed to create category. Please try again.');
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
      setUpdateError('Category name is required');
      return;
    }

    if (trimmedName.length > 100) {
      setUpdateError('Category name must be 100 characters or less');
      return;
    }

    setIsUpdating(true);

    try {
      const updated = await updateBudgetCategory(editingCategory.id, {
        name: trimmedName,
        description: editingCategory.description.trim() || null,
        color: editingCategory.color,
        sortOrder: editingCategory.sortOrder,
      });
      setCategories(
        categories
          .map((cat) => (cat.id === updated.id ? updated : cat))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
      setEditingCategory(null);
      setSuccessMessage(`Category "${updated.name}" updated successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError('Failed to update category. Please try again.');
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
      setSuccessMessage(`Category "${deleted?.name}" deleted successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(
            'This category cannot be deleted because it is currently in use by one or more budget entries.',
          );
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError('Failed to delete category. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading budget categories...</div>
      </div>
    );
  }

  if (error && categories.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error}</p>
          <button type="button" className={styles.button} onClick={() => void loadCategories()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Budget Categories</h1>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setShowCreateForm(true);
              setCreateError('');
            }}
            disabled={showCreateForm}
          >
            Add Category
          </button>
        </div>

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
            <h2 className={styles.cardTitle}>New Budget Category</h2>
            <p className={styles.cardDescription}>
              Budget categories group your construction costs (e.g., Materials, Labor, Permits).
            </p>

            {createError && (
              <div className={styles.errorBanner} role="alert">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateCategory} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="categoryName" className={styles.label}>
                    Name <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="categoryName"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className={styles.input}
                    placeholder="e.g., Materials, Labor, Permits"
                    maxLength={100}
                    disabled={isCreating}
                    autoFocus
                  />
                </div>

                <div className={styles.fieldFixed}>
                  <label htmlFor="categoryColor" className={styles.label}>
                    Color
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
                    Sort Order
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
                  Description
                </label>
                <input
                  type="text"
                  id="categoryDescription"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className={styles.input}
                  placeholder="Optional description"
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
                  {isCreating ? 'Creating...' : 'Create Category'}
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
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Categories list */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Categories ({categories.length})</h2>

          {categories.length === 0 ? (
            <p className={styles.emptyState}>
              No budget categories yet. Add your first category to start organizing your project
              budget.
            </p>
          ) : (
            <div className={styles.categoriesList}>
              {categories.map((category) => (
                <div key={category.id} className={styles.categoryRow}>
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
                            Name <span className={styles.required}>*</span>
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
                            Color
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
                            Sort Order
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
                          Description
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
                          placeholder="Optional description"
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
                          {isUpdating ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className={styles.cancelButton}
                          onClick={cancelEdit}
                          disabled={isUpdating}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className={styles.categoryInfo}>
                        <span
                          className={styles.categorySwatch}
                          style={{ backgroundColor: category.color ?? DEFAULT_COLOR }}
                          aria-hidden="true"
                        />
                        <div className={styles.categoryDetails}>
                          <span className={styles.categoryName}>{category.name}</span>
                          {category.description && (
                            <span className={styles.categoryDescription}>
                              {category.description}
                            </span>
                          )}
                        </div>
                        <span className={styles.categorySortOrder} title="Sort order">
                          #{category.sortOrder}
                        </span>
                      </div>
                      <div className={styles.categoryActions}>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => startEdit(category)}
                          disabled={!!editingCategory}
                          aria-label={`Edit ${category.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => openDeleteConfirm(category.id)}
                          disabled={!!editingCategory}
                          aria-label={`Delete ${category.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

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
              Delete Category
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete the category &quot;
              <strong>{categories.find((c) => c.id === deletingCategoryId)?.name}</strong>
              &quot;?
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>
                This action cannot be undone. The category will be permanently removed.
              </p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                Cancel
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDeleteCategory(deletingCategoryId)}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Category'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BudgetCategoriesPage;
