import { useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, InvoiceStatus } from '@cornerstone/shared';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import { Badge } from '../Badge/Badge.js';
import { TriStateCheckbox } from '../TriStateCheckbox/TriStateCheckbox.js';
import { SelectionActionBar } from '../SelectionActionBar/SelectionActionBar.js';
import { Tooltip } from '../Tooltip/Tooltip.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { IconLinkButton } from '../IconLinkButton/IconLinkButton.js';
import { useFormatters } from '../../lib/formatters.js';
import { getSourceBadgeStyleKey } from '../../lib/budgetSourceColors.js';
import BadgeStyles from '../Badge/Badge.module.css';
import styles from './ReportInvoiceList.module.css';

interface ReportInvoiceListProps {
  report: SourceReportResponse;
  excludedInvoiceIds: Set<string>;
  excludedLineIds: Set<string>;
  onToggle: (invoiceId: string, excluded: boolean) => void;
  onToggleAll: (excludeAll: boolean) => void;
  onToggleLine: (lineId: string, excluded: boolean) => void;
  t: TFunction;
}

export function ReportInvoiceList({
  report,
  excludedInvoiceIds,
  excludedLineIds,
  onToggle,
  onToggleAll,
  onToggleLine,
  t,
}: ReportInvoiceListProps) {
  const { formatCurrency, formatDate } = useFormatters();
  const [unallocatedExpanded, setUnallocatedExpanded] = useState(false);
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(() => new Set());
  const lastExpandedIdRef = useRef<string | null>(null);
  const expandPanelRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Invoice status badge variants
  const invoiceStatusVariants = useMemo((): BadgeVariantMap => {
    const variants: BadgeVariantMap = {};
    const statuses: InvoiceStatus[] = ['pending', 'paid', 'claimed', 'quotation'];
    for (const status of statuses) {
      variants[status] = {
        label: t(`sources.lines.invoiceStatus.${status}`),
        className: styles[status]!,
      };
    }
    return variants;
  }, [t]);

  const allocatedInvoices = useMemo(
    () =>
      report.invoices.filter(
        (inv) =>
          inv.allocatedAmount > 0 ||
          inv.lineKind === 'refund-adjustment' ||
          inv.budgetLines.length > 0 ||
          inv.deposits.length > 0,
      ),
    [report.invoices],
  );

  const unallocatedInvoices = useMemo(
    () => report.unallocatedInvoices || [],
    [report.unallocatedInvoices],
  );

  const selectedCount = useMemo(
    () => allocatedInvoices.filter((inv) => !excludedInvoiceIds.has(inv.invoiceId)).length,
    [allocatedInvoices, excludedInvoiceIds],
  );

  const runningTotal = useMemo(
    () =>
      allocatedInvoices
        .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
        .reduce((sum, inv) => sum + inv.allocatedAmount, 0),
    [allocatedInvoices, excludedInvoiceIds],
  );

  const handleSelectAll = () => {
    onToggleAll(selectedCount === allocatedInvoices.length);
  };

  const toggleExpand = (invoiceId: string) => {
    setExpandedInvoiceIds((prev) => {
      const next = new Set(prev);
      const isCurrentlyOpen = next.has(invoiceId);
      if (isCurrentlyOpen) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
        // Only update lastExpandedIdRef when opening (not closing)
        lastExpandedIdRef.current = invoiceId;
      }
      return next;
    });
  };

  const handleExpandKeyDown = (e: React.KeyboardEvent, invoiceId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpand(invoiceId);
    }
  };

  // Focus panel on genuine open transition (not on collapse)
  useEffect(() => {
    const lastExpandedId = lastExpandedIdRef.current;
    if (lastExpandedId && expandedInvoiceIds.has(lastExpandedId)) {
      const panelRef = expandPanelRefsRef.current.get(lastExpandedId);
      if (panelRef) {
        panelRef.focus();
      }
    }
  }, [expandedInvoiceIds]);

  if (allocatedInvoices.length === 0 && unallocatedInvoices.length === 0) {
    return (
      <EmptyState
        message={t('sourceReports.emptyInvoices')}
        description={t('sourceReports.emptyInvoicesDescription')}
      />
    );
  }

  return (
    <div className={styles.invoiceListContainer}>
      {/* Header with select-all */}
      <div className={styles.listHeader}>
        <span aria-hidden="true" />
        <div className={styles.checkboxWithContent}>
          <TriStateCheckbox
            checked={selectedCount === allocatedInvoices.length && allocatedInvoices.length > 0}
            indeterminate={selectedCount > 0 && selectedCount < allocatedInvoices.length}
            onChange={handleSelectAll}
            label={t('sourceReports.selectAllInvoices')}
          />
        </div>
        <div className={styles.headerTitle}>{t('sourceReports.invoicesHeading')}</div>
      </div>

      {/* Allocated invoices list */}
      {allocatedInvoices.map((invoice) => {
        const isExcluded = excludedInvoiceIds.has(invoice.invoiceId);
        const hasDocuments = (invoice.documents && invoice.documents.length > 0) || false;
        const isExpanded = expandedInvoiceIds.has(invoice.invoiceId);
        const isExpandable = invoice.budgetLines.length > 0 || invoice.deposits.length > 0;

        // Tri-state logic: indeterminate if some but not all lines are excluded
        const excludedLineCount = invoice.budgetLines.filter((l) =>
          excludedLineIds.has(l.id),
        ).length;
        const isTriStateIndeterminate =
          !isExcluded && excludedLineCount > 0 && excludedLineCount < invoice.budgetLines.length;
        const isTriStateChecked = !isExcluded && excludedLineCount === 0;

        return (
          <div key={invoice.invoiceId}>
            <div className={styles.invoiceRow}>
              {isExpandable ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(invoice.invoiceId)}
                  onKeyDown={(e) => handleExpandKeyDown(e, invoice.invoiceId)}
                  className={styles.expandButton}
                  aria-expanded={isExpanded}
                  aria-controls={`invoice-expand-${invoice.invoiceId}`}
                  aria-label={
                    isExpanded
                      ? t('sourceReports.expand.collapseInvoice')
                      : t('sourceReports.expand.expandInvoice')
                  }
                >
                  <svg
                    className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              ) : (
                <span aria-hidden="true" />
              )}

              <label className={styles.checkboxWithContent}>
                <TriStateCheckbox
                  checked={isTriStateChecked}
                  indeterminate={isTriStateIndeterminate}
                  onChange={(checked) => onToggle(invoice.invoiceId, !checked)}
                  label=""
                />

                <div className={styles.vendorInfo}>
                  <div className={styles.vendorName}>{invoice.vendorName}</div>
                  <div className={styles.invoiceDate}>
                    {t('sourceReports.table.invoiceNumber')}: {invoice.invoiceNumber}
                  </div>
                </div>
              </label>

              <Badge
                className={styles.statusChip}
                variants={invoiceStatusVariants}
                value={invoice.status}
              />

              <div className={styles.amountColumn}>
                {invoice.lineKind === 'refund-adjustment' ? (
                  <div>
                    <Badge
                      variants={{
                        refund: { label: t('sourceReports.refund'), className: styles.refund },
                      }}
                      value="refund"
                    />
                    <div className={`${styles.amount} ${styles.amountNegative}`}>
                      {formatCurrency(invoice.allocatedAmount)}
                    </div>
                  </div>
                ) : (
                  <div className={styles.amount}>{formatCurrency(invoice.allocatedAmount)}</div>
                )}
              </div>

              <div className={styles.attachmentColumn}>
                {invoice.isSplit && (
                  <Tooltip content={t('sourceReports.splitTooltip')}>
                    <Badge
                      variants={{
                        split: {
                          label: t('sourceReports.splitBadge', {
                            allocated: formatCurrency(invoice.allocatedAmount),
                            total: formatCurrency(invoice.invoiceAmount),
                          }),
                          className: BadgeStyles.info,
                        },
                      }}
                      value="split"
                    />
                  </Tooltip>
                )}
                {hasDocuments ? (
                  <div className={styles.paperclip}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    <span className={styles.srOnly}>{t('sourceReports.hasAttachment')}</span>
                  </div>
                ) : (
                  <div className={styles.noDocument}>{t('sourceReports.noDocument')}</div>
                )}
              </div>
              {/* 7th grid column: open-invoice affordance. Sibling of .attachmentColumn,
                  NOT inside the checkboxWithContent <label> above — see AC 2.5. */}
              <IconLinkButton
                to={`/budget/invoices/${invoice.invoiceId}`}
                newTab
                ariaLabel={t('sourceReports.openInvoiceAriaLabel', {
                  vendor: invoice.vendorName,
                  invoiceNumber: invoice.invoiceNumber,
                })}
                tooltip={t('sourceReports.openInvoiceTooltip')}
                icon={
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                }
              />
            </div>

            {/* Expansion panel - items sub-table */}
            {isExpanded && isExpandable && (
              <div
                className={styles.expansionPanel}
                id={`invoice-expand-${invoice.invoiceId}`}
                tabIndex={-1}
                ref={(el) => {
                  if (el) expandPanelRefsRef.current.set(invoice.invoiceId, el);
                }}
              >
                {/* Items sub-table */}
                {invoice.budgetLines.length > 0 ? (
                  <div className={styles.subTableSection}>
                    <h4
                      className={styles.subTableHeading}
                      id={`items-heading-${invoice.invoiceId}`}
                    >
                      {t('sourceReports.expand.itemsHeading')}
                    </h4>
                    {/* Desktop table */}
                    <div className={styles.tableWrapper}>
                      <table
                        className={styles.table}
                        aria-labelledby={`items-heading-${invoice.invoiceId}`}
                      >
                        <thead>
                          <tr>
                            <th>{t('sourceReports.expand.itemColumnHeader')}</th>
                            <th>{t('sourceReports.expand.linkedColumnHeader')}</th>
                            <th>{t('sourceReports.expand.allocatedColumnHeader')}</th>
                            <th>{t('sourceReports.expand.includeColumnHeader')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.budgetLines.map((line) => {
                            const isLineExcluded = excludedLineIds.has(line.id);
                            return (
                              <tr key={line.id}>
                                <td>{line.description || t('sourceReports.expand.unnamedLine')}</td>
                                <td>
                                  {line.linkedItem ? (
                                    <Link
                                      to={
                                        line.linkedItem.type === 'work_item'
                                          ? `/project/work-items/${line.linkedItem.id}`
                                          : `/household-items/${line.linkedItem.id}`
                                      }
                                      className={styles.linkedItemLink}
                                    >
                                      {line.linkedItem.name}
                                    </Link>
                                  ) : (
                                    <Badge
                                      variants={{
                                        unassigned: {
                                          label: t('sourceReports.unassigned'),
                                          className: BadgeStyles.iblUnassigned,
                                        },
                                      }}
                                      value="unassigned"
                                    />
                                  )}
                                </td>
                                <td>{formatCurrency(line.allocatedPortion)}</td>
                                <td>
                                  <input
                                    type="checkbox"
                                    className={styles.checkbox}
                                    checked={!isLineExcluded}
                                    onChange={(e) => onToggleLine(line.id, !e.target.checked)}
                                    aria-label={t('sourceReports.expand.excludeItemAriaLabel', {
                                      name:
                                        line.description || t('sourceReports.expand.unnamedLine'),
                                    })}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile card list */}
                    <div className={styles.mobileCardList} role="list">
                      {invoice.budgetLines.map((line) => {
                        const isLineExcluded = excludedLineIds.has(line.id);
                        return (
                          <div key={line.id} className={styles.mobileCard} role="listitem">
                            <div className={styles.mobileCardTopRow}>
                              <span className={styles.mobileCardHeading}>
                                {line.description || t('sourceReports.expand.unnamedLine')}
                              </span>
                              <span className={styles.amount}>
                                {formatCurrency(line.allocatedPortion)}
                              </span>
                            </div>
                            <div className={styles.mobileCardRow}>
                              <span className={styles.mobileCardHeading}>
                                {t('sourceReports.expand.linkedColumnHeader')}
                              </span>
                              {line.linkedItem ? (
                                <Link
                                  to={
                                    line.linkedItem.type === 'work_item'
                                      ? `/project/work-items/${line.linkedItem.id}`
                                      : `/household-items/${line.linkedItem.id}`
                                  }
                                  className={styles.linkedItemLink}
                                >
                                  {line.linkedItem.name}
                                </Link>
                              ) : (
                                <Badge
                                  variants={{
                                    unassigned: {
                                      label: t('sourceReports.unassigned'),
                                      className: BadgeStyles.iblUnassigned,
                                    },
                                  }}
                                  value="unassigned"
                                />
                              )}
                            </div>
                            <div className={styles.mobileCardRow}>
                              <label>
                                <input
                                  type="checkbox"
                                  className={styles.checkbox}
                                  checked={!isLineExcluded}
                                  onChange={(e) => onToggleLine(line.id, !e.target.checked)}
                                  aria-label={t('sourceReports.expand.excludeItemAriaLabel', {
                                    name: line.description || t('sourceReports.expand.unnamedLine'),
                                  })}
                                />
                                <span>{t('sourceReports.expand.includeColumnHeader')}</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className={styles.subTableSection}>
                    <h4 className={styles.subTableHeading}>
                      {t('sourceReports.expand.itemsHeading')}
                    </h4>
                    <EmptyState message={t('sourceReports.expand.itemsEmpty')} />
                  </div>
                )}

                {/* Deposits sub-table */}
                {invoice.deposits.length > 0 ? (
                  <div className={`${styles.subTableSection} ${styles.subTableSeparated}`}>
                    <h4
                      className={styles.subTableHeading}
                      id={`deposits-heading-${invoice.invoiceId}`}
                    >
                      {t('sourceReports.expand.depositsHeading')}
                    </h4>
                    {/* Desktop table */}
                    <div className={styles.tableWrapper}>
                      <table
                        className={styles.table}
                        aria-labelledby={`deposits-heading-${invoice.invoiceId}`}
                      >
                        <thead>
                          <tr>
                            <th>{t('sourceReports.expand.amountColumnHeader')}</th>
                            <th>{t('sourceReports.expand.statusColumnHeader')}</th>
                            <th>{t('sourceReports.expand.datesColumnHeader')}</th>
                            <th>{t('sourceReports.expand.entryTypeColumnHeader')}</th>
                            <th>{t('sourceReports.expand.allocatedSourceColumnHeader')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.deposits.map((deposit) => (
                            <tr key={deposit.id}>
                              <td>
                                <div className={styles.depositAmountContainer}>
                                  {deposit.entryType === 'refund' && (
                                    <Badge
                                      variants={{
                                        refund: {
                                          label: t('sourceReports.expand.entryTypeRefund'),
                                          className: styles.refund,
                                        },
                                      }}
                                      value="refund"
                                    />
                                  )}
                                  {formatCurrency(
                                    deposit.entryType === 'refund'
                                      ? -deposit.amount
                                      : deposit.amount,
                                  )}
                                </div>
                              </td>
                              <td>
                                <Badge
                                  variants={{
                                    [deposit.status]: {
                                      label: t(`sources.lines.invoiceStatus.${deposit.status}`),
                                      className: styles[deposit.status]!,
                                    },
                                  }}
                                  value={deposit.status}
                                />
                              </td>
                              <td className={styles.depositDatesCell}>
                                <div>
                                  {t('sourceReports.expand.dueDate')}: {formatDate(deposit.dueDate)}
                                </div>
                                {deposit.paidDate && (
                                  <div>
                                    {t('sourceReports.expand.paidDate')}:{' '}
                                    {formatDate(deposit.paidDate)}
                                  </div>
                                )}
                                {deposit.claimedDate && (
                                  <div>
                                    {t('sourceReports.expand.claimedDate')}:{' '}
                                    {formatDate(deposit.claimedDate)}
                                  </div>
                                )}
                              </td>
                              <td>
                                <Badge
                                  variants={{
                                    [deposit.entryType]: {
                                      label:
                                        deposit.entryType === 'deposit'
                                          ? t('sourceReports.expand.entryTypeDeposit')
                                          : t('sourceReports.expand.entryTypeRefund'),
                                      className:
                                        deposit.entryType === 'deposit'
                                          ? BadgeStyles.info
                                          : styles.refund,
                                    },
                                  }}
                                  value={deposit.entryType}
                                />
                              </td>
                              <td>
                                {deposit.budgetSourceId ? (
                                  <Badge
                                    variants={{
                                      [deposit.budgetSourceId]: {
                                        label: report.source.name,
                                        className:
                                          BadgeStyles[
                                            getSourceBadgeStyleKey(deposit.budgetSourceId)
                                          ] || BadgeStyles.default,
                                      },
                                    }}
                                    value={deposit.budgetSourceId}
                                  />
                                ) : (
                                  <span>—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile card list */}
                    <div className={styles.mobileCardList} role="list">
                      {invoice.deposits.map((deposit) => (
                        <div key={deposit.id} className={styles.mobileCard} role="listitem">
                          <div className={styles.mobileCardTopRow}>
                            <span className={styles.amount}>
                              {formatCurrency(
                                deposit.entryType === 'refund' ? -deposit.amount : deposit.amount,
                              )}
                            </span>
                            <Badge
                              variants={{
                                [deposit.status]: {
                                  label: t(`sources.lines.invoiceStatus.${deposit.status}`),
                                  className: styles[deposit.status]!,
                                },
                              }}
                              value={deposit.status}
                            />
                          </div>
                          <div className={styles.mobileCardRow}>
                            <span className={styles.mobileCardHeading}>
                              {t('sourceReports.expand.entryTypeColumnHeader')}
                            </span>
                            <Badge
                              variants={{
                                [deposit.entryType]: {
                                  label:
                                    deposit.entryType === 'deposit'
                                      ? t('sourceReports.expand.entryTypeDeposit')
                                      : t('sourceReports.expand.entryTypeRefund'),
                                  className:
                                    deposit.entryType === 'deposit'
                                      ? BadgeStyles.info
                                      : styles.refund,
                                },
                              }}
                              value={deposit.entryType}
                            />
                          </div>
                          <div className={styles.mobileCardRow}>
                            <span className={styles.mobileCardHeading}>
                              {t('sourceReports.expand.datesColumnHeader')}
                            </span>
                            <div className={styles.depositDatesCell}>
                              <div>
                                {t('sourceReports.expand.dueDate')}: {formatDate(deposit.dueDate)}
                              </div>
                              {deposit.paidDate && (
                                <div>
                                  {t('sourceReports.expand.paidDate')}:{' '}
                                  {formatDate(deposit.paidDate)}
                                </div>
                              )}
                              {deposit.claimedDate && (
                                <div>
                                  {t('sourceReports.expand.claimedDate')}:{' '}
                                  {formatDate(deposit.claimedDate)}
                                </div>
                              )}
                            </div>
                          </div>
                          {deposit.budgetSourceId && (
                            <div className={styles.mobileCardRow}>
                              <span className={styles.mobileCardHeading}>
                                {t('sourceReports.expand.allocatedSourceColumnHeader')}
                              </span>
                              <Badge
                                variants={{
                                  [deposit.budgetSourceId]: {
                                    label: report.source.name,
                                    className:
                                      BadgeStyles[getSourceBadgeStyleKey(deposit.budgetSourceId)] ||
                                      BadgeStyles.default,
                                  },
                                }}
                                value={deposit.budgetSourceId}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={`${styles.subTableSection} ${styles.subTableSeparated}`}>
                    <h4 className={styles.subTableHeading}>
                      {t('sourceReports.expand.depositsHeading')}
                    </h4>
                    <EmptyState message={t('sourceReports.expand.depositsEmpty')} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Unallocated group */}
      {unallocatedInvoices.length > 0 && (
        <div className={styles.unallocatedSection}>
          <button
            type="button"
            className={styles.unallocatedHeader}
            onClick={() => setUnallocatedExpanded(!unallocatedExpanded)}
            aria-expanded={unallocatedExpanded}
          >
            <svg
              className={`${styles.chevron} ${unallocatedExpanded ? styles.chevronOpen : ''}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <Badge
              variants={{
                unallocated: {
                  label: t('sourceReports.unallocatedGroupTitle', {
                    count: unallocatedInvoices.length,
                  }),
                  className: BadgeStyles.warning,
                },
              }}
              value="unallocated"
            />
          </button>

          {unallocatedExpanded && (
            <div className={styles.unallocatedList}>
              {unallocatedInvoices.map((invoice) => (
                <div key={invoice.invoiceId} className={styles.unallocatedRow}>
                  <Tooltip content={t('sourceReports.unallocatedExplained')}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </Tooltip>
                  <div className={styles.vendorName}>{invoice.vendorName}</div>
                  <div className={styles.amount}>{formatCurrency(invoice.invoiceAmount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selection action bar */}
      <SelectionActionBar
        countLabel={t('sourceReports.selectedCount', {
          count: selectedCount,
          totalCount: allocatedInvoices.length,
          totalAmount: formatCurrency(runningTotal),
        })}
        clearLabel={t('sourceReports.resetSelection')}
        onClear={() => onToggleAll(false)}
      >
        {null}
      </SelectionActionBar>
    </div>
  );
}
