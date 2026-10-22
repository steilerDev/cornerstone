import { useId, useMemo, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  AttentionAction,
  AttentionLink,
  AttentionRow,
  HouseholdItemStatus,
  InvoiceDepositStatus,
  InvoiceStatus,
  ManualDiaryEntryType,
  WorkItemStatus,
} from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useDiaryEntryTitle } from '../../hooks/useDiaryEntryTitle.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { attentionRowText, holdsUpLine } from '../../lib/attention/attentionText.js';
import { notNow, undoNotNow } from '../../lib/attentionApi.js';
import { useFormatters } from '../../lib/formatters.js';
import type { StatusChangeResult } from '../../lib/statusChangeApi.js';
import {
  changeDepositStatus,
  changeHouseholdItemStatus,
  changeInvoiceStatus,
  changeWorkItemStatus,
  depositStatusBody,
  householdItemStatusBody,
  invoiceStatusBody,
  workItemStatusBody,
} from '../../lib/statusChangeApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { AreaBreadcrumb } from '../AreaBreadcrumb/AreaBreadcrumb.js';
import { Badge } from '../Badge/Badge.js';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import { FeedRow } from '../FeedRow/FeedRow.js';
import { StatusMenu } from '../StatusMenu/StatusMenu.js';
import type { StatusMenuTransition } from '../StatusMenu/StatusMenu.js';
import {
  invoiceTransitions,
  progressPaymentTransitions,
  purchaseTransitions,
  taskTransitions,
} from '../StatusMenu/statusVocabularies.js';
import { useToast } from '../Toast/ToastContext.js';
import styles from './AttentionList.module.css';

/** How a row leaves the list; the host removes it optimistically and refetches. */
export type AttentionLeaveReason = 'done' | 'notNow';

export interface AttentionRowViewProps {
  row: AttentionRow;
  today: string;
  testId: string;
  /** Always `li` for list rows. */
  onLeave: (row: AttentionRow, reason: AttentionLeaveReason) => void;
  onRefresh: () => void;
  onNavigate?: () => void;
  onDiscard: (row: AttentionRow) => void;
  /** Group rows: show the tasks behind a disclosure (default) or always. */
  showGroups: boolean;
}

/** `routeUrl` for a server-built link (the ids are checked by the shared `AttentionLink` type). */
export function attentionLinkUrl(link: AttentionLink): string {
  const build = routeUrl as unknown as (
    id: string,
    params?: Record<string, string>,
    query?: Record<string, string>,
  ) => string;
  return build(link.route, link.params, link.query);
}

function RowStatusMenu<S extends string>({
  transitions,
  variants,
  value,
  actionTo,
  apply,
  focusFallbackRef,
  testId,
}: {
  transitions: StatusMenuTransition<S>[];
  variants: BadgeVariantMap;
  value: S;
  actionTo: S;
  apply: (to: S, date: string | null) => Promise<void>;
  focusFallbackRef: { readonly current: HTMLElement | null };
  testId: string;
}) {
  return (
    <StatusMenu
      appearance="action"
      transitions={transitions}
      badge={{ variants, value }}
      currentLabel={variants[value]?.label ?? value}
      actionTo={actionTo}
      onApply={apply}
      focusFallbackRef={focusFallbackRef as RefObject<HTMLElement | null>}
      testId={testId}
    />
  );
}

/** One attention row: wording, badges and its actions. State changes go through the host. */
export function AttentionRowView({
  row,
  today,
  testId,
  onLeave,
  onRefresh,
  onNavigate,
  onDiscard,
  showGroups,
}: AttentionRowViewProps) {
  const { t } = useTranslation('common');
  const { t: tDiary } = useTranslation('diary');
  const { formatDayMonth, formatCurrency } = useFormatters();
  const badges = useStatusBadgeVariants();
  const { run } = useUndoableStatusChange();
  const { showToast, showUndoToast } = useToast();
  const originState = useOriginState();
  const hintId = useId();
  const groupListId = useId();
  const [busy, setBusy] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const params = row.params;
  const isGroup = params.rule === 'N2' && params.kind === 'group';
  const snoozed = row.snoozedUntil !== null;

  const diaryTitle = useDiaryEntryTitle(
    params.rule === 'H1'
      ? { title: row.subject.label, entryType: params.entryType, entryDate: params.entryDate }
      : params.rule === 'N12'
        ? { title: row.subject.label, entryType: 'issue', entryDate: params.entryDate }
        : null,
  );

  const text = attentionRowText(row, {
    t,
    today,
    formatDayMonth,
    formatCurrency,
    purchaseStatusLabel: (status) =>
      t(I18N_UNION_KEYS.statusVocabularyPurchase.key(status as HouseholdItemStatus)),
    diaryTypeLabel: (type) =>
      t(I18N_UNION_KEYS.statusVocabularyDiaryType.key(type as ManualDiaryEntryType)),
    severityLabel: (severity) =>
      tDiary(
        I18N_UNION_KEYS.diarySeverity.key(
          severity as (typeof I18N_UNION_KEYS.diarySeverity.members)[number],
        ),
      ),
  });

  const kindLabel = text.kind ? t(I18N_UNION_KEYS.attentionKind.key(text.kind)) : undefined;
  const groupSize = params.rule === 'N2' && params.kind === 'group' ? params.items.length : 0;
  const title = isGroup
    ? t('attention.sentence.n2GroupTitle', { count: groupSize })
    : (diaryTitle ?? row.subject.label ?? kindLabel ?? '');

  // Lazy lookup: the row's title is what Undo and a vanishing control hand focus back to.
  const focusFallbackRef = useMemo(
    () => ({
      get current(): HTMLElement | null {
        return document.querySelector<HTMLElement>(
          `[data-testid="${CSS.escape(testId)}"] [data-row-focus]`,
        );
      },
    }),
    [testId],
  );

  const leave = (reason: AttentionLeaveReason) => {
    onLeave(row, reason);
    onRefresh();
  };

  const statusLabel = (key: string) => t(key);

  const runChange = <R,>(request: () => Promise<StatusChangeResult<R>>, label: string) =>
    run({
      request,
      recordName: title,
      statusLabel: label,
      dedupeKey: row.key,
      onChanged: () => leave('done'),
      onUndone: onRefresh,
    });

  const detailLink = attentionLinkUrl(row.link);

  const renderAction = (action: Exclude<AttentionAction, 'open'>): ReactNode => {
    const actionLabel = t(I18N_UNION_KEYS.attentionAction.key(action));
    const key = `${testId}-${action}`;
    switch (action) {
      case 'mark_done': {
        if (params.rule === 'H4') {
          const transitions = taskTransitions(t, {
            status: 'in_progress',
            startDate: null,
            endDate: null,
            actualStartDate: null,
          }).map(({ to, label, direction }) => ({ to, label, direction }));
          return (
            <RowStatusMenu<WorkItemStatus>
              key={action}
              transitions={transitions}
              variants={badges.task}
              value="in_progress"
              actionTo="completed"
              focusFallbackRef={focusFallbackRef}
              testId={key}
              apply={(to) =>
                runChange(
                  () =>
                    changeWorkItemStatus(
                      row.subject.id,
                      workItemStatusBody(to, params.actualEndDate),
                    ),
                  statusLabel(I18N_UNION_KEYS.statusVocabularyTask.key(to)),
                )
              }
            />
          );
        }
        if (params.rule !== 'N1') return null;
        return (
          <RowStatusMenu<WorkItemStatus>
            key={action}
            transitions={taskTransitions(t, {
              status: 'in_progress',
              startDate: null,
              endDate: params.plannedEndDate,
              actualStartDate: null,
            })}
            variants={badges.task}
            value="in_progress"
            actionTo="completed"
            focusFallbackRef={focusFallbackRef}
            testId={key}
            apply={(to, date) =>
              runChange(
                () => changeWorkItemStatus(row.subject.id, workItemStatusBody(to, date)),
                statusLabel(I18N_UNION_KEYS.statusVocabularyTask.key(to)),
              )
            }
          />
        );
      }
      case 'start': {
        if (params.rule !== 'N2' || params.kind !== 'task') return null;
        return (
          <RowStatusMenu<WorkItemStatus>
            key={action}
            transitions={taskTransitions(t, {
              status: 'not_started',
              startDate: params.plannedStartDate,
              endDate: null,
              actualStartDate: null,
            })}
            variants={badges.task}
            value="not_started"
            actionTo="in_progress"
            focusFallbackRef={focusFallbackRef}
            testId={key}
            apply={(to, date) =>
              runChange(
                () => changeWorkItemStatus(row.subject.id, workItemStatusBody(to, date)),
                statusLabel(I18N_UNION_KEYS.statusVocabularyTask.key(to)),
              )
            }
          />
        );
      }
      case 'mark_delivered': {
        if (params.rule !== 'N10') return null;
        return (
          <RowStatusMenu<HouseholdItemStatus>
            key={action}
            transitions={purchaseTransitions(t, {
              status: params.status,
              targetDeliveryDate: params.targetDeliveryDate,
            })}
            variants={badges.purchase}
            value={params.status}
            actionTo="arrived"
            focusFallbackRef={focusFallbackRef}
            testId={key}
            apply={(to, date) =>
              runChange(
                () => changeHouseholdItemStatus(row.subject.id, householdItemStatusBody(to, date)),
                statusLabel(I18N_UNION_KEYS.statusVocabularyPurchase.key(to)),
              )
            }
          />
        );
      }
      case 'mark_paid': {
        if (params.rule !== 'N4' && params.rule !== 'N5' && params.rule !== 'N6') return null;
        if (params.paymentKind === 'progress') {
          return (
            <RowStatusMenu<InvoiceDepositStatus>
              key={action}
              transitions={progressPaymentTransitions(t, { status: 'pending' })}
              variants={badges.progressPayment}
              value="pending"
              actionTo="paid"
              focusFallbackRef={focusFallbackRef}
              testId={key}
              apply={(to, date) =>
                runChange(
                  () =>
                    changeDepositStatus(
                      params.invoiceId,
                      row.subject.id,
                      depositStatusBody('pending', to, date),
                    ),
                  statusLabel(I18N_UNION_KEYS.statusVocabularyProgressPayment.key(to)),
                )
              }
            />
          );
        }
        return (
          <RowStatusMenu<InvoiceStatus>
            key={action}
            transitions={invoiceTransitions(t, { status: 'pending' })}
            variants={badges.invoice}
            value="pending"
            actionTo="paid"
            focusFallbackRef={focusFallbackRef}
            testId={key}
            apply={(to) =>
              runChange(
                () =>
                  changeInvoiceStatus(params.companyId, params.invoiceId, invoiceStatusBody(to)),
                statusLabel(I18N_UNION_KEYS.statusVocabularyInvoice.key(to)),
              )
            }
          />
        );
      }
      case 'reschedule':
        return (
          <NavAnchor
            key={action}
            // Interim until the Timing tab of the task page (story 5.2).
            to={`${routeUrl('workItem', { id: row.subject.id })}#constraints`}
            state={originState}
            className={styles.actionLink}
            onNavigate={onNavigate}
            data-testid={key}
          >
            {actionLabel}
          </NavAnchor>
        );
      case 'change_target':
      case 'convert':
      case 'split':
      case 'continue':
      case 'prepare_bank_report':
        return (
          <NavAnchor
            key={action}
            to={detailLink}
            state={originState}
            className={styles.actionLink}
            onNavigate={onNavigate}
            data-testid={key}
          >
            {actionLabel}
          </NavAnchor>
        );
      case 'discard':
        return (
          <button
            key={action}
            type="button"
            className={styles.actionButton}
            onClick={() => onDiscard(row)}
            data-testid={key}
          >
            {actionLabel}
          </button>
        );
    }
  };

  const handleNotNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await notNow(row.key);
      leave('notNow');
      showUndoToast({
        message: t('attention.notNowToast'),
        dedupeKey: `notNow:${row.key}`,
        onUndo: async () => {
          await undoNotNow(row.key);
          onRefresh();
        },
      });
    } catch {
      showToast('error', t('attention.notNowFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleShowAgain = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await undoNotNow(row.key);
      onRefresh();
    } catch {
      showToast('error', t('attention.notNowFailed'));
    } finally {
      setBusy(false);
    }
  };

  const inlineActions = snoozed
    ? []
    : isGroup
      ? []
      : row.actions
          .filter((action): action is Exclude<AttentionAction, 'open'> => action !== 'open') // the title is the link
          .slice(0, 2);

  const actions = (
    <>
      {inlineActions.map(renderAction)}
      {snoozed ? (
        <button
          type="button"
          className={styles.textButton}
          aria-disabled={busy ? 'true' : undefined}
          onClick={() => void handleShowAgain()}
          data-testid={`${testId}-show-again`}
        >
          {t('attention.showAgain')}
        </button>
      ) : (
        <>
          <button
            type="button"
            className={styles.textButton}
            title={t('attention.notNowHint')}
            aria-describedby={hintId}
            aria-disabled={busy ? 'true' : undefined}
            onClick={() => void handleNotNow()}
            data-testid={`${testId}-not-now`}
          >
            {t('attention.notNow')}
          </button>
          <span id={hintId} hidden>
            {t('attention.notNowHint')}
          </span>
        </>
      )}
    </>
  );

  const area = row.subject.area;
  const companyName =
    params.rule === 'N1' ||
    (params.rule === 'N2' && params.kind === 'task') ||
    params.rule === 'N4' ||
    params.rule === 'N5' ||
    params.rule === 'N6' ||
    params.rule === 'N9' ||
    params.rule === 'N10' ||
    params.rule === 'H2'
      ? params.companyName
      : null;
  const context =
    area || companyName ? (
      <>
        {area ? (
          <>
            <span aria-hidden="true">{'· '}</span>
            <AreaBreadcrumb area={area} variant="compact" />
          </>
        ) : null}
        {companyName ? (
          <>
            <span aria-hidden="true">{' · '}</span>
            {companyName}
          </>
        ) : null}
      </>
    ) : undefined;

  const notes: ReactNode[] = [];
  if (text.holdsUp) notes.push(<span key="holdsUp">{text.holdsUp}</span>);
  if (text.severityLine) notes.push(<span key="severity">{text.severityLine}</span>);
  if (row.snoozedUntil) {
    notes.push(
      <span key="backOn">{t('attention.backOn', { date: formatDayMonth(row.snoozedUntil) })}</span>,
    );
  }

  const groupItems = params.rule === 'N2' && params.kind === 'group' ? params.items : [];
  const itemsVisible = !showGroups || groupOpen;

  return (
    <FeedRow
      variant="object"
      severity={row.severity}
      badges={<Badge variants={badges.attentionTier} value={row.tier} testId={`${testId}-tier`} />}
      figure={
        row.amount !== null
          ? { text: formatCurrency(row.amount), srPrefix: t('attention.amountPrefix') }
          : null
      }
      kindLabel={isGroup ? undefined : kindLabel}
      title={title}
      titleLink={isGroup ? null : { to: detailLink, state: originState }}
      context={context}
      sentence={text.sentence}
      notes={notes}
      actions={actions}
      testId={testId}
    >
      {isGroup ? (
        <div className={styles.group}>
          {showGroups ? (
            <button
              type="button"
              className={styles.disclosure}
              aria-expanded={groupOpen}
              aria-controls={groupListId}
              onClick={() => setGroupOpen((open) => !open)}
              data-testid={`${testId}-group-toggle`}
            >
              {groupOpen ? t('attention.group.hide') : t('attention.group.show')}
            </button>
          ) : null}
          <ul id={groupListId} className={styles.groupList} hidden={!itemsVisible}>
            {groupItems.map((item) => {
              const holds = holdsUpLine(item.holdsUp, t);
              return (
                <li
                  key={item.id}
                  className={styles.groupItem}
                  data-testid={`${testId}-item-${item.id}`}
                >
                  <NavAnchor
                    to={routeUrl('workItem', { id: item.id })}
                    state={originState}
                    className={styles.itemLink}
                    onNavigate={onNavigate}
                  >
                    {item.label}
                  </NavAnchor>
                  <span className={styles.itemMeta}>
                    {item.area ? <AreaBreadcrumb area={item.area} variant="compact" /> : null}
                    <span>{t('attention.group.daysLate', { count: item.daysLate })}</span>
                  </span>
                  {holds ? <span className={styles.itemMeta}>{holds}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </FeedRow>
  );
}
