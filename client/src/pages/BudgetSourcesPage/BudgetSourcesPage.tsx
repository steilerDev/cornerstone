import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BudgetSource,
  BudgetSourceType,
  BudgetSourceStatus,
  CreateBudgetSourceRequest,
  BudgetSourceBudgetLinesResponse,
} from '@cornerstone/shared';
import {
  fetchBudgetSources,
  createBudgetSource,
  updateBudgetSource,
  deleteBudgetSource,
  fetchBudgetLinesForSource,
} from '../../lib/budgetSourcesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav, type SubNavTab } from '../../components/SubNav/SubNav.js';
import { BudgetBar } from '../../components/BudgetBar/BudgetBar.js';
import type { BudgetBarSegment } from '../../components/BudgetBar/BudgetBar.js';
import { SourceBudgetLinePanel } from '../../components/SourceBudgetLinePanel/SourceBudgetLinePanel.js';
import { MassMoveModal } from '../../components/MassMoveModal/MassMoveModal.js';
import styles from './BudgetSourcesPage.module.css';

const BUDGET_TABS: SubNavTab[] = [
  { labelKey: 'subnav.budget.overview', to: '/budget/overview' },
  { labelKey: 'subnav.budget.invoices', to: '/budget/invoices' },
  { labelKey: 'subnav.budget.vendors', to: '/budget/vendors' },
  { labelKey: 'subnav.budget.sources', to: '/budget/sources' },
  { labelKey: 'subnav.budget.subsidies', to: '/budget/subsidies' },
];

// ---- Display helpers ----

function getSourceTypeClass(styles: Record<string, string>, sourceType: BudgetSourceType): string {
  const map: Record<BudgetSourceType, string> = {
    bank_loan: styles.typeBankLoan ?? '',
    credit_line: styles.typeCreditLine ?? '',
    savings: styles.typeSavings ?? '',
    other: styles.typeOther ?? '',
    discretionary: styles.typeDiscretionary ?? '',
  };
  return map[sourceType] ?? '';
}

function getStatusClass(styles: Record<string, string>, status: BudgetSourceStatus): string {
  const map: Record<BudgetSourceStatus, string> = {
    active: styles.statusActive ?? '',
    exhausted: styles.statusExhausted ?? '',
    closed: styles.statusClosed ?? '',
  };
  return map[status] ?? '';
}

// ---- Editing state shape ----

type EditingSource = {
  id: string;
  name: string;
  sourceType: BudgetSourceType;
  totalAmount: string;
  interestRate: string;
  terms: string;
  notes: string;
  status: BudgetSourceStatus;
};

function sourceToEditState(source: BudgetSource): EditingSource {
  return {
    id: source.id,
    name: source.name,
    sourceType: source.sourceType,
    totalAmount: String(source.totalAmount),
    interestRate: source.interestRate != null ? String(source.interestRate) : '',
    terms: source.terms ?? '',
    notes: source.notes ?? '',
    status: source.status,
  };
}

// ---- SourceBarChart sub-component ----

interface SourceBarChartProps {
  source: BudgetSource;
  formatCurrency: (value: number) => string;
  formatPercent: (value: number) => string;
}

function SourceBarChart({ source, formatCurrency, formatPercent }: SourceBarChartProps) {
  const { t } = useTranslation('budget');
  const [hoveredSegment, setHoveredSegment] = useState<BudgetBarSegment | null>(null);
  const handleSegmentHover = useCallback((seg: BudgetBarSegment | null) => {
    setHoveredSegment(seg);
  }, []);

  const handleSegmentClick = useCallback((seg: BudgetBarSegment | null) => {
    setHoveredSegment((prev) => (prev?.key === seg?.key ? null : seg));
  }, []);

  const claimedVal = source.claimedAmount;
  const paidVal = Math.max(0, source.paidAmount - source.claimedAmount);
  const projectedVal = Math.max(0, source.projectedAmount - source.paidAmount);
  const allocatedVal = Math.max(
    0,
    source.usedAmount - Math.max(source.projectedAmount, source.paidAmount),
  );

  const maxValue = Math.max(source.totalAmount, source.projectedAmount, 1);
  const overflow = Math.max(0, source.projectedAmount - source.totalAmount);

  const segments: BudgetBarSegment[] = [
    {
      key: 'claimed',
      value: claimedVal,
      color: 'var(--color-budget-claimed)',
      label: t('sources.barChart.claimed'),
      totalValue: source.claimedAmount,
    },
    {
      key: 'paid',
      value: paidVal,
      color: 'var(--color-budget-paid)',
      label: t('sources.barChart.paidUnclaimed'),
      totalValue: source.paidAmount,
    },
    {
      key: 'projected',
      value: projectedVal,
      color: 'var(--color-budget-projected)',
      label: t('sources.barChart.projected'),
      totalValue: source.projectedAmount,
    },
    {
      key: 'allocated',
      value: allocatedVal,
      color: 'var(--color-budget-allocated)',
      label: t('sources.barChart.allocated'),
      totalValue: source.usedAmount,
    },
  ];

  const legendRows = segments.filter((s) => (s.totalValue ?? s.value) > 0);

  return (
    <div className={styles.sourceBarSection}>
      <div className={styles.barWrapper}>
        <BudgetBar
          segments={segments}
          maxValue={maxValue}
          overflow={overflow}
          height="sm"
          onSegmentHover={handleSegmentHover}
          onSegmentClick={handleSegmentClick}
          formatValue={formatCurrency}
        />
        {hoveredSegment && (
          <div className={styles.barTooltipAnchor} role="status" aria-atomic="true">
            <div className={styles.segmentTooltip}>
              <span className={styles.segmentTooltipLabel}>{hoveredSegment.label}</span>
              <span className={styles.segmentTooltipValue}>
                {formatCurrency(hoveredSegment.totalValue ?? hoveredSegment.value)}
              </span>
              <span className={styles.segmentTooltipPct}>
                {source.totalAmount > 0
                  ? `${(((hoveredSegment.totalValue ?? hoveredSegment.value) / source.totalAmount) * 100).toFixed(1)}% ${t('sources.barChart.ofTotal')}`
                  : `0.0% ${t('sources.barChart.ofTotal')}`}
              </span>
              <span className={styles.segmentTooltipPct}>
                {t('sources.barChart.remaining')}{' '}
                {formatCurrency(
                  source.totalAmount - (hoveredSegment.totalValue ?? hoveredSegment.value),
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {(legendRows.length > 0 || overflow > 0) && (
        <div className={styles.barLegend}>
          {legendRows.map((seg) => (
            <div key={seg.key} className={styles.barLegendRow}>
              <span
                className={styles.barLegendDot}
                style={{ backgroundColor: seg.color }}
                aria-hidden="true"
              />
              <span className={styles.barLegendLabel}>{seg.label}</span>
              <span className={styles.barLegendValue}>
                {formatCurrency(seg.totalValue ?? seg.value)}
              </span>
            </div>
          ))}
          {overflow > 0 && (
            <div className={styles.barLegendRow}>
              <span
                className={styles.barLegendDot}
                style={{ backgroundColor: 'var(--color-budget-overflow)' }}
                aria-hidden="true"
              />
              <span className={styles.barLegendLabel}>{t('sources.barChart.overflow')}</span>
              <span className={styles.barLegendValue}>{formatCurrency(overflow)}</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.sourceSummaryRow}>
        <span className={styles.summaryItem}>
          {t('sources.barChart.total')} <strong>{formatCurrency(source.totalAmount)}</strong>
        </span>
        <span className={styles.summaryDivider} aria-hidden="true">
          |
        </span>
        <span
          className={`${styles.summaryItem} ${source.actualAvailableAmount < 0 ? styles.amountNegative : ''}`}
        >
          {t('sources.barChart.available')}{' '}
          <strong>{formatCurrency(source.actualAvailableAmount)}</strong>
        </span>
        <span className={styles.summaryDivider} aria-hidden="true">
          |
        </span>
        <span className={styles.summaryItem}>
          {t('sources.barChart.planned')} <strong>{formatCurrency(source.usedAmount)}</strong>
        </span>
        {source.interestRate != null && (
          <>
            <span className={styles.summaryDivider} aria-hidden="true">
              |
            </span>
            <span className={styles.summaryItem}>
              {t('sources.barChart.rate')} <strong>{formatPercent(source.interestRate)}</strong>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Component ----

export function BudgetSourcesPage() {
  const { t } = useTranslation('budget');
  const { formatCurrency, formatPercent } = useFormatters();
  const { showToast } = useToast();
  const [sources, setSources] = useState<BudgetSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSourceType, setNewSourceType] = useState<BudgetSourceType>('bank_loan');
  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newInterestRate, setNewInterestRate] = useState('');
  const [newTerms, setNewTerms] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStatus, setNewStatus] = useState<BudgetSourceStatus>('active');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Edit state
  const [editingSource, setEditingSource] = useState<EditingSource | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');

  // Delete confirmation state
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  // Budget lines expansion state
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [linesCache, setLinesCache] = useState<Map<string, BudgetSourceBudgetLinesResponse>>(
    new Map(),
  );
  const [linesLoading, setLinesLoading] = useState<Set<string>>(new Set());
  const [linesError, setLinesError] = useState<Map<string, string>>(new Map());

  // Selection state for mass-move
  const [sourceSelections, setSourceSelections] = useState<Map<string, Set<string>>>(new Map());
  const [moveModalSourceId, setMoveModalSourceId] = useState<string | null>(null);

  // Translation-dependent label maps
  const SOURCE_TYPE_LABELS: Record<BudgetSourceType, string> = {
    bank_loan: t('sources.sourceTypes.bank_loan'),
    credit_line: t('sources.sourceTypes.credit_line'),
    savings: t('sources.sourceTypes.savings'),
    other: t('sources.sourceTypes.other'),
    discretionary: t('sources.sourceTypes.discretionary'),
  };

  const STATUS_LABELS: Record<BudgetSourceStatus, string> = {
    active: t('sources.sourceStatus.active'),
    exhausted: t('sources.sourceStatus.exhausted'),
    closed: t('sources.sourceStatus.closed'),
  };

  useEffect(() => {
    void loadSources();
  }, []);

  const loadSources = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchBudgetSources();
      setSources(response.budgetSources);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('sources.errorMessage'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewSourceType('bank_loan');
    setNewTotalAmount('');
    setNewInterestRate('');
    setNewTerms('');
    setNewNotes('');
    setNewStatus('active');
    setCreateError('');
  };

  const handleCreateSource = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setSuccessMessage('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError(t('sources.validation.nameRequired'));
      return;
    }

    const totalAmountValue = parseFloat(newTotalAmount);
    if (isNaN(totalAmountValue) || totalAmountValue < 0) {
      setCreateError(t('sources.validation.amountRequired'));
      return;
    }

    const interestRateValue =
      newInterestRate.trim() !== '' ? parseFloat(newInterestRate) : undefined;
    if (interestRateValue !== undefined && (isNaN(interestRateValue) || interestRateValue < 0)) {
      setCreateError(t('sources.validation.interestRateInvalid'));
      return;
    }

    const payload: CreateBudgetSourceRequest = {
      name: trimmedName,
      sourceType: newSourceType,
      totalAmount: totalAmountValue,
      interestRate: interestRateValue ?? null,
      terms: newTerms.trim() || null,
      notes: newNotes.trim() || null,
      status: newStatus,
    };

    setIsCreating(true);

    try {
      const created = await createBudgetSource(payload);
      setSources([...sources, created]);
      resetCreateForm();
      setShowCreateForm(false);
      setSuccessMessage(t('sources.messages.created', { name: created.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('sources.messages.createError'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (source: BudgetSource) => {
    setEditingSource(sourceToEditState(source));
    setUpdateError('');
    setSuccessMessage('');
  };

  const cancelEdit = () => {
    setEditingSource(null);
    setUpdateError('');
  };

  const handleUpdateSource = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSource) return;

    setUpdateError('');
    setSuccessMessage('');

    const trimmedName = editingSource.name.trim();
    if (!trimmedName) {
      setUpdateError(t('sources.validation.nameRequired'));
      return;
    }

    const totalAmountValue = parseFloat(editingSource.totalAmount);
    if (isNaN(totalAmountValue) || totalAmountValue < 0) {
      setUpdateError(t('sources.validation.amountRequired'));
      return;
    }

    const interestRateValue =
      editingSource.interestRate.trim() !== '' ? parseFloat(editingSource.interestRate) : null;
    if (interestRateValue !== null && (isNaN(interestRateValue) || interestRateValue < 0)) {
      setUpdateError(t('sources.validation.interestRateInvalid'));
      return;
    }

    setIsUpdating(true);

    try {
      const updated = await updateBudgetSource(editingSource.id, {
        name: trimmedName,
        // Omit sourceType for discretionary sources — the server PATCH enum
        // does not include 'discretionary' (system-only type).
        ...(editingSource.sourceType !== 'discretionary' && {
          sourceType: editingSource.sourceType,
        }),
        totalAmount: totalAmountValue,
        interestRate: interestRateValue,
        terms: editingSource.terms.trim() || null,
        notes: editingSource.notes.trim() || null,
        status: editingSource.status,
      });
      setSources(sources.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSource(null);
      setSuccessMessage(t('sources.messages.updated', { name: updated.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError(t('sources.messages.updateError'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteConfirm = (sourceId: string) => {
    setDeletingSourceId(sourceId);
    setDeleteError('');
    setSuccessMessage('');
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setDeletingSourceId(null);
      setDeleteError('');
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteBudgetSource(sourceId);
      const deleted = sources.find((s) => s.id === sourceId);
      setSources(sources.filter((s) => s.id !== sourceId));
      setDeletingSourceId(null);
      setSuccessMessage(t('sources.messages.deleted', { name: deleted?.name }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(t('sources.deleteModal.conflictError'));
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError(t('sources.messages.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleLines = async (sourceId: string) => {
    const isCurrentlyExpanded = expandedSources.has(sourceId);

    if (isCurrentlyExpanded) {
      // Collapse: just remove from expanded set
      const newExpanded = new Set(expandedSources);
      newExpanded.delete(sourceId);
      setExpandedSources(newExpanded);
    } else {
      // Expand: fetch if not cached
      const isAlreadyCached = linesCache.has(sourceId);

      if (!isAlreadyCached) {
        setLinesLoading((prev) => new Set(prev).add(sourceId));
        setLinesError((prev) => {
          const newErr = new Map(prev);
          newErr.delete(sourceId);
          return newErr;
        });

        try {
          const data = await fetchBudgetLinesForSource(sourceId);
          setLinesCache((prev) => new Map(prev).set(sourceId, data));
        } catch (err) {
          let errorMsg = t('sources.lines.fetchError');
          if (err instanceof ApiClientError) {
            errorMsg = err.error.message;
          }
          setLinesError((prev) => new Map(prev).set(sourceId, errorMsg));
        } finally {
          setLinesLoading((prev) => {
            const newLoading = new Set(prev);
            newLoading.delete(sourceId);
            return newLoading;
          });
        }
      }

      // Add to expanded set
      const newExpanded = new Set(expandedSources);
      newExpanded.add(sourceId);
      setExpandedSources(newExpanded);
    }
  };

  const handleRetryLines = async (sourceId: string) => {
    setLinesLoading((prev) => new Set(prev).add(sourceId));
    setLinesError((prev) => {
      const newErr = new Map(prev);
      newErr.delete(sourceId);
      return newErr;
    });

    try {
      const data = await fetchBudgetLinesForSource(sourceId);
      setLinesCache((prev) => new Map(prev).set(sourceId, data));
    } catch (err) {
      let errorMsg = t('sources.lines.fetchError');
      if (err instanceof ApiClientError) {
        errorMsg = err.error.message;
      }
      setLinesError((prev) => new Map(prev).set(sourceId, errorMsg));
    } finally {
      setLinesLoading((prev) => {
        const newLoading = new Set(prev);
        newLoading.delete(sourceId);
        return newLoading;
      });
    }
  };

  const handleSelectionChange = useCallback((sourceId: string, newSet: Set<string>) => {
    setSourceSelections((prev) => {
      const next = new Map(prev);
      if (newSet.size === 0) next.delete(sourceId);
      else next.set(sourceId, newSet);
      return next;
    });
  }, []);

  const handleOpenMoveModal = useCallback((sourceId: string) => {
    setMoveModalSourceId(sourceId);
  }, []);

  const activeMoveSource = moveModalSourceId ? sources.find((s) => s.id === moveModalSourceId) : null;
  const activeMoveSelection = moveModalSourceId ? (sourceSelections.get(moveModalSourceId) ?? new Set<string>()) : new Set<string>();
  const activeLinesData = moveModalSourceId ? (linesCache.get(moveModalSourceId) ?? null) : null;

  const { workItemBudgetIds, householdItemBudgetIds, claimedCount } = useMemo(() => {
    if (!activeLinesData || activeMoveSelection.size === 0) {
      return { workItemBudgetIds: [], householdItemBudgetIds: [], claimedCount: 0 };
    }
    const wiIds: string[] = [];
    const hiIds: string[] = [];
    let claimed = 0;

    for (const line of activeLinesData.workItemLines) {
      if (activeMoveSelection.has(line.id)) {
        wiIds.push(line.id);
        if (line.hasClaimedInvoice) claimed++;
      }
    }

    for (const line of activeLinesData.householdItemLines) {
      if (activeMoveSelection.has(line.id)) {
        hiIds.push(line.id);
        if (line.hasClaimedInvoice) claimed++;
      }
    }

    return { workItemBudgetIds: wiIds, householdItemBudgetIds: hiIds, claimedCount: claimed };
  }, [activeLinesData, activeMoveSelection]);

  const handleMoveSuccess = useCallback((movedCount: number, targetName: string) => {
    const srcId = moveModalSourceId;
    setMoveModalSourceId(null);
    setSourceSelections((prev) => {
      const next = new Map(prev);
      next.delete(srcId!);
      return next;
    });
    showToast('success', t('sources.budgetLines.move.successToast', { count: movedCount, targetName }));
    // Invalidate lines cache so re-expand re-fetches
    setLinesCache((prev) => {
      const next = new Map(prev);
      next.delete(srcId!);
      return next;
    });
    void loadSources();
  }, [moveModalSourceId, showToast, t]);

  // Clear selection when source is collapsed
  const handleToggleLinesWithClearing = useCallback((sourceId: string) => {
    const isCurrentlyExpanded = expandedSources.has(sourceId);
    if (isCurrentlyExpanded) {
      // Clear selection when collapsing
      setSourceSelections((prev) => {
        const next = new Map(prev);
        next.delete(sourceId);
        return next;
      });
    }
    void handleToggleLines(sourceId);
  }, [expandedSources, handleToggleLines]);

  if (isLoading) {
    return (
      <PageLayout
        title={t('sources.title')}
        subNav={<SubNav tabs={BUDGET_TABS} ariaLabel="Budget section navigation" />}
      >
        <div className={styles.loading}>{t('sources.loading')}</div>
      </PageLayout>
    );
  }

  if (error && sources.length === 0) {
    return (
      <PageLayout
        title={t('sources.title')}
        subNav={<SubNav tabs={BUDGET_TABS} ariaLabel="Budget section navigation" />}
      >
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('sources.error')}</h2>
          <p>{error}</p>
          <button type="button" className={styles.button} onClick={() => void loadSources()}>
            {t('sources.retry')}
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={t('sources.title')}
      action={
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            setShowCreateForm(true);
            setCreateError('');
          }}
          disabled={showCreateForm}
        >
          {t('sources.addSource')}
        </button>
      }
      subNav={<SubNav tabs={BUDGET_TABS} ariaLabel="Budget section navigation" />}
    >
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
          <h2 className={styles.cardTitle}>{t('sources.newBudgetSource')}</h2>
          <p className={styles.cardDescription}>{t('sources.newBudgetSourceDescription')}</p>

          {createError && (
            <div className={styles.errorBanner} role="alert">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateSource} className={styles.form}>
            <div className={styles.formRow}>
              <div className={styles.fieldGrow}>
                <label htmlFor="sourceName" className={styles.label}>
                  {t('sources.form.name')}{' '}
                  <span className={styles.required}>{t('sources.form.required')}</span>
                </label>
                <input
                  type="text"
                  id="sourceName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={styles.input}
                  placeholder={t('sources.form.placeholders.name')}
                  maxLength={200}
                  disabled={isCreating}
                  autoFocus
                />
              </div>

              <div className={styles.fieldSelect}>
                <label htmlFor="sourceType" className={styles.label}>
                  {t('sources.form.type')}{' '}
                  <span className={styles.required}>{t('sources.form.required')}</span>
                </label>
                <select
                  id="sourceType"
                  value={newSourceType}
                  onChange={(e) => setNewSourceType(e.target.value as BudgetSourceType)}
                  className={styles.select}
                  disabled={isCreating}
                >
                  {Object.entries(SOURCE_TYPE_LABELS)
                    .filter(([value]) => value !== 'discretionary')
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
              </div>

              <div className={styles.fieldSelect}>
                <label htmlFor="sourceStatus" className={styles.label}>
                  {t('sources.form.status')}
                </label>
                <select
                  id="sourceStatus"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as BudgetSourceStatus)}
                  className={styles.select}
                  disabled={isCreating}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.fieldGrow}>
                <label htmlFor="sourceTotalAmount" className={styles.label}>
                  {t('sources.form.totalAmount')}{' '}
                  <span className={styles.required}>{t('sources.form.required')}</span>
                </label>
                <input
                  type="number"
                  id="sourceTotalAmount"
                  value={newTotalAmount}
                  onChange={(e) => setNewTotalAmount(e.target.value)}
                  className={styles.input}
                  placeholder="0.00"
                  min={0}
                  step="0.01"
                  disabled={isCreating}
                />
              </div>

              <div className={styles.fieldNarrow}>
                <label htmlFor="sourceInterestRate" className={styles.label}>
                  {t('sources.form.interestRate')}
                </label>
                <input
                  type="number"
                  id="sourceInterestRate"
                  value={newInterestRate}
                  onChange={(e) => setNewInterestRate(e.target.value)}
                  className={styles.input}
                  placeholder={t('sources.form.placeholders.interestRate')}
                  min={0}
                  step="0.01"
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="sourceTerms" className={styles.label}>
                {t('sources.form.terms')}
              </label>
              <input
                type="text"
                id="sourceTerms"
                value={newTerms}
                onChange={(e) => setNewTerms(e.target.value)}
                className={styles.input}
                placeholder={t('sources.form.placeholders.terms')}
                maxLength={500}
                disabled={isCreating}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="sourceNotes" className={styles.label}>
                {t('sources.form.notes')}
              </label>
              <textarea
                id="sourceNotes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className={styles.textarea}
                placeholder={t('sources.form.placeholders.notes')}
                maxLength={2000}
                disabled={isCreating}
                rows={3}
              />
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.button}
                disabled={isCreating || !newName.trim() || !newTotalAmount.trim()}
              >
                {isCreating ? t('sources.buttons.creating') : t('sources.buttons.create')}
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => {
                  setShowCreateForm(false);
                  resetCreateForm();
                }}
                disabled={isCreating}
              >
                {t('sources.buttons.cancel')}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Sources list */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {t('sources.sourcesList.title')} ({sources.length})
        </h2>

        {sources.length === 0 ? (
          <p className={styles.emptyState}>{t('sources.sourcesList.empty')}</p>
        ) : (
          <div className={styles.sourcesList}>
            {sources.map((source) => (
              <div key={source.id} className={styles.sourceRow}>
                {editingSource?.id === source.id ? (
                  <form
                    onSubmit={handleUpdateSource}
                    className={styles.editForm}
                    aria-label={`Edit ${source.name}`}
                  >
                    {updateError && (
                      <div className={styles.errorBanner} role="alert">
                        {updateError}
                      </div>
                    )}

                    <div className={styles.editFormRow}>
                      <div className={styles.fieldGrow}>
                        <label htmlFor={`edit-name-${source.id}`} className={styles.label}>
                          {t('sources.form.name')}{' '}
                          <span className={styles.required}>{t('sources.form.required')}</span>
                        </label>
                        <input
                          type="text"
                          id={`edit-name-${source.id}`}
                          value={editingSource.name}
                          onChange={(e) =>
                            setEditingSource({ ...editingSource, name: e.target.value })
                          }
                          className={styles.input}
                          maxLength={200}
                          disabled={isUpdating}
                          autoFocus
                        />
                      </div>

                      <div className={styles.fieldSelect}>
                        <label htmlFor={`edit-type-${source.id}`} className={styles.label}>
                          {t('sources.form.type')}
                        </label>
                        <select
                          id={`edit-type-${source.id}`}
                          value={editingSource.sourceType}
                          onChange={(e) =>
                            setEditingSource({
                              ...editingSource,
                              sourceType: e.target.value as BudgetSourceType,
                            })
                          }
                          className={styles.select}
                          disabled={isUpdating || source.isDiscretionary}
                        >
                          {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.fieldSelect}>
                        <label htmlFor={`edit-status-${source.id}`} className={styles.label}>
                          {t('sources.form.status')}
                        </label>
                        <select
                          id={`edit-status-${source.id}`}
                          value={editingSource.status}
                          onChange={(e) =>
                            setEditingSource({
                              ...editingSource,
                              status: e.target.value as BudgetSourceStatus,
                            })
                          }
                          className={styles.select}
                          disabled={isUpdating}
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className={styles.editFormRow}>
                      <div className={styles.fieldGrow}>
                        <label htmlFor={`edit-amount-${source.id}`} className={styles.label}>
                          {t('sources.form.totalAmount')}{' '}
                          <span className={styles.required}>{t('sources.form.required')}</span>
                        </label>
                        <input
                          type="number"
                          id={`edit-amount-${source.id}`}
                          value={editingSource.totalAmount}
                          onChange={(e) =>
                            setEditingSource({ ...editingSource, totalAmount: e.target.value })
                          }
                          className={styles.input}
                          min={0}
                          step="0.01"
                          disabled={isUpdating}
                        />
                      </div>

                      <div className={styles.fieldNarrow}>
                        <label htmlFor={`edit-rate-${source.id}`} className={styles.label}>
                          {t('sources.form.interestRate')}
                        </label>
                        <input
                          type="number"
                          id={`edit-rate-${source.id}`}
                          value={editingSource.interestRate}
                          onChange={(e) =>
                            setEditingSource({ ...editingSource, interestRate: e.target.value })
                          }
                          className={styles.input}
                          min={0}
                          step="0.01"
                          disabled={isUpdating}
                        />
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor={`edit-terms-${source.id}`} className={styles.label}>
                        {t('sources.form.terms')}
                      </label>
                      <input
                        type="text"
                        id={`edit-terms-${source.id}`}
                        value={editingSource.terms}
                        onChange={(e) =>
                          setEditingSource({ ...editingSource, terms: e.target.value })
                        }
                        className={styles.input}
                        placeholder="e.g., 30-year fixed, monthly payments"
                        maxLength={500}
                        disabled={isUpdating}
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor={`edit-notes-${source.id}`} className={styles.label}>
                        {t('sources.form.notes')}
                      </label>
                      <textarea
                        id={`edit-notes-${source.id}`}
                        value={editingSource.notes}
                        onChange={(e) =>
                          setEditingSource({ ...editingSource, notes: e.target.value })
                        }
                        className={styles.textarea}
                        placeholder="Optional notes"
                        maxLength={2000}
                        disabled={isUpdating}
                        rows={3}
                      />
                    </div>

                    <div className={styles.editActions}>
                      <button
                        type="submit"
                        className={styles.saveButton}
                        disabled={
                          isUpdating ||
                          !editingSource.name.trim() ||
                          !editingSource.totalAmount.trim()
                        }
                      >
                        {isUpdating ? t('sources.buttons.saving') : t('sources.buttons.save')}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={cancelEdit}
                        disabled={isUpdating}
                      >
                        {t('sources.buttons.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={styles.sourceInfo}>
                      <div className={styles.sourceMain}>
                        <span className={styles.sourceName}>{source.name}</span>
                        <div className={styles.sourceBadges}>
                          <span
                            className={`${styles.typeBadge} ${getSourceTypeClass(styles, source.sourceType)}`}
                          >
                            {SOURCE_TYPE_LABELS[source.sourceType]}
                          </span>
                          <span
                            className={`${styles.statusBadge} ${getStatusClass(styles, source.status)}`}
                          >
                            {STATUS_LABELS[source.status]}
                          </span>
                          {source.isDiscretionary && (
                            <span className={styles.systemBadge}>
                              {t('sources.sourcesList.system')}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`${styles.expandToggle} ${expandedSources.has(source.id) ? styles.expandToggleActive : ''}`}
                          onClick={() => handleToggleLinesWithClearing(source.id)}
                          disabled={!!editingSource}
                          aria-expanded={expandedSources.has(source.id)}
                          aria-controls={`source-lines-${source.id}`}
                          aria-label={
                            expandedSources.has(source.id)
                              ? t('sources.lines.collapseAriaLabel', { name: source.name })
                              : t('sources.lines.expandAriaLabel', { name: source.name })
                          }
                        >
                          <svg
                            className={`${styles.chevronIcon} ${expandedSources.has(source.id) ? styles.chevronExpanded : ''}`}
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              d="M6 5l4 4-4 4"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                            />
                          </svg>
                          <span>
                            {expandedSources.has(source.id)
                              ? t('sources.lines.collapse')
                              : t('sources.lines.expand')}
                          </span>
                        </button>
                      </div>

                      <SourceBarChart
                        source={source}
                        formatCurrency={formatCurrency}
                        formatPercent={formatPercent}
                      />

                      {source.terms && (
                        <p className={styles.sourceTerms} title="Terms">
                          {source.terms}
                        </p>
                      )}
                    </div>

                    {expandedSources.has(source.id) && (
                      <SourceBudgetLinePanel
                        sourceId={source.id}
                        sourceName={source.name}
                        data={linesCache.get(source.id) ?? null}
                        isLoading={linesLoading.has(source.id)}
                        error={linesError.get(source.id) ?? null}
                        onRetry={() => handleRetryLines(source.id)}
                        selectedLineIds={sourceSelections.get(source.id)}
                        onSelectionChange={(newSet) => handleSelectionChange(source.id, newSet)}
                        onMoveLines={() => handleOpenMoveModal(source.id)}
                      />
                    )}

                    <div className={styles.sourceActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(source)}
                        disabled={!!editingSource}
                        aria-label={`${t('sources.buttons.edit')} ${source.name}`}
                      >
                        {t('sources.buttons.edit')}
                      </button>
                      {!source.isDiscretionary && (
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => openDeleteConfirm(source.id)}
                          disabled={!!editingSource}
                          aria-label={`${t('sources.buttons.delete')} ${source.name}`}
                        >
                          {t('sources.buttons.delete')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delete confirmation modal */}
      {deletingSourceId && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteConfirm} />
          <div className={styles.modalContent}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              {t('sources.deleteModal.title')}
            </h2>
            <p className={styles.modalText}>
              {t('sources.deleteModal.confirm', {
                name: sources.find((s) => s.id === deletingSourceId)?.name,
              })}
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>{t('sources.deleteModal.warning')}</p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('sources.buttons.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDeleteSource(deletingSourceId)}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('sources.buttons.deleting') : t('sources.buttons.deleteConfirm')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mass-move modal */}
      {moveModalSourceId && activeMoveSource && (
        <MassMoveModal
          sourceId={moveModalSourceId}
          sourceName={activeMoveSource.name}
          selectedLineIds={activeMoveSelection}
          claimedCount={claimedCount}
          workItemBudgetIds={workItemBudgetIds}
          householdItemBudgetIds={householdItemBudgetIds}
          onClose={() => setMoveModalSourceId(null)}
          onSuccess={handleMoveSuccess}
        />
      )}
    </PageLayout>
  );
}

export default BudgetSourcesPage;
