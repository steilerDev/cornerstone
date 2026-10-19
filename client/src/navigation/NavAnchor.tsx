import type { AnchorHTMLAttributes, ReactNode, Ref } from 'react';
import { useHref, useLinkClickHandler } from 'react-router-dom';
import { isPlainLeftClick } from '../lib/plainClick.js';

export interface NavAnchorProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href' | 'onClick'
> {
  /** In-app path from navHref()/routeUrl(); never a string literal. */
  readonly to: string;
  readonly replace?: boolean;
  /** Router location state for the in-app navigation (e.g. a dialog background). */
  readonly state?: unknown;
  /**
   * Runs before the in-app navigation (e.g. close the sheet), only for a plain left click on an
   * anchor without a `target`. Modified and middle clicks open elsewhere and leave the page as is.
   */
  readonly onNavigate?: () => void;
  /** The anchor element (React 19 passes `ref` as a prop). */
  readonly ref?: Ref<HTMLAnchorElement>;
  readonly children: ReactNode;
}

/**
 * Real anchor (middle-click and copy-link work) that navigates in-app on a plain click.
 * Same technique as Breadcrumbs and UserMenu; deliberately not a react-router Link.
 */
export function NavAnchor({ to, replace, state, onNavigate, children, ...rest }: NavAnchorProps) {
  const href = useHref(to);
  const handleClick = useLinkClickHandler<HTMLAnchorElement>(to, {
    ...(replace === undefined ? {} : { replace }),
    ...(state === undefined ? {} : { state }),
  });
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        if (rest.target === undefined && isPlainLeftClick(event)) onNavigate?.();
        handleClick(event);
      }}
    >
      {children}
    </a>
  );
}
