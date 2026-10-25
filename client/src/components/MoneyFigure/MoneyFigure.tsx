import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { FigureKind } from '../../types/figureKind.js';
import styles from './MoneyFigure.module.css';

export interface MoneyFigureExplanation {
  /** "How is this calculated?" */
  readonly toggleLabel: string;
  readonly content: ReactNode;
}

export interface MoneyFigureProps {
  /** Heading text. */
  readonly label: string;
  readonly headingLevel?: 2 | 3;
  /** Muted text after the label ("Whole project"). */
  readonly labelSuffix?: string | null;
  /** Formatted figure; null renders an en dash named by `noFigureLabel`. */
  readonly figure: string | null;
  readonly noFigureLabel: string;
  /** Danger text colour on the figure. */
  readonly negative?: boolean;
  /** Marks the figure element with `data-figure`. */
  readonly figureKind?: FigureKind;
  /** E.g. a verdict Badge, right of the figure. */
  readonly verdict?: ReactNode;
  /** Line under the figure. */
  readonly range?: string | null;
  /** Line under the range. */
  readonly detail?: ReactNode;
  readonly explanation?: MoneyFigureExplanation;
  readonly testId?: string;
}

/**
 * A headline money figure card: heading, the figure (alone in its element), a verdict, the range
 * and a "How is this calculated?" disclosure. All text comes in through props.
 */
export function MoneyFigure({
  label,
  headingLevel = 2,
  labelSuffix,
  figure,
  noFigureLabel,
  negative = false,
  figureKind,
  verdict,
  range,
  detail,
  explanation,
  testId = 'money-figure',
}: MoneyFigureProps) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <section className={styles.card} aria-labelledby={headingId} data-testid={testId}>
      <Heading id={headingId} className={styles.label}>
        {label}
        {labelSuffix ? <span className={styles.suffix}> {labelSuffix}</span> : null}
      </Heading>
      <div className={styles.figureRow}>
        {figure !== null ? (
          <span
            className={styles.figure}
            data-negative={negative ? 'true' : undefined}
            data-figure={figureKind}
            data-testid={`${testId}-figure`}
          >
            {figure}
          </span>
        ) : (
          <span
            className={styles.figure}
            role="img"
            aria-label={noFigureLabel}
            data-figure={figureKind}
            data-testid={`${testId}-figure`}
          >
            –
          </span>
        )}
        {verdict ? (
          <span className={styles.verdict} data-testid={`${testId}-verdict`}>
            {verdict}
          </span>
        ) : null}
      </div>
      {range ? (
        <p className={styles.range} data-testid={`${testId}-range`}>
          {range}
        </p>
      ) : null}
      {detail ? <p className={styles.detail}>{detail}</p> : null}
      {explanation ? (
        <>
          <button
            type="button"
            className={styles.explainToggle}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((prev) => !prev)}
            data-testid={`${testId}-explain-toggle`}
          >
            {explanation.toggleLabel}
          </button>
          <div
            id={panelId}
            className={styles.explain}
            hidden={!open}
            data-testid={`${testId}-explain`}
          >
            {explanation.content}
          </div>
        </>
      ) : null}
    </section>
  );
}
