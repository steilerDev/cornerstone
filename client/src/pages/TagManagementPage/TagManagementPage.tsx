import { useState, useEffect, type FormEvent } from 'react';
import type { TagResponse } from '@cornerstone/shared';
import { fetchTags, createTag, updateTag, deleteTag } from '../../lib/tagsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { TagPill } from '../../components/TagPill/TagPill.js';
import styles from './TagManagementPage.module.css';

type EditingTag = {
  id: string;
  name: string;
  color: string;
};

export function TagManagementPage() {
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
        setError('Failed to load tags. Please try again.');
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
      setCreateError('Tag name is required');
      return;
    }

    if (trimmedName.length > 50) {
      setCreateError('Tag name must be 50 characters or less');
      return;
    }

    setIsCreating(true);

    try {
      const newTag = await createTag({ name: trimmedName, color: newTagColor });
      setTags([...tags, newTag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName('');
      setNewTagColor('#3b82f6');
      setSuccessMessage(`Tag "${newTag.name}" created successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError('Failed to create tag. Please try again.');
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
      setUpdateError('Tag name is required');
      return;
    }

    if (trimmedName.length > 50) {
      setUpdateError('Tag name must be 50 characters or less');
      return;
    }

    setIsUpdating(true);

    try {
      const updatedTag = await updateTag(editingTag.id, {
        name: trimmedName,
        color: editingTag.color,
      });
      setTags(
        tags
          .map((tag) => (tag.id === updatedTag.id ? updatedTag : tag))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingTag(null);
      setSuccessMessage(`Tag "${updatedTag.name}" updated successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError('Failed to update tag. Please try again.');
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
      setSuccessMessage(`Tag "${deletedTag?.name}" deleted successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to delete tag. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading tags...</div>
      </div>
    );
  }

  if (error && tags.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error}</p>
          <button type="button" className={styles.button} onClick={loadTags}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.pageTitle}>Tag Management</h1>

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
          <h2 className={styles.cardTitle}>Create New Tag</h2>
          <p className={styles.cardDescription}>
            Tags help you organize and categorize work items. Choose a name and color for your tag.
          </p>

          {createError && (
            <div className={styles.errorBanner} role="alert">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateTag} className={styles.form}>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="tagName" className={styles.label}>
                  Tag Name
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
                  Color
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
              <span className={styles.previewLabel}>Preview:</span>
              <TagPill name={newTagName || 'Tag Name'} color={newTagColor} />
            </div>

            <button
              type="submit"
              className={styles.button}
              disabled={isCreating || !newTagName.trim()}
            >
              {isCreating ? 'Creating...' : 'Create Tag'}
            </button>
          </form>
        </section>

        {/* Tags list */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Existing Tags ({tags.length})</h2>

          {tags.length === 0 ? (
            <p className={styles.emptyState}>
              No tags yet. Create your first tag to start organizing your work items.
            </p>
          ) : (
            <div className={styles.tagsList}>
              {tags.map((tag) => (
                <div key={tag.id} className={styles.tagRow}>
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
                      <div className={styles.tagInfo}>
                        <TagPill name={tag.name} color={tag.color} />
                      </div>
                      <div className={styles.tagActions}>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => startEdit(tag)}
                          disabled={!!editingTag}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => setDeletingTagId(tag.id)}
                          disabled={!!editingTag}
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
      {deletingTagId && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setDeletingTagId(null)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Delete Tag</h2>
            <p className={styles.modalText}>
              Are you sure you want to delete the tag &quot;
              <strong>{tags.find((t) => t.id === deletingTagId)?.name}</strong>&quot;?
            </p>
            <p className={styles.modalWarning}>
              This tag will be removed from all work items that reference it.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingTagId(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={() => handleDeleteTag(deletingTagId)}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Tag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TagManagementPage;
