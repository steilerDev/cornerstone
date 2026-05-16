import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './OverflowMenu.module.css';

export interface OverflowMenuItem {
  id?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  icon?: ReactNode;
}

export interface OverflowMenuProps {
  items: OverflowMenuItem[];
  triggerAriaLabel: string;
  triggerIcon?: ReactNode;
  placement?: 'bottom-end' | 'top-end';
  disabled?: boolean;
  usePortal?: boolean;
  'data-testid'?: string;
}

export function OverflowMenu({
  items,
  triggerAriaLabel,
  triggerIcon = '⋮',
  placement = 'bottom-end',
  disabled = false,
  usePortal = false,
  'data-testid': dataTestId,
}: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (usePortal && menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, usePortal]);

  // Close menu on scroll and resize when using portal
  useEffect(() => {
    if (!isOpen || !usePortal) return;

    const handleScroll = () => setIsOpen(false);
    const handleResize = () => setIsOpen(false);

    document.addEventListener('scroll', handleScroll, { capture: true });
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, usePortal]);

  // Keyboard navigation
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
      // Focus first item after state updates
      setTimeout(() => {
        const firstMenuItem = menuRef.current?.querySelector(
          '[role="menuitem"]:not(:disabled)',
        ) as HTMLButtonElement;
        firstMenuItem?.focus();
      }, 0);
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const menuItems = menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)');
    if (!menuItems || menuItems.length === 0) return;

    const currentIndex = Array.from(menuItems).findIndex((item) => item === document.activeElement);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = currentIndex === menuItems.length - 1 ? 0 : currentIndex + 1;
        (menuItems[nextIndex] as HTMLButtonElement).focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex === 0 ? menuItems.length - 1 : currentIndex - 1;
        (menuItems[prevIndex] as HTMLButtonElement).focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        (menuItems[0] as HTMLButtonElement).focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        (menuItems[menuItems.length - 1] as HTMLButtonElement).focus();
        break;
      }
      case 'Escape': {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      }
    }
  };

  const handleItemClick = (item: OverflowMenuItem) => {
    setIsOpen(false);
    item.onClick();
  };

  const handleTriggerClick = () => {
    if (usePortal && !isOpen) {
      const rect = triggerRef.current!.getBoundingClientRect();
      setMenuPos({
        top: placement === 'top-end' ? rect.top - 4 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen((v) => !v);
  };

  const menuElement = (
    <div
      ref={menuRef}
      role="menu"
      className={`${styles.menu} ${usePortal ? styles.menuFixed : ''} ${placement === 'top-end' ? styles.menuTop : styles.menuBottom}`}
      onKeyDown={handleMenuKeyDown}
      style={
        usePortal && menuPos
          ? {
              position: 'fixed',
              top: `${menuPos.top}px`,
              right: `${menuPos.right}px`,
              ...(placement === 'top-end' ? { transform: 'translateY(-100%)' } : {}),
            }
          : undefined
      }
    >
      {items.map((item, i) => (
        <button
          key={item.id || `item-${i}`}
          type="button"
          role="menuitem"
          className={`${styles.item} ${item.variant === 'destructive' ? styles.itemDanger : ''}`}
          onClick={() => handleItemClick(item)}
          disabled={item.disabled}
        >
          {item.icon && (
            <span className={styles.itemIcon} aria-hidden="true">
              {item.icon}
            </span>
          )}
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={triggerAriaLabel}
        data-testid={dataTestId}
        disabled={disabled}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
      >
        {triggerIcon}
      </button>
      {isOpen && usePortal ? createPortal(menuElement, document.body) : isOpen && menuElement}
    </div>
  );
}
