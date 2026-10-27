import { useId } from 'react';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { FigureKind } from '../../types/figureKind.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { isPlainLeftClick } from '../../lib/plainClick.js';
import sharedStyles from '../../styles/shared.module.css';
import { factSpans } from './factSpans.js';
import styles from './SummaryStrip.module.css';

interface FactBase {
  readonly id: string;
  readonly label: string;
  /** Visible value; null / '' renders an en dash with a screen-reader "Not set". */
  readonly value: ReactNode | null;
  /** Marks the value element with `data-figure` (consistency registry, #2232). */
  readonly figureKind?: FigureKind;
  /** Default `summary-fact-${id}`. */
  readonly testId?: string;
  /** Spans two grid columns where the strip has room (a value with a trailing remark). */
  readonly wide?: boolean;
}

export type SummaryFact =
  /** Another page (Area, Company, Milestone…): an anchor that carries origin state. */
  | (FactBase & { readonly kind: 'link'; readonly to: string; readonly state?: unknown })
  /** A same-page tab: a real anchor; a plain left click runs `onActivate` instead of navigating. */
  | (FactBase & { readonly kind: 'tab'; readonly href: string; readonly onActivate: () => void })
  /** A plain value with no target (Expected cost on Money). */
  | (FactBase & { readonly kind: 'static' })
  /** Opens a dialog (Documents). */
  | (FactBase & {
      readonly kind: 'button';
      readonly onClick: () => void;
      readonly buttonRef?: Ref<HTMLButtonElement>;
      readonly expanded?: boolean;
    });

export interface SummaryStripProps {
  /** Object type noun for the landmark name: "Task" gives "Task summary". */
  readonly typeLabel: string;
  /** 4 to 7 facts; facts after the 7th are not rendered. */
  readonly facts: readonly SummaryFact[];
  /** Grid columns: 4 (default) or 5 (3 from 768px, 5 from 1024px, 2 below). */
  readonly columns?: 4 | 5;
  readonly testId?: string;
}

export const MAX_SUMMARY_FACTS = 7;

function isEmpty(value: ReactNode | null): boolean {
  return value === null || value === undefined || value === '' || value === false;
}

/** Columns per breakpoint (small, medium, large) for each `columns` setting. */
const BREAKPOINT_COLUMNS = {
  4: { sm: 2, md: 4, lg: 4 },
  5: { sm: 2, md: 3, lg: 5 },
} as const;

interface FactSpansByBreakpoint {
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
}

function Fact({
  fact,
  spans,
}: {
  readonly fact: SummaryFact;
  readonly spans: FactSpansByBreakpoint;
}) {
  const { t } = useTranslation('common');
  const labelId = useId();
  const valueId = useId();
  const empty = isEmpty(fact.value);
  const testId = fact.testId ?? `summary-fact-${fact.id}`;
  const labelledBy = `${labelId} ${valueId}`;

  const content = (
    <span id={valueId} className={styles.valueText} data-figure={fact.figureKind}>
      {empty ? (
        <>
          <span aria-hidden="true">–</span>
          <span className={sharedStyles.srOnly}>{t('summaryStrip.notSet')}</span>
        </>
      ) : (
        fact.value
      )}
    </span>
  );

  let target: ReactNode;
  if (fact.kind === 'link') {
    target = (
      <NavAnchor
        to={fact.to}
        state={fact.state}
        className={styles.target}
        aria-labelledby={labelledBy}
        data-testid={testId}
      >
        {content}
      </NavAnchor>
    );
  } else if (fact.kind === 'static') {
    // No aria-labelledby on a non-interactive span: the dt/dd pairing names it.
    target = (
      <span className={styles.staticTarget} data-testid={testId}>
        {content}
      </span>
    );
  } else if (fact.kind === 'tab') {
    const { onActivate } = fact;
    target = (
      <a
        href={fact.href}
        className={styles.target}
        aria-labelledby={labelledBy}
        onClick={(event) => {
          if (!isPlainLeftClick(event)) return;
          event.preventDefault();
          onActivate();
        }}
        data-testid={testId}
      >
        {content}
      </a>
    );
  } else {
    target = (
      <button
        ref={fact.buttonRef}
        type="button"
        className={`${styles.target} ${styles.buttonTarget}`}
        aria-haspopup="dialog"
        aria-expanded={fact.expanded ?? false}
        aria-labelledby={labelledBy}
        onClick={fact.onClick}
        data-testid={testId}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={styles.fact}
      data-static={fact.kind === 'static' ? 'true' : undefined}
      data-span-sm={spans.sm}
      data-span-md={spans.md}
      data-span-lg={spans.lg}
    >
      <dt id={labelId} className={styles.label}>
        {fact.label}
      </dt>
      <dd className={styles.value}>{target}</dd>
    </div>
  );
}

/**
 * The fact strip under an object's header: 4 to 7 facts, each one a link (another page, a
 * same-page tab), a dialog button (Documents) or a static value. A `<section>` holding a `<dl>`;
 * the interactive element sits in the `<dd>` and its name is the label followed by the value.
 * Values are one line with an ellipsis (the full text stays in the DOM), so never mark them as
 * user text for hyphenation.
 */
export function SummaryStrip({
  typeLabel,
  facts,
  columns = 4,
  testId = 'summary-strip',
}: SummaryStripProps) {
  const { t } = useTranslation('common');
  const shown = facts.slice(0, MAX_SUMMARY_FACTS);
  const wide = shown.map((fact) => fact.wide === true);
  const cols = BREAKPOINT_COLUMNS[columns];
  const sm = factSpans(wide, cols.sm);
  const md = factSpans(wide, cols.md);
  const lg = factSpans(wide, cols.lg);
  return (
    <section
      className={styles.strip}
      aria-label={t('summaryStrip.label', { type: typeLabel })}
      data-testid={testId}
    >
      <dl className={styles.grid} data-columns={columns}>
        {shown.map((fact, index) => (
          <Fact
            key={fact.id}
            fact={fact}
            spans={{ sm: sm[index]!, md: md[index]!, lg: lg[index]! }}
          />
        ))}
      </dl>
    </section>
  );
}
