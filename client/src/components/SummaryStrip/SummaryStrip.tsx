import { useId } from 'react';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { FigureKind } from '../../types/figureKind.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { isPlainLeftClick } from '../../lib/plainClick.js';
import sharedStyles from '../../styles/shared.module.css';
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
}

export type SummaryFact =
  /** Another page (Area, Company, Milestone…): an anchor that carries origin state. */
  | (FactBase & { readonly kind: 'link'; readonly to: string; readonly state?: unknown })
  /** A same-page tab: a real anchor; a plain left click runs `onActivate` instead of navigating. */
  | (FactBase & { readonly kind: 'tab'; readonly href: string; readonly onActivate: () => void })
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
  readonly testId?: string;
}

export const MAX_SUMMARY_FACTS = 7;

function isEmpty(value: ReactNode | null): boolean {
  return value === null || value === undefined || value === '' || value === false;
}

function Fact({ fact }: { readonly fact: SummaryFact }) {
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
    <div className={styles.fact}>
      <dt id={labelId} className={styles.label}>
        {fact.label}
      </dt>
      <dd className={styles.value}>{target}</dd>
    </div>
  );
}

/**
 * The fact strip under an object's header: 4 to 7 facts, each one a link (another page, a
 * same-page tab) or, for Documents, a button that opens a dialog. A `<section>` holding a `<dl>`;
 * the interactive element sits in the `<dd>` and its name is the label followed by the value.
 * Values are one line with an ellipsis (the full text stays in the DOM), so never mark them as
 * user text for hyphenation.
 */
export function SummaryStrip({ typeLabel, facts, testId = 'summary-strip' }: SummaryStripProps) {
  const { t } = useTranslation('common');
  return (
    <section
      className={styles.strip}
      aria-label={t('summaryStrip.label', { type: typeLabel })}
      data-testid={testId}
    >
      <dl className={styles.grid}>
        {facts.slice(0, MAX_SUMMARY_FACTS).map((fact) => (
          <Fact key={fact.id} fact={fact} />
        ))}
      </dl>
    </section>
  );
}
