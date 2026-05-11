import { useState, useRef, useEffect, type ReactNode } from 'react';
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
  'data-testid'?: string;
}

export function OverflowMenu({
  items,
  triggerAriaLabel,
  triggerIcon = '⋮',
  placement = 'bottom-end',
  disabled = false,
  'data-testid': dataTestId,
}: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Keyboard navigation
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
      // Focus first item after state updates
      setTimeout(() => {
        const firstMenuItem = menuRef.current?.querySelector(
          '[role="menuitem"]',
        ) as HTMLButtonElement;
        firstMenuItem?.focus();
      }, 0);
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const menuItems = menuRef.current?.querySelectorAll('[role="menuitem"]');
    if (!menuItems || menuItems.length === 0) return;

    const currentIndex = Array.from(menuItems).findIndex(
      (item) => item === document.activeElement,
    );

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
        onClick={() => setIsOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
      >
        {triggerIcon}
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className={`${styles.menu} ${placement === 'top-end' ? styles.menuTop : styles.menuBottom}`}
          onKeyDown={handleMenuKeyDown}
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
      )}
    </div>
  );
}
