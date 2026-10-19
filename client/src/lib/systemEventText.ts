/**
 * The only place the wording of system events lives (ADR-040). Pure: no React, no i18next import;
 * `t` and the formatters are injected. Version 1 rows carry parameters, never English text, so
 * they are rendered here in the UI language; legacy rows show their stored text.
 */
import type { TFunction } from 'i18next';
import { isSystemEventMetadataV1, routeUrl } from '@cornerstone/shared';
import type {
  DiaryEntrySummary,
  InvoiceCreatedMetadataV1,
  MilestoneDelayedMetadataV1,
  StatusChangedMetadataV1,
} from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../i18n/unionKeys.js';
import type { UnionKeySet } from '../i18n/unionKeys.js';
import { diaryEntryTypeLabelKey } from './diaryEntryTypeLabel.js';

export type SystemEventKind =
  | 'statusChange'
  | 'payment'
  | 'submission'
  | 'invoiceRecorded'
  | 'milestoneMoved'
  | 'grantStatus'
  | 'legacy';

export interface SystemEventFormatters {
  formatDate: (d: string | null | undefined) => string;
  formatCurrency: (n: number) => string;
}

export interface SystemEventLink {
  to: string;
  label: string;
  ariaLabel: string;
}

export interface SystemEventView {
  kind: SystemEventKind;
  /** FeedRow type badge text. */
  typeLabel: string;
  /** One paragraph of plain text. */
  sentence: string;
  /** True: stored English text of a legacy row, rendered muted. */
  isLegacyText: boolean;
  /** Extra detail line, e.g. the amount of an "Invoice recorded" event. */
  detail: string | null;
  /** Subject for the entry page h1 and tab title; null = the caller's fallback. */
  heading: string | null;
  /** Null when the subject is gone or there is nothing to open. */
  link: SystemEventLink | null;
  /** The subject is gone: show "No longer exists" instead of the link. */
  removed: boolean;
  repeat: { badge: string; detail: string } | null;
  afterReached: { badge: string; detail: string } | null;
}

type LinkObject =
  'task' | 'invoice' | 'offer' | 'progressPayment' | 'refund' | 'milestone' | 'grant';

const LINK_OBJECT_KEYS: Readonly<Record<LinkObject, string>> = {
  task: 'event.linkObject.task',
  invoice: 'event.linkObject.invoice',
  offer: 'event.linkObject.offer',
  progressPayment: 'event.linkObject.progressPayment',
  refund: 'event.linkObject.refund',
  milestone: 'event.linkObject.milestone',
  grant: 'event.linkObject.grant',
};

const OBJECT_KEYS = {
  invoice: 'event.object.invoice',
  offer: 'event.object.offer',
  progressPayment: 'event.object.progressPayment',
  refund: 'event.object.refund',
  grant: 'event.object.grant',
} as const;

/** Entry types that name a subject (everything but the two retired kinds). */
function hasSubjectType(entry: DiaryEntrySummary): boolean {
  return entry.entryType !== 'auto_reschedule' && entry.entryType !== 'budget_breach';
}

export function renderSystemEvent(
  entry: DiaryEntrySummary,
  t: TFunction,
  f: SystemEventFormatters,
): SystemEventView {
  const dt = (key: string, options?: Record<string, unknown>): string =>
    t(key, { ns: 'diary', ...options }) as string;
  const ct = (key: string): string => t(key, { ns: 'common' }) as string;

  const metadata = entry.metadata;
  const removed =
    hasSubjectType(entry) && (!entry.sourceEntityId || entry.sourceEntityExists === false);
  const linkable = Boolean(entry.sourceEntityId) && entry.sourceEntityExists !== false;

  const repeat = entry.repeat
    ? (() => {
        const { count, firstAt, lastAt } = entry.repeat;
        const first = f.formatDate(firstAt.slice(0, 10));
        const last = f.formatDate(lastAt.slice(0, 10));
        return {
          badge: dt('event.repeatBadge', { count }),
          detail:
            firstAt.slice(0, 10) === lastAt.slice(0, 10)
              ? dt('event.repeatSameDay', { count, date: first })
              : dt('event.repeatRange', { count, from: first, to: last }),
        };
      })()
    : null;
  const afterReached = entry.hidden
    ? { badge: dt('event.afterReached'), detail: dt('event.afterReachedDetail') }
    : null;

  const typeKey = diaryEntryTypeLabelKey(entry.entryType);

  // ── Legacy rows: stored text ────────────────────────────────────────────────────────────────
  if (!isSystemEventMetadataV1(metadata) || metadata.event === 'legacy') {
    const depositId =
      isSystemEventMetadataV1(metadata) && metadata.event === 'legacy'
        ? metadata.depositId
        : undefined;
    const heading = entry.title?.trim() || null;
    let link: SystemEventLink | null = null;
    if (linkable && entry.sourceEntityType && entry.sourceEntityType !== 'budget_source') {
      const target = linkTarget(entry, depositId);
      if (target) {
        const label = dt('event.link.open', { object: dt(LINK_OBJECT_KEYS[target.object]) });
        link = {
          to: target.to,
          label,
          ariaLabel: dt('event.link.named', { label, subject: heading ?? label }),
        };
      }
    }
    return {
      kind: 'legacy',
      typeLabel: t(typeKey.key, { ns: typeKey.ns }) as string,
      sentence: entry.body.trim() || entry.title?.trim() || '',
      isLegacyText: true,
      detail: null,
      heading,
      link,
      removed,
      repeat,
      afterReached,
    };
  }

  // ── Version 1 rows: rendered from parameters ────────────────────────────────────────────────
  const name = entry.sourceEntityTitle?.trim() || metadata.subjectLabel?.trim() || null;
  const number = name ?? dt('event.noNumber');

  const view = (
    kind: Exclude<SystemEventKind, 'legacy'>,
    sentence: string,
    extra: {
      detail?: string | null;
      heading: string | null;
      linkObject: LinkObject | null;
      linkTo?: string | null;
      linkAria?: (label: string) => string;
    },
  ): SystemEventView => {
    let link: SystemEventLink | null = null;
    if (linkable && extra.linkObject && extra.linkTo) {
      const label = dt('event.link.open', { object: dt(LINK_OBJECT_KEYS[extra.linkObject]) });
      link = {
        to: extra.linkTo,
        label,
        ariaLabel:
          extra.linkAria?.(label) ??
          dt('event.link.named', { label, subject: extra.heading ?? label }),
      };
    }
    return {
      kind,
      typeLabel: t(typeKey.key, { ns: typeKey.ns }) as string,
      sentence,
      isLegacyText: false,
      detail: extra.detail ?? null,
      heading: extra.heading,
      link,
      removed,
      repeat,
      afterReached,
    };
  };

  if (metadata.event === 'milestone_delayed') {
    const m: MilestoneDelayedMetadataV1 = metadata;
    const milestoneName = name ?? ct('navigation.untitledMilestone');
    const sentence = dt('event.sentence.milestoneLate', {
      name: milestoneName,
      late: dt('event.daysLate', { count: m.delayDays }),
      projected: f.formatDate(m.projectedDate),
      target: f.formatDate(m.targetDate),
    });
    return view('milestoneMoved', sentence, {
      heading: milestoneName,
      linkObject: 'milestone',
      linkTo: entry.sourceEntityId ? routeUrl('milestone', { id: entry.sourceEntityId }) : null,
    });
  }

  if (metadata.event === 'invoice_created') {
    const m: InvoiceCreatedMetadataV1 = metadata;
    const isOffer = m.invoiceStatus === 'quotation';
    const object = dt(isOffer ? OBJECT_KEYS.offer : OBJECT_KEYS.invoice);
    const sentence = m.vendorName
      ? dt('event.sentence.recorded', { object, number, company: m.vendorName })
      : dt('event.sentence.recordedNoCompany', { object, number });
    return view('invoiceRecorded', sentence, {
      detail: m.amount !== undefined ? f.formatCurrency(m.amount) : null,
      heading: dt('event.heading.objectNumber', { object, number }),
      linkObject: isOffer ? 'offer' : 'invoice',
      linkTo: entry.sourceEntityId ? routeUrl('invoice', { id: entry.sourceEntityId }) : null,
    });
  }

  // status_changed
  const m: StatusChangedMetadataV1 = metadata;
  const label = (set: UnionKeySet<string>, value: string): string =>
    set.members.includes(value) ? (t(set.key(value), { ns: set.ns }) as string) : value;
  const toLabel = (set: UnionKeySet<string>) => label(set, m.to);
  const fromLabel = (set: UnionKeySet<string>) => (m.from === null ? null : label(set, m.from));
  const amount = m.amount !== undefined ? f.formatCurrency(m.amount) : null;

  if (entry.entryType === 'subsidy_status') {
    const grantName = name ?? dt('event.noName');
    const set = I18N_UNION_KEYS.statusVocabularyGrant;
    const from = fromLabel(set);
    const object = dt(OBJECT_KEYS.grant);
    const sentence =
      from === null
        ? dt('event.sentence.objectNamedChangedTo', { object, name: grantName, to: toLabel(set) })
        : dt('event.sentence.objectNamed', {
            object,
            name: grantName,
            from,
            to: toLabel(set),
          });
    return view('grantStatus', sentence, {
      heading: grantName,
      linkObject: 'grant',
      linkTo: routeUrl('budgetSubsidies'),
    });
  }

  if (entry.entryType === 'invoice_status') {
    const isDeposit = Boolean(m.depositId);
    const set = isDeposit
      ? I18N_UNION_KEYS.statusVocabularyProgressPayment
      : I18N_UNION_KEYS.statusVocabularyInvoice;
    const from = fromLabel(set);
    const to = toLabel(set);
    const kind = m.to === 'paid' ? 'payment' : m.to === 'claimed' ? 'submission' : 'statusChange';
    const invoiceObject = dt(OBJECT_KEYS.invoice);
    const heading = dt('event.heading.objectNumber', { object: invoiceObject, number });
    const invoiceId = entry.sourceEntityId;

    if (isDeposit) {
      const refund = m.depositEntryType === 'refund';
      const object = dt(refund ? OBJECT_KEYS.refund : OBJECT_KEYS.progressPayment);
      let sentence: string;
      if (from === null) {
        sentence = dt('event.sentence.paymentChangedTo', { object, number, to });
      } else if (amount !== null) {
        sentence = dt('event.sentence.paymentAmount', { object, amount, number, from, to });
      } else {
        sentence = dt('event.sentence.payment', { object, number, from, to });
      }
      return view(kind, sentence, {
        heading,
        linkObject: refund ? 'refund' : 'progressPayment',
        linkTo:
          invoiceId && m.depositId
            ? routeUrl('invoice', { id: invoiceId }, { payment: m.depositId })
            : null,
        linkAria: (open) =>
          amount !== null
            ? dt('event.link.paymentNamed', {
                label: open,
                amount,
                number,
                date: f.formatDate(entry.entryDate),
              })
            : dt('event.link.named', { label: open, subject: heading }),
      });
    }

    let sentence: string;
    if (from === null) {
      sentence = dt('event.sentence.objectNumberChangedTo', { object: invoiceObject, number, to });
    } else if (amount !== null && kind === 'payment') {
      sentence = dt('event.sentence.objectNumberAmount', {
        object: invoiceObject,
        number,
        amount,
        from,
        to,
      });
    } else {
      sentence = dt('event.sentence.objectNumber', { object: invoiceObject, number, from, to });
    }
    return view(kind, sentence, {
      heading,
      linkObject: 'invoice',
      linkTo: invoiceId ? routeUrl('invoice', { id: invoiceId }) : null,
    });
  }

  // work_item_status (and any other subject): task wording
  const taskName = name ?? ct('navigation.untitledTask');
  const set = I18N_UNION_KEYS.statusVocabularyTask;
  const from = fromLabel(set);
  const sentence =
    from === null
      ? dt('event.sentence.namedChangedTo', { name: taskName, to: toLabel(set) })
      : dt('event.sentence.named', { name: taskName, from, to: toLabel(set) });
  return view('statusChange', sentence, {
    heading: taskName,
    linkObject: 'task',
    linkTo: entry.sourceEntityId ? routeUrl('workItem', { id: entry.sourceEntityId }) : null,
  });
}

/** Link target of a legacy row, by the stored subject. */
function linkTarget(
  entry: DiaryEntrySummary,
  depositId: string | undefined,
): { to: string; object: LinkObject } | null {
  const id = entry.sourceEntityId;
  if (!id) return null;
  switch (entry.sourceEntityType) {
    case 'work_item':
      return { to: routeUrl('workItem', { id }), object: 'task' };
    case 'invoice':
      return depositId
        ? { to: routeUrl('invoice', { id }, { payment: depositId }), object: 'progressPayment' }
        : { to: routeUrl('invoice', { id }), object: 'invoice' };
    case 'milestone':
      return { to: routeUrl('milestone', { id }), object: 'milestone' };
    case 'subsidy_program':
      return { to: routeUrl('budgetSubsidies'), object: 'grant' };
    default:
      return null;
  }
}
