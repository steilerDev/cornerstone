import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { isCountedObjectTab } from './objectTabIds.js';
import type { CountedObjectTabId, ObjectTabId } from './objectTabIds.js';
import type { ObjectTabsController } from './useObjectTabs.js';
import styles from './ObjectTabs.module.css';

export interface ObjectTabsProps {
  readonly controller: ObjectTabsController;
  /** "Task" gives the tablist the name "Task sections". */
  readonly typeLabel: string;
  /** Only Cost, Payments and Site diary; undefined / null hides the number (loading). */
  readonly counts?: Partial<Record<CountedObjectTabId, number | null>>;
  /** Mounted on the first visit of a tab, then kept mounted and `hidden` while inactive. */
  readonly panels: Partial<Record<ObjectTabId, () => ReactNode>>;
  readonly idPrefix?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface PanelProps {
  readonly id: string;
  readonly testId: string;
  readonly tabId: string;
  readonly objectTab: ObjectTabId;
  readonly active: boolean;
  readonly bare: boolean;
  readonly children: ReactNode;
  readonly pendingFocusRef: RefObject<ObjectTabId | null>;
}

function Panel({
  id,
  testId,
  tabId,
  objectTab,
  active,
  bare,
  children,
  pendingFocusRef,
}: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  // The panel is a tab stop only when it holds nothing focusable itself.
  useLayoutEffect(() => {
    const el = ref.current!;
    if (bare) return;
    if (el.querySelector(FOCUSABLE) === null) el.setAttribute('tabindex', '0');
    else if (el.getAttribute('tabindex') === '0') el.removeAttribute('tabindex');
  });

  // A SummaryStrip tab fact asked for the panel heading to take focus.
  useLayoutEffect(() => {
    const el = ref.current!;
    if (!active || pendingFocusRef.current !== objectTab) return;
    pendingFocusRef.current = null;
    const target = el.querySelector<HTMLElement>('h2') ?? el;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  }, [active, objectTab, pendingFocusRef]);

  if (bare) {
    return (
      <div ref={ref} className={styles.panel}>
        {children}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      id={id}
      role="tabpanel"
      aria-labelledby={tabId}
      hidden={!active}
      className={styles.panel}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/**
 * ARIA tabs for an object page (Overview · Timing · Work · Cost · Payments · Site diary ·
 * History), driven by `useObjectTabs`. Automatic activation (arrows, Home, End), roving tabindex,
 * lazily mounted panels that stay mounted once visited. A single applicable tab renders no
 * tablist, only its panel.
 */
export function ObjectTabs({
  controller,
  typeLabel,
  counts,
  panels,
  idPrefix = 'object-tabs',
}: ObjectTabsProps) {
  const { t } = useTranslation('common');
  const baseId = useId();
  const { tabs, active, select, pendingPanelFocus } = controller;
  const [visited, setVisited] = useState<ReadonlySet<ObjectTabId>>(() => new Set([active]));
  const tabsRef = useRef<Partial<Record<ObjectTabId, HTMLButtonElement | null>>>({});
  const mountedRef = useRef(false);

  // A tab joins the visited set the first time it is active.
  if (!visited.has(active)) setVisited(new Set([...visited, active]));

  // The selected tab scrolls into view on mount and on change (phones scroll the row).
  useEffect(() => {
    const el = tabsRef.current[active];
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: reduced || !mountedRef.current ? 'auto' : 'smooth',
    });
    mountedRef.current = true;
  }, [active]);

  const tabDomId = (id: ObjectTabId) => `${idPrefix}-${baseId}-tab-${id}`;
  const panelDomId = (id: ObjectTabId) => `${idPrefix}-${baseId}-panel-${id}`;
  const single = tabs.length <= 1;

  const labelFor = (id: ObjectTabId): string => {
    const label = t(I18N_UNION_KEYS.objectTab.key(id));
    if (!isCountedObjectTab(id)) return label;
    const count = counts?.[id];
    return typeof count === 'number' ? t('objectTabs.withCount', { label, count }) : label;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.indexOf(active);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const id = tabs[next] as ObjectTabId;
    select(id);
    tabsRef.current[id]!.focus();
  };

  return (
    <div className={styles.root} data-testid={idPrefix}>
      {!single && (
        <div
          role="tablist"
          aria-label={t('objectTabs.listLabel', { type: typeLabel })}
          className={styles.tablist}
          onKeyDown={onKeyDown}
        >
          {tabs.map((id) => {
            const selected = id === active;
            return (
              <button
                key={id}
                ref={(el) => {
                  tabsRef.current[id] = el;
                }}
                type="button"
                role="tab"
                id={tabDomId(id)}
                aria-selected={selected}
                aria-controls={panelDomId(id)}
                tabIndex={selected ? 0 : -1}
                className={selected ? `${styles.tab} ${styles.tabSelected}` : styles.tab}
                onClick={() => select(id)}
                data-testid={`${idPrefix}-tab-${id}`}
              >
                {labelFor(id)}
              </button>
            );
          })}
        </div>
      )}
      {tabs.map((id) => {
        const render = panels[id];
        if (!render || !visited.has(id)) return null;
        return (
          <Panel
            key={id}
            id={panelDomId(id)}
            testId={`${idPrefix}-panel-${id}`}
            tabId={tabDomId(id)}
            objectTab={id}
            active={id === active}
            bare={single}
            pendingFocusRef={pendingPanelFocus}
          >
            {render()}
          </Panel>
        );
      })}
    </div>
  );
}
