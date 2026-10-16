import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaResponse, CreateAreaRequest, UpdateAreaRequest } from '@cornerstone/shared';
import { AreaPicker } from '../../components/AreaPicker/AreaPicker.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useAreas } from '../../hooks/useAreas.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { buildTree } from '../../lib/areaTreeUtils.js';
import { generateRandomColor } from '../../lib/colorUtils.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import styles from './AreasInterimCard.module.css';

const DEFAULT_COLOR = '#3b82f6';

/**
 * True only until the first load has finished. Later reloads (after a delete, say) keep the
 * section mounted, so the focused heading and the list are not replaced by a skeleton.
 */
function useInitialLoading(isLoading: boolean): boolean {
  const [loaded, setLoaded] = useState(false);
  if (!isLoading && !loaded) setLoaded(true);
  return !loaded;
}

type EditingArea = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  description: string | null;
  sortOrder: number;
};

function AreasCardContent({ onSettled }: { onSettled?: () => void }) {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const {
    areas,
    isLoading,
    error: loadError,
    createArea,
    updateArea,
    deleteArea,
    refetch: _refetch,
  } = useAreas();

  // Create form state
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [newColor, setNewColor] = useState<string>(generateRandomColor);
  const [newDescription, setNewDescription] = useState('');
  const [newSortOrder, setNewSortOrder] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Edit state
  const [editingArea, setEditingArea] = useState<EditingArea | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');

  // Delete confirmation state
  const [deletingAreaId, setDeletingAreaId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteImpact = useDeleteImpact('area', deletingAreaId);
  const sectionHeadingRef = useRef<HTMLHeadingElement>(null);

  const handleCreateArea = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setSuccessMessage('');
    setDeleteError('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError(t('manage.areas.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setCreateError(t('manage.areas.validation.nameTooLong'));
      return;
    }

    setIsCreating(true);

    try {
      await createArea({
        name: trimmedName,
        parentId: newParentId || null,
        color: newColor,
        description: newDescription.trim() || null,
        sortOrder: newSortOrder ? parseInt(newSortOrder, 10) : undefined,
      } as CreateAreaRequest);
      setNewName('');
      setNewParentId('');
      setNewColor(generateRandomColor());
      setNewDescription('');
      setNewSortOrder('');
      setSuccessMessage(t('manage.areas.messages.created', { name: trimmedName }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(
          err.error.code === 'CONFLICT'
            ? t('manage.areas.messages.duplicateName')
            : translateApiError(err.error.code, tErrors),
        );
      } else {
        setCreateError(t('manage.areas.messages.createError'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (area: AreaResponse) => {
    setEditingArea({
      id: area.id,
      name: area.name,
      parentId: area.parentId,
      color: area.color,
      description: area.description,
      sortOrder: area.sortOrder,
    });
    setUpdateError('');
    setSuccessMessage('');
    setDeleteError('');
  };

  const cancelEdit = () => {
    setEditingArea(null);
    setUpdateError('');
  };

  const handleUpdateArea = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingArea) return;

    setUpdateError('');
    setSuccessMessage('');
    setDeleteError('');

    const trimmedName = editingArea.name.trim();
    if (!trimmedName) {
      setUpdateError(t('manage.areas.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setUpdateError(t('manage.areas.validation.nameTooLong'));
      return;
    }

    setIsUpdating(true);

    try {
      await updateArea(editingArea.id, {
        name: trimmedName,
        parentId: editingArea.parentId,
        color: editingArea.color,
        description: editingArea.description,
        sortOrder: editingArea.sortOrder,
      } as UpdateAreaRequest);
      setEditingArea(null);
      setSuccessMessage(t('manage.areas.messages.updated', { name: trimmedName }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(
          err.error.code === 'CONFLICT'
            ? t('manage.areas.messages.duplicateName')
            : translateApiError(err.error.code, tErrors),
        );
      } else {
        setUpdateError(t('manage.areas.messages.updateError'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const closeDeleteDialog = () => {
    if (!isDeleting) {
      setDeletingAreaId(null);
      setDeleteError('');
      setDeleteBlocked(false);
    }
  };

  const handleDeleteArea = async (areaId: string) => {
    setIsDeleting(true);
    setDeleteBlocked(false);
    setSuccessMessage('');
    setDeleteError('');

    try {
      const deletedArea = areas.find((a) => a.id === areaId);
      await deleteArea(areaId);
      setDeletingAreaId(null);
      setSuccessMessage(t('manage.areas.messages.deleted', { name: deletedArea?.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        if (err.statusCode === 409) {
          setDeleteError(t('manage.areas.messages.deleteConflict'));
        } else {
          setDeleteError(translateApiError(err.error.code, tErrors));
        }
      } else {
        setDeleteError(t('manage.areas.messages.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const initialLoading = useInitialLoading(isLoading);
  useEffect(() => {
    if (!initialLoading) onSettled?.();
  }, [initialLoading, onSettled]);
  if (initialLoading) {
    return <Skeleton lines={5} />;
  }

  if (loadError && areas.length === 0) {
    return <EmptyState icon="⚠️" message={loadError} />;
  }

  return (
    <>
      {successMessage && (
        <div className={styles.successBanner} role="status" aria-atomic="true">
          {successMessage}
        </div>
      )}

      {/* Create new area */}
      <section className={styles.card}>
        <h3 className={styles.cardTitle} ref={sectionHeadingRef} tabIndex={-1}>
          {t('manage.areas.createTitle')}
        </h3>
        <p className={styles.cardDescription}>{t('manage.areas.createDescription')}</p>

        {createError && (
          <div className={styles.errorBanner} role="alert">
            {createError}
          </div>
        )}

        <form onSubmit={handleCreateArea} className={styles.form}>
          <div className={styles.formRow}>
            <div className={styles.fieldGrow}>
              <label htmlFor="areaName" className={styles.label}>
                {t('manage.areas.nameLabel')}
              </label>
              <input
                type="text"
                id="areaName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={styles.input}
                placeholder={t('manage.areas.namePlaceholder')}
                maxLength={100}
                disabled={isCreating}
              />
            </div>

            <div className={styles.fieldFixed}>
              <label htmlFor="areaColor" className={styles.label}>
                {t('manage.areas.colorLabel')}
              </label>
              <div className={styles.colorWrapper}>
                <input
                  type="color"
                  id="areaColor"
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
              <label htmlFor="areaSortOrder" className={styles.label}>
                {t('manage.areas.sortOrderLabel')}
              </label>
              <input
                type="number"
                id="areaSortOrder"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(e.target.value)}
                className={styles.input}
                placeholder="0"
                min={0}
                disabled={isCreating}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="areaParent" className={styles.label}>
              {t('manage.areas.parentLabel')}
            </label>
            <AreaPicker
              areas={areas}
              value={newParentId}
              onChange={setNewParentId}
              disabled={isCreating}
              nullable={true}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="areaDescription" className={styles.label}>
              {t('manage.areas.descriptionLabel')}
            </label>
            <input
              type="text"
              id="areaDescription"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className={styles.input}
              placeholder={t('manage.areas.descriptionPlaceholder')}
              maxLength={500}
              disabled={isCreating}
            />
          </div>

          <button type="submit" className={styles.button} disabled={isCreating || !newName.trim()}>
            {isCreating ? t('manage.areas.creating') : t('manage.areas.createButton')}
          </button>
        </form>
      </section>

      {/* Areas list */}
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>
          {t('manage.areas.existingTitle', { count: areas.length })}
        </h3>

        {areas.length === 0 ? (
          <EmptyState icon="📍" message={t('manage.areas.emptyState')} />
        ) : (
          <div className={styles.itemsList}>
            {buildTree(areas).map(({ depth, area }) => (
              <div
                key={area.id}
                className={styles.itemRow}
                style={
                  depth > 0
                    ? { paddingLeft: `calc(var(--spacing-3) + ${depth} * var(--spacing-6))` }
                    : undefined
                }
              >
                {editingArea?.id === area.id ? (
                  <form
                    onSubmit={handleUpdateArea}
                    className={styles.editForm}
                    aria-label={`Edit ${area.name}`}
                  >
                    {updateError && (
                      <div className={styles.errorBanner} role="alert">
                        {updateError}
                      </div>
                    )}
                    <div className={styles.editFormRow}>
                      <div className={styles.fieldGrow}>
                        <label htmlFor={`edit-name-${area.id}`} className={styles.label}>
                          {t('manage.areas.nameLabel')}
                        </label>
                        <input
                          type="text"
                          id={`edit-name-${area.id}`}
                          value={editingArea.name}
                          onChange={(e) => setEditingArea({ ...editingArea, name: e.target.value })}
                          className={styles.input}
                          maxLength={100}
                          disabled={isUpdating}
                        />
                      </div>

                      <div className={styles.fieldFixed}>
                        <label htmlFor={`edit-color-${area.id}`} className={styles.label}>
                          {t('manage.areas.colorLabel')}
                        </label>
                        <div className={styles.colorWrapper}>
                          <input
                            type="color"
                            id={`edit-color-${area.id}`}
                            value={editingArea.color || '#3b82f6'}
                            onChange={(e) =>
                              setEditingArea({ ...editingArea, color: e.target.value })
                            }
                            className={styles.colorInput}
                            disabled={isUpdating}
                          />
                          <span
                            className={styles.colorSwatch}
                            style={{ backgroundColor: editingArea.color || '#3b82f6' }}
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      <div className={styles.fieldNarrow}>
                        <label htmlFor={`edit-sortorder-${area.id}`} className={styles.label}>
                          {t('manage.areas.sortOrderLabel')}
                        </label>
                        <input
                          type="number"
                          id={`edit-sortorder-${area.id}`}
                          value={editingArea.sortOrder}
                          onChange={(e) =>
                            setEditingArea({
                              ...editingArea,
                              sortOrder: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className={styles.input}
                          min={0}
                          disabled={isUpdating}
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor={`edit-parent-${area.id}`} className={styles.label}>
                        {t('manage.areas.parentLabel')}
                      </label>
                      <AreaPicker
                        areas={areas.filter((a) => a.id !== area.id)}
                        value={editingArea.parentId || ''}
                        onChange={(val) =>
                          setEditingArea({ ...editingArea, parentId: val || null })
                        }
                        disabled={isUpdating}
                        nullable={true}
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor={`edit-description-${area.id}`} className={styles.label}>
                        {t('manage.areas.descriptionLabel')}
                      </label>
                      <input
                        type="text"
                        id={`edit-description-${area.id}`}
                        value={editingArea.description || ''}
                        onChange={(e) =>
                          setEditingArea({
                            ...editingArea,
                            description: e.target.value,
                          })
                        }
                        className={styles.input}
                        placeholder={t('manage.areas.descriptionPlaceholder')}
                        maxLength={500}
                        disabled={isUpdating}
                      />
                    </div>

                    <div className={styles.editActions}>
                      <button
                        type="submit"
                        className={styles.saveButton}
                        disabled={isUpdating || !editingArea.name.trim()}
                      >
                        {isUpdating ? t('manage.areas.saving') : t('manage.areas.save')}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={cancelEdit}
                        disabled={isUpdating}
                      >
                        {t('manage.areas.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={styles.itemInfo}>
                      <span
                        className={styles.itemSwatch}
                        style={{ backgroundColor: area.color ?? DEFAULT_COLOR }}
                        aria-hidden="true"
                      />
                      <div className={styles.itemDetails}>
                        <span className={styles.itemName}>{area.name}</span>
                        {area.description && (
                          <span className={styles.itemDescription}>{area.description}</span>
                        )}
                      </div>
                      <span
                        className={styles.itemSortOrder}
                        title={t('manage.areas.sortOrderLabel')}
                      >
                        #{area.sortOrder}
                      </span>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(area)}
                        disabled={!!editingArea}
                      >
                        {t('manage.areas.edit')}
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => {
                          setDeleteError('');
                          setDeletingAreaId(area.id);
                        }}
                        disabled={!!editingArea}
                      >
                        {t('manage.areas.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delete confirmation */}
      {deletingAreaId && (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', {
            name: areas.find((x) => x.id === deletingAreaId)?.name ?? '',
          })}
          lead={t('manage.areas.deleteWarning')}
          consequences={deleteImpact}
          irreversible
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={isDeleting}
          blocked={deleteBlocked}
          error={deleteError || null}
          onConfirm={() => void handleDeleteArea(deletingAreaId)}
          onCancel={closeDeleteDialog}
          returnFocusRef={sectionHeadingRef}
          testIdPrefix="area-delete"
        />
      )}
    </>
  );
}

// Interim until #2218 serves the 'areas' route; delete this card then.
export function AreasInterimCard({ onSettled }: { onSettled?: () => void }) {
  const { t } = useTranslation('settings');
  return (
    <section
      id="areas"
      aria-labelledby="areas-heading"
      className={styles.interim}
      data-testid="project-setup-areas"
    >
      <h2 id="areas-heading" tabIndex={-1} className={styles.sectionTitle}>
        {t('projectSetup.areas.title')}
      </h2>
      <AreasCardContent onSettled={onSettled} />
    </section>
  );
}
