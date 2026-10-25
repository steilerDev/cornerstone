import { useLayoutEffect, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { AnchoredPanel } from '../Modal/AnchoredPanel.js';
import { Sheet } from '../Modal/Sheet.js';
import { getFocusableElements } from '../Modal/useFocusTrap.js';
import shared from '../../styles/shared.module.css';
import styles from './ObjectListFiltersPanel.module.css';

export interface ObjectListFiltersPanelLabels {
  /** "Filters" */
  readonly button: string;
  /** "Filters, 2 active" (the button's accessible name when count > 0) */
  readonly buttonActive: (count: number) => string;
  readonly done: string;
  readonly clear: string;
  /** Panel / sheet name; defaults to `button`. */
  readonly title?: string;
}

export interface ObjectListFiltersPanelProps {
  /** DOM ids `${idPrefix}-panel` / `${idPrefix}-sheet`. */
  readonly idPrefix: string;
  /** `${p}-button`, `${p}-panel`, `${p}-sheet`, `${p}-sheet-clear`, `${p}-done`. */
  readonly testIdPrefix: string;
  readonly activeCount: number;
  readonly labels: ObjectListFiltersPanelLabels;
  readonly onClear: () => void;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  /** Default `shared.btnSecondaryCompact`. */
  readonly buttonClassName?: string;
  /** Rendered after the button label instead of the active-count bubble. */
  readonly buttonSuffix?: ReactNode;
  /** Clear and Done under the anchored panel's fields, as the sheet has. */
  readonly panelFooter?: boolean;
  readonly children: ReactNode;
}

/**
 * The Filters button and the surface it opens: an anchored panel from 768px, a bottom Sheet
 * below. The host supplies the fields as children. Neither Done nor Clear is a primary button.
 */
export function ObjectListFiltersPanel({
  idPrefix,
  testIdPrefix,
  activeCount,
  labels,
  onClear,
  buttonRef,
  buttonClassName = shared.btnSecondaryCompact,
  buttonSuffix,
  panelFooter = false,
  children,
}: ObjectListFiltersPanelProps) {
  const location = useLocation();
  const isWide = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  // The anchored panel mounts its children a pass after `open`, so the node is tracked in state.
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const panelId = `${idPrefix}-panel`;
  const sheetId = `${idPrefix}-sheet`;
  const title = labels.title ?? labels.button;

  const close = () => {
    setOpen(false);
    buttonRef.current!.focus();
  };

  // The anchored panel does not focus itself; the Sheet does.
  useLayoutEffect(() => {
    if (!open || !isWide || !contentNode) return;
    getFocusableElements(contentNode)[0]?.focus();
  }, [open, isWide, contentNode]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={isWide ? panelId : sheetId}
        aria-label={activeCount > 0 ? labels.buttonActive(activeCount) : undefined}
        onClick={() => setOpen((prev) => !prev)}
        data-testid={`${testIdPrefix}-button`}
      >
        {labels.button}
        {buttonSuffix ??
          (activeCount > 0 ? (
            <span className={shared.filtersToggleCount}>{activeCount}</span>
          ) : null)}
      </button>

      {isWide ? (
        <AnchoredPanel
          open={open}
          anchorRef={buttonRef}
          role="dialog"
          id={panelId}
          ariaLabel={title}
          trapFocus
          closeSignal={location.pathname}
          onDismiss={(reason) => {
            if (reason === 'route') setOpen(false);
            else close();
          }}
          testId={`${testIdPrefix}-panel`}
        >
          <div ref={setContentNode} className={styles.panel}>
            {children}
            {panelFooter ? (
              <div className={`${styles.sheetFooter} ${styles.panelFooter}`}>
                <button
                  type="button"
                  className={shared.btnText}
                  onClick={onClear}
                  data-testid={`${testIdPrefix}-panel-clear`}
                >
                  {labels.clear}
                </button>
                <button
                  type="button"
                  className={shared.btnSecondary}
                  onClick={close}
                  data-testid={`${testIdPrefix}-panel-done`}
                >
                  {labels.done}
                </button>
              </div>
            ) : null}
          </div>
        </AnchoredPanel>
      ) : (
        <Sheet
          id={sheetId}
          open={open}
          onClose={close}
          title={title}
          returnFocusRef={buttonRef}
          testId={`${testIdPrefix}-sheet`}
          footer={
            <div className={styles.sheetFooter}>
              <button
                type="button"
                className={shared.btnText}
                onClick={onClear}
                data-testid={`${testIdPrefix}-sheet-clear`}
              >
                {labels.clear}
              </button>
              <button
                type="button"
                className={shared.btnSecondary}
                onClick={close}
                data-testid={`${testIdPrefix}-done`}
              >
                {labels.done}
              </button>
            </div>
          }
        >
          {children}
        </Sheet>
      )}
    </>
  );
}
