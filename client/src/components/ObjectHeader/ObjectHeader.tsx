import { useEffect, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { useHref, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { OverflowMenu } from '../OverflowMenu/index.js';
import type { OverflowMenuEntry, OverflowMenuItem } from '../OverflowMenu/index.js';
import { PageTitle } from '../PageLayout/PageTitle.js';
import { StatusMenu } from '../StatusMenu/StatusMenu.js';
import type { StatusMenuProps } from '../StatusMenu/StatusMenu.js';
import { useToast } from '../Toast/ToastContext.js';
import { useEntriesLanguage } from '../../contexts/HouseNameContext.js';
import { copyText } from '../../lib/copyText.js';
import { userTextProps } from '../../lib/userText.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import styles from './ObjectHeader.module.css';

export type ObjectHeaderPrimary<S extends string = string> =
  /** A status move: StatusMenu `action` (date chips and Undo stay StatusMenu's). */
  | {
      readonly kind: 'status';
      readonly status: Omit<StatusMenuProps<S>, 'appearance' | 'className'> & {
        readonly actionTo: S;
      };
    }
  /** In-app navigation, e.g. Log or Convert to invoice. `to` comes from routeUrl / useCreateEntryLink. */
  | {
      readonly kind: 'link';
      readonly label: string;
      readonly to: string;
      readonly state?: unknown;
      readonly testId: string;
    }
  /** Opens a dialog or runs an action on the page. */
  | {
      readonly kind: 'button';
      readonly label: string;
      readonly onClick: () => void;
      readonly busy?: boolean;
      readonly testId: string;
    };

export interface ObjectHeaderProps<S extends string = string> {
  /** The object's name (user content). */
  readonly title: string;
  /** false when `title` is a translated fallback ("Untitled task"): no lang, no hyphenation. Default true. */
  readonly titleIsUserText?: boolean;
  /** `PageBreadcrumbs` node (it portals itself into the top bar). */
  readonly breadcrumbs?: ReactNode;
  /** The one status slot: a StatusMenu chip or a Badge. */
  readonly status?: ReactNode;
  /** Exactly one primary; required. */
  readonly primary: ObjectHeaderPrimary<S>;
  /** At most one secondary; the page renders it with `btnSecondary`. */
  readonly secondary?: ReactNode;
  /** ⋯ menu. Copy link and Print are always present; Delete only with `onDelete`. */
  readonly menu?: {
    readonly onDelete?: () => void;
    readonly extraItems?: readonly OverflowMenuItem[];
  };
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly testId?: string;
}

interface PrimaryControlProps<S extends string> {
  readonly primary: ObjectHeaderPrimary<S>;
  readonly className: string | undefined;
}

/**
 * Renders the primary with the class its host supplies. This indirection is deliberate: the
 * pattern baseline counts primary buttons statically (`className={X.Y}` resolving to a
 * `--color-primary` background), and the header must count as exactly one, whatever kind of
 * primary it shows. Do not "simplify" it into three `styles.primary` usages.
 */
function PrimaryControl<S extends string>({ primary, className }: PrimaryControlProps<S>) {
  if (primary.kind === 'status') {
    return <StatusMenu<S> {...primary.status} appearance="action" className={className} />;
  }
  if (primary.kind === 'link') {
    return (
      <NavAnchor
        to={primary.to}
        state={primary.state}
        className={className}
        data-testid={primary.testId}
      >
        {primary.label}
      </NavAnchor>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-disabled={primary.busy ? 'true' : undefined}
      aria-busy={primary.busy ? 'true' : undefined}
      onClick={() => {
        if (!primary.busy) primary.onClick();
      }}
      data-testid={primary.testId}
    >
      {primary.label}
    </button>
  );
}

/**
 * The header of an object page: the h1 (plain text, never click-to-edit), one status slot, at
 * most one secondary, exactly one primary and the ⋯ page menu (Copy link, Print, Delete). DOM
 * order is the visual and tab order: title, status, secondary, primary, ⋯. Use it as the
 * `header` of `PageLayout`; hosts own the Delete `ConfirmDialog`.
 */
export function ObjectHeader<S extends string = string>({
  title,
  titleIsUserText = true,
  breadcrumbs,
  status,
  primary,
  secondary,
  menu,
  headingRef,
  testId = 'object-header',
}: ObjectHeaderProps<S>) {
  const { t } = useTranslation('common');
  const { showToast } = useToast();
  const location = useLocation();
  const entriesLanguage = useEntriesLanguage();
  const tab = new URLSearchParams(location.search).get('tab');
  // Only the tab survives into a shared link; transient params (depError, payment, edit) do not.
  const linkHref = useHref(`${location.pathname}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`);
  const printFrameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (printFrameRef.current !== null) cancelAnimationFrame(printFrameRef.current);
    },
    [],
  );

  const copyLink = () => {
    void copyText(`${window.location.origin}${linkHref}`).then((ok) => {
      if (ok) showToast('info', t('objectHeader.linkCopied'));
      else showToast('error', t('objectHeader.linkCopyFailed'));
    });
  };

  // The menu has closed by the next frame, so it is not part of the printout.
  const print = () => {
    printFrameRef.current = requestAnimationFrame(() => {
      printFrameRef.current = null;
      window.print();
    });
  };

  const items: OverflowMenuEntry[] = [
    {
      id: 'copy-link',
      label: t('objectHeader.copyLink'),
      onClick: copyLink,
      testId: 'object-header-copy-link',
    },
    { id: 'print', label: t('objectHeader.print'), onClick: print, testId: 'object-header-print' },
    ...(menu?.extraItems ?? []),
    ...(menu?.onDelete
      ? [
          { kind: 'separator' as const, id: 'delete-separator' },
          {
            id: 'delete',
            label: t('button.delete'),
            variant: 'destructive' as const,
            onClick: menu.onDelete,
            testId: 'object-header-delete',
          },
        ]
      : []),
  ];

  const titleProps: { lang?: string; className?: string } = titleIsUserText
    ? userTextProps(entriesLanguage, styles.title)
    : { className: styles.title };

  return (
    <div className={styles.root} data-testid={testId}>
      {breadcrumbs}
      <header className={secondary ? `${styles.row} ${styles.hasSecondary}` : styles.row}>
        <PageTitle
          title={title}
          headingRef={headingRef}
          lang={titleProps.lang}
          className={titleProps.className}
        />
        {status ? <div className={styles.status}>{status}</div> : null}
        {secondary ? <div className={styles.secondary}>{secondary}</div> : null}
        <div className={styles.actionSlot}>
          <PrimaryControl primary={primary} className={styles.primary} />
        </div>
        <div className={styles.menu}>
          <OverflowMenu
            items={items}
            triggerIcon="⋯"
            triggerAriaLabel={t('objectHeader.pageActions')}
            data-testid="object-header-menu"
          />
        </div>
      </header>
    </div>
  );
}
