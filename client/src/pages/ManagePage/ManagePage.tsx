import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  BudgetCategory,
  HouseholdItemCategoryEntity,
  CreateBudgetCategoryRequest,
  UpdateBudgetCategoryRequest,
  CreateHouseholdItemCategoryRequest,
  UpdateHouseholdItemCategoryRequest,
  AreaResponse,
  TradeResponse,
  CreateAreaRequest,
  UpdateAreaRequest,
  CreateTradeRequest,
  UpdateTradeRequest,
} from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { generateRandomColor } from '../../lib/colorUtils.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav, type SubNavTab } from '../../components/SubNav/SubNav.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { AreaPicker } from '../../components/AreaPicker/AreaPicker.js';
import { buildTree } from '../../lib/areaTreeUtils.js';
import { useAreas } from '../../hooks/useAreas.js';
import { useTrades } from '../../hooks/useTrades.js';
import { useAuth } from '../../contexts/AuthContext.js';
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
import styles from './ManagePage.module.css';

const DEFAULT_COLOR = '#3b82f6';

type Tab = 'areas' | 'trades' | 'budget-categories' | 'hi-categories';

// ============================================================
// AREAS TAB
// ============================================================

type EditingArea = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  description: string | null;
  sortOrder: number;
};

function AreasTab() {
  const { t } = useTranslation('settings');
  const {
    areas,
    isLoading,
    error: loadError,
    createArea,
    updateArea,
    deleteArea,
    refetch,
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

  const handleCreateArea = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setSuccessMessage('');

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
        setCreateError(err.error.message);
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
        setUpdateError(err.error.message);
      } else {
        setUpdateError(t('manage.areas.messages.updateError'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteArea = async (areaId: string) => {
    setIsDeleting(true);
    setSuccessMessage('');

    try {
      const deletedArea = areas.find((a) => a.id === areaId);
      await deleteArea(areaId);
      setDeletingAreaId(null);
      setSuccessMessage(t('manage.areas.messages.deleted', { name: deletedArea?.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setSuccessMessage(t('manage.areas.messages.deleteConflict'));
        } else {
          setSuccessMessage(err.error.message);
        }
      } else {
        setSuccessMessage(t('manage.areas.messages.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <Skeleton lines={5} />;
  }

  if (loadError && areas.length === 0) {
    return <EmptyState icon="⚠️" message={loadError} />;
  }

  return (
    <>
      {successMessage && (
        <div className={styles.successBanner} role="alert">
          {successMessage}
        </div>
      )}

      {/* Create new area */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('manage.areas.createTitle')}</h2>
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
        <h2 className={styles.cardTitle}>
          {t('manage.areas.existingTitle', { count: areas.length })}
        </h2>

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
                        onClick={() => setDeletingAreaId(area.id)}
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

      {/* Delete confirmation modal */}
      {deletingAreaId && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setDeletingAreaId(null)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('manage.areas.deleteTitle')}</h2>
            <p className={styles.modalText}>
              {t('manage.areas.deleteConfirm', {
                name: areas.find((a) => a.id === deletingAreaId)?.name,
              })}
            </p>
            <p className={styles.modalWarning}>{t('manage.areas.deleteWarning')}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingAreaId(null)}
                disabled={isDeleting}
              >
                {t('manage.areas.cancel')}
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={() => void handleDeleteArea(deletingAreaId)}
                disabled={isDeleting}
              >
                {isDeleting ? t('manage.areas.deleting') : t('manage.areas.deleteButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// TRADES TAB
// ============================================================

type EditingTrade = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  sortOrder: number;
};

function TradesTab() {
  const { t } = useTranslation('settings');
  const {
    trades,
    isLoading,
    error: loadError,
    createTrade,
    updateTrade,
    deleteTrade,
    refetch,
  } = useTrades();

  // Create form state
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(generateRandomColor);
  const [newDescription, setNewDescription] = useState('');
  const [newSortOrder, setNewSortOrder] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Edit state
  const [editingTrade, setEditingTrade] = useState<EditingTrade | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');

  // Delete confirmation state
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreateTrade = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setSuccessMessage('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError(t('manage.trades.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setCreateError(t('manage.trades.validation.nameTooLong'));
      return;
    }

    setIsCreating(true);

    try {
      await createTrade({
        name: trimmedName,
        color: newColor,
        description: newDescription.trim() || null,
        sortOrder: newSortOrder ? parseInt(newSortOrder, 10) : undefined,
      } as CreateTradeRequest);
      setNewName('');
      setNewColor(generateRandomColor());
      setNewDescription('');
      setNewSortOrder('');
      setSuccessMessage(t('manage.trades.messages.created', { name: trimmedName }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('manage.trades.messages.createError'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (trade: TradeResponse) => {
    setEditingTrade({
      id: trade.id,
      name: trade.name,
      color: trade.color,
      description: trade.description,
      sortOrder: trade.sortOrder,
    });
    setUpdateError('');
    setSuccessMessage('');
  };

  const cancelEdit = () => {
    setEditingTrade(null);
    setUpdateError('');
  };

  const handleUpdateTrade = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingTrade) return;

    setUpdateError('');
    setSuccessMessage('');

    const trimmedName = editingTrade.name.trim();
    if (!trimmedName) {
      setUpdateError(t('manage.trades.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setUpdateError(t('manage.trades.validation.nameTooLong'));
      return;
    }

    setIsUpdating(true);

    try {
      await updateTrade(editingTrade.id, {
        name: trimmedName,
        color: editingTrade.color,
        description: editingTrade.description,
        sortOrder: editingTrade.sortOrder,
      } as UpdateTradeRequest);
      setEditingTrade(null);
      setSuccessMessage(t('manage.trades.messages.updated', { name: trimmedName }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError(t('manage.trades.messages.updateError'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTrade = async (tradeId: string) => {
    setIsDeleting(true);
    setSuccessMessage('');

    try {
      const deletedTrade = trades.find((t) => t.id === tradeId);
      await deleteTrade(tradeId);
      setDeletingTradeId(null);
      setSuccessMessage(t('manage.trades.messages.deleted', { name: deletedTrade?.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setSuccessMessage(t('manage.trades.messages.deleteConflict'));
        } else {
          setSuccessMessage(err.error.message);
        }
      } else {
        setSuccessMessage(t('manage.trades.messages.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <Skeleton lines={5} />;
  }

  if (loadError && trades.length === 0) {
    return <EmptyState icon="⚠️" message={loadError} />;
  }

  return (
    <>
      {successMessage && (
        <div className={styles.successBanner} role="alert">
          {successMessage}
        </div>
      )}

      {/* Create new trade */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('manage.trades.createTitle')}</h2>
        <p className={styles.cardDescription}>{t('manage.trades.createDescription')}</p>

        {createError && (
          <div className={styles.errorBanner} role="alert">
            {createError}
          </div>
        )}

        <form onSubmit={handleCreateTrade} className={styles.form}>
          <div className={styles.formRow}>
            <div className={styles.fieldGrow}>
              <label htmlFor="tradeName" className={styles.label}>
                {t('manage.trades.nameLabel')}
              </label>
              <input
                type="text"
                id="tradeName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={styles.input}
                placeholder={t('manage.trades.namePlaceholder')}
                maxLength={100}
                disabled={isCreating}
              />
            </div>

            <div className={styles.fieldFixed}>
              <label htmlFor="tradeColor" className={styles.label}>
                {t('manage.trades.colorLabel')}
              </label>
              <div className={styles.colorWrapper}>
                <input
                  type="color"
                  id="tradeColor"
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
              <label htmlFor="tradeSortOrder" className={styles.label}>
                {t('manage.trades.sortOrderLabel')}
              </label>
              <input
                type="number"
                id="tradeSortOrder"
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
            <label htmlFor="tradeDescription" className={styles.label}>
              {t('manage.trades.descriptionLabel')}
            </label>
            <input
              type="text"
              id="tradeDescription"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className={styles.input}
              placeholder={t('manage.trades.descriptionPlaceholder')}
              maxLength={500}
              disabled={isCreating}
            />
          </div>

          <button type="submit" className={styles.button} disabled={isCreating || !newName.trim()}>
            {isCreating ? t('manage.trades.creating') : t('manage.trades.createButton')}
          </button>
        </form>
      </section>

      {/* Trades list */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {t('manage.trades.existingTitle', { count: trades.length })}
        </h2>

        {trades.length === 0 ? (
          <EmptyState icon="🔧" message={t('manage.trades.emptyState')} />
        ) : (
          <div className={styles.itemsList}>
            {trades.map((trade) => (
              <div key={trade.id} className={styles.itemRow}>
                {editingTrade?.id === trade.id ? (
                  <form
                    onSubmit={handleUpdateTrade}
                    className={styles.editForm}
                    aria-label={`Edit ${getCategoryDisplayName(t, trade.name, trade.translationKey)}`}
                  >
                    {updateError && (
                      <div className={styles.errorBanner} role="alert">
                        {updateError}
                      </div>
                    )}
                    <div className={styles.editFormRow}>
                      <div className={styles.fieldGrow}>
                        <label htmlFor={`edit-name-${trade.id}`} className={styles.label}>
                          {t('manage.trades.nameLabel')}
                        </label>
                        <input
                          type="text"
                          id={`edit-name-${trade.id}`}
                          value={editingTrade.name}
                          onChange={(e) =>
                            setEditingTrade({ ...editingTrade, name: e.target.value })
                          }
                          className={styles.input}
                          maxLength={100}
                          disabled={isUpdating}
                        />
                      </div>

                      <div className={styles.fieldFixed}>
                        <label htmlFor={`edit-color-${trade.id}`} className={styles.label}>
                          {t('manage.trades.colorLabel')}
                        </label>
                        <div className={styles.colorWrapper}>
                          <input
                            type="color"
                            id={`edit-color-${trade.id}`}
                            value={editingTrade.color || '#3b82f6'}
                            onChange={(e) =>
                              setEditingTrade({ ...editingTrade, color: e.target.value })
                            }
                            className={styles.colorInput}
                            disabled={isUpdating}
                          />
                          <span
                            className={styles.colorSwatch}
                            style={{ backgroundColor: editingTrade.color || '#3b82f6' }}
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      <div className={styles.fieldNarrow}>
                        <label htmlFor={`edit-sortorder-${trade.id}`} className={styles.label}>
                          {t('manage.trades.sortOrderLabel')}
                        </label>
                        <input
                          type="number"
                          id={`edit-sortorder-${trade.id}`}
                          value={editingTrade.sortOrder}
                          onChange={(e) =>
                            setEditingTrade({
                              ...editingTrade,
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
                      <label htmlFor={`edit-description-${trade.id}`} className={styles.label}>
                        {t('manage.trades.descriptionLabel')}
                      </label>
                      <input
                        type="text"
                        id={`edit-description-${trade.id}`}
                        value={editingTrade.description || ''}
                        onChange={(e) =>
                          setEditingTrade({
                            ...editingTrade,
                            description: e.target.value,
                          })
                        }
                        className={styles.input}
                        placeholder={t('manage.trades.descriptionPlaceholder')}
                        maxLength={500}
                        disabled={isUpdating}
                      />
                    </div>

                    <div className={styles.editActions}>
                      <button
                        type="submit"
                        className={styles.saveButton}
                        disabled={isUpdating || !editingTrade.name.trim()}
                      >
                        {isUpdating ? t('manage.trades.saving') : t('manage.trades.save')}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={cancelEdit}
                        disabled={isUpdating}
                      >
                        {t('manage.trades.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={styles.itemInfo}>
                      <span
                        className={styles.itemSwatch}
                        style={{ backgroundColor: trade.color ?? DEFAULT_COLOR }}
                        aria-hidden="true"
                      />
                      <div className={styles.itemDetails}>
                        <span className={styles.itemName}>
                          {getCategoryDisplayName(t, trade.name, trade.translationKey)}
                        </span>
                        {trade.description && (
                          <span className={styles.itemDescription}>{trade.description}</span>
                        )}
                      </div>
                      <span
                        className={styles.itemSortOrder}
                        title={t('manage.trades.sortOrderLabel')}
                      >
                        #{trade.sortOrder}
                      </span>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(trade)}
                        disabled={!!editingTrade}
                      >
                        {t('manage.trades.edit')}
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => setDeletingTradeId(trade.id)}
                        disabled={!!editingTrade}
                      >
                        {t('manage.trades.delete')}
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
      {deletingTradeId && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setDeletingTradeId(null)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('manage.trades.deleteTitle')}</h2>
            <p className={styles.modalText}>
              {t('manage.trades.deleteConfirm', {
                name: trades.find((t) => t.id === deletingTradeId)?.name,
              })}
            </p>
            <p className={styles.modalWarning}>{t('manage.trades.deleteWarning')}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingTradeId(null)}
                disabled={isDeleting}
              >
                {t('manage.trades.cancel')}
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={() => void handleDeleteTrade(deletingTradeId)}
                disabled={isDeleting}
              >
                {isDeleting ? t('manage.trades.deleting') : t('manage.trades.deleteButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// BUDGET CATEGORIES TAB (existing, kept minimal)
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
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState<string>(generateRandomColor);
  const [newSortOrder, setNewSortOrder] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');
  const [editingCategory, setEditingCategory] = useState<EditingBudgetCategory | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');
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
        setError(t('manage.budgetCategories.loadError'));
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
      setNewColor(generateRandomColor());
      setNewSortOrder('');
      setSuccessMessage(t('manage.budgetCategories.messages.created', { name: created.name }));
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
      setSuccessMessage(t('manage.budgetCategories.messages.updated', { name: updated.name }));
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
      setSuccessMessage(t('manage.budgetCategories.messages.deleted', { name: deleted?.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(t('manage.budgetCategories.messages.deleteConflict'));
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
    return <Skeleton lines={5} />;
  }

  if (error && categories.length === 0) {
    return <EmptyState icon="⚠️" message={error} />;
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
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('manage.budgetCategories.createTitle')}</h2>
        <p className={styles.cardDescription}>{t('manage.budgetCategories.createDescription')}</p>

        {createError && (
          <div className={styles.errorBanner} role="alert">
            {createError}
          </div>
        )}

        <form onSubmit={handleCreateCategory} className={styles.form}>
          <div className={styles.formRow}>
            <div className={styles.fieldGrow}>
              <label htmlFor="categoryName" className={styles.label}>
                {t('manage.budgetCategories.nameLabel')} <span className={styles.required}>*</span>
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
                ? t('manage.budgetCategories.creating')
                : t('manage.budgetCategories.createButton')}
            </button>
          </div>
        </form>
      </section>

      {/* Categories list */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {t('manage.budgetCategories.listTitle', { count: categories.length })}
        </h2>

        {categories.length === 0 ? (
          <EmptyState icon="💰" message={t('manage.budgetCategories.emptyState')} />
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
                          ? t('manage.budgetCategories.saving')
                          : t('manage.budgetCategories.save')}
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
                        <span className={styles.itemName}>
                          {getCategoryDisplayName(t, category.name, category.translationKey)}
                        </span>
                        {category.description && (
                          <span className={styles.itemDescription}>{category.description}</span>
                        )}
                      </div>
                      <span
                        className={styles.itemSortOrder}
                        title={t('manage.budgetCategories.sortOrderTitle')}
                      >
                        #{category.sortOrder}
                      </span>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(category)}
                        disabled={!!editingCategory}
                        aria-label={`Edit ${getCategoryDisplayName(t, category.name, category.translationKey)}`}
                      >
                        {t('manage.budgetCategories.edit')}
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => openDeleteConfirm(category.id)}
                        disabled={!!editingCategory}
                        aria-label={`Delete ${getCategoryDisplayName(t, category.name, category.translationKey)}`}
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
              {t('manage.budgetCategories.deleteTitle')}
            </h2>
            <p className={styles.modalText}>
              {t('manage.budgetCategories.deleteConfirm', {
                name: categories.find((c) => c.id === deletingCategoryId)?.name,
              })}
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>{t('manage.budgetCategories.deleteWarning')}</p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('manage.budgetCategories.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDeleteCategory(deletingCategoryId)}
                  disabled={isDeleting}
                >
                  {isDeleting
                    ? t('manage.budgetCategories.deleting')
                    : t('manage.budgetCategories.deleteButton')}
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
// HOUSEHOLD ITEM CATEGORIES TAB (existing, minimal)
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
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(generateRandomColor);
  const [newSortOrder, setNewSortOrder] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');
  const [editingCategory, setEditingCategory] = useState<EditingHICategory | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');
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
        setError(t('manage.householdItemCategories.loadError'));
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
      setCreateError(t('manage.householdItemCategories.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setCreateError(t('manage.householdItemCategories.validation.nameTooLong'));
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
      setNewColor(generateRandomColor());
      setNewSortOrder('');
      setSuccessMessage(
        t('manage.householdItemCategories.messages.created', { name: created.name }),
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('manage.householdItemCategories.messages.createError'));
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
      setUpdateError(t('manage.householdItemCategories.validation.nameRequired'));
      return;
    }

    if (trimmedName.length > 100) {
      setUpdateError(t('manage.householdItemCategories.validation.nameTooLong'));
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
      setSuccessMessage(
        t('manage.householdItemCategories.messages.updated', { name: updated.name }),
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError(t('manage.householdItemCategories.messages.updateError'));
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
      setSuccessMessage(
        t('manage.householdItemCategories.messages.deleted', { name: deleted?.name }),
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(t('manage.householdItemCategories.messages.deleteConflict'));
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError(t('manage.householdItemCategories.messages.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <Skeleton lines={5} />;
  }

  if (error && categories.length === 0) {
    return <EmptyState icon="⚠️" message={error} />;
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
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('manage.householdItemCategories.createTitle')}</h2>
        <p className={styles.cardDescription}>
          {t('manage.householdItemCategories.createDescription')}
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
                {t('manage.householdItemCategories.nameLabel')}{' '}
                <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="categoryName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={styles.input}
                placeholder={t('manage.householdItemCategories.namePlaceholder')}
                maxLength={100}
                disabled={isCreating}
                autoFocus
              />
            </div>

            <div className={styles.fieldFixed}>
              <label htmlFor="categoryColor" className={styles.label}>
                {t('manage.householdItemCategories.colorLabel')}
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
                {t('manage.householdItemCategories.sortOrderLabel')}
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
                ? t('manage.householdItemCategories.creating')
                : t('manage.householdItemCategories.createButton')}
            </button>
          </div>
        </form>
      </section>

      {/* Categories list */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {t('manage.householdItemCategories.listTitle', { count: categories.length })}
        </h2>

        {categories.length === 0 ? (
          <EmptyState icon="🛋️" message={t('manage.householdItemCategories.emptyState')} />
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
                          {t('manage.householdItemCategories.nameLabel')}{' '}
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
                          {t('manage.householdItemCategories.colorLabel')}
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
                          {t('manage.householdItemCategories.sortOrderLabel')}
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
                          ? t('manage.householdItemCategories.saving')
                          : t('manage.householdItemCategories.save')}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={cancelEdit}
                        disabled={isUpdating}
                      >
                        {t('manage.householdItemCategories.cancel')}
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
                        <span className={styles.itemName}>
                          {getCategoryDisplayName(t, category.name, category.translationKey)}
                        </span>
                      </div>
                      <span
                        className={styles.itemSortOrder}
                        title={t('manage.householdItemCategories.sortOrderLabel')}
                      >
                        #{category.sortOrder}
                      </span>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(category)}
                        disabled={!!editingCategory}
                        aria-label={`Edit ${getCategoryDisplayName(t, category.name, category.translationKey)}`}
                      >
                        {t('manage.householdItemCategories.edit')}
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => openDeleteConfirm(category.id)}
                        disabled={!!editingCategory}
                        aria-label={`Delete ${getCategoryDisplayName(t, category.name, category.translationKey)}`}
                      >
                        {t('manage.householdItemCategories.delete')}
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
              {t('manage.householdItemCategories.deleteTitle')}
            </h2>
            <p className={styles.modalText}>
              {t('manage.householdItemCategories.deleteConfirm', {
                name: categories.find((c) => c.id === deletingCategoryId)?.name,
              })}
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>
                {t('manage.householdItemCategories.deleteWarning')}
              </p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('manage.householdItemCategories.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDeleteCategory(deletingCategoryId)}
                  disabled={isDeleting}
                >
                  {isDeleting
                    ? t('manage.householdItemCategories.deleting')
                    : t('manage.householdItemCategories.deleteButton')}
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

export function ManagePage() {
  const { t } = useTranslation('settings');
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'areas');

  const isAdmin = user?.role === 'admin';

  const settingsTabs: SubNavTab[] = [
    { labelKey: 'subnav.settings.profile', to: '/settings/profile', ns: 'common' },
    { labelKey: 'subnav.settings.manage', to: '/settings/manage', ns: 'common' },
    { labelKey: 'subnav.settings.userManagement', to: '/settings/users', ns: 'common', visible: isAdmin },
    { labelKey: 'subnav.settings.backups', to: '/settings/backups', ns: 'common', visible: isAdmin },
  ];

  useEffect(() => {
    setSearchParams({ tab: activeTab });
  }, [activeTab, setSearchParams]);

  return (
    <PageLayout
      maxWidth="narrow"
      title={t('manage.pageTitle')}
      subNav={<SubNav tabs={settingsTabs} ariaLabel="Settings section navigation" />}
    >

        <div className={styles.tabList} role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'areas'}
            className={`${styles.tab} ${activeTab === 'areas' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('areas')}
          >
            {t('manage.tabs.areas')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'trades'}
            className={`${styles.tab} ${activeTab === 'trades' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('trades')}
          >
            {t('manage.tabs.trades')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'budget-categories'}
            className={`${styles.tab} ${activeTab === 'budget-categories' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('budget-categories')}
          >
            {t('manage.tabs.budgetCategories')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'hi-categories'}
            className={`${styles.tab} ${activeTab === 'hi-categories' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('hi-categories')}
          >
            {t('manage.tabs.householdItemCategories')}
          </button>
        </div>

      <div className={styles.tabPanel} role="tabpanel" id={`${activeTab}-panel`}>
        {activeTab === 'areas' && <AreasTab />}
        {activeTab === 'trades' && <TradesTab />}
        {activeTab === 'budget-categories' && <BudgetCategoriesTab />}
        {activeTab === 'hi-categories' && <HouseholdItemCategoriesTab />}
      </div>
    </PageLayout>
  );
}

export default ManagePage;
