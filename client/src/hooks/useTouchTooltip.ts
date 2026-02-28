/**
 * useTouchTooltip — two-tap touch interaction for Gantt/Calendar items.
 *
 * On touch-primary devices (`pointer: coarse`):
 *   - First tap on an item: shows tooltip (calls onShowTooltip), does NOT navigate.
 *   - Second tap on the SAME item: navigates (calls onNavigate).
 *   - Tap on a DIFFERENT item: shows the new item's tooltip.
 *   - Tap anywhere else: clears the active tooltip item.
 *
 * On pointer-primary devices, the hook returns `isTouchDevice = false` and callers
 * should fall back to the standard hover/click behaviour.
 *
 * Usage:
 *   const { isTouchDevice, activeTouchId, handleTouchTap } = useTouchTooltip();
 *
 *   // In the item's click handler:
 *   onClick={() => {
 *     if (isTouchDevice) {
 *       handleTouchTap(item.id, () => navigate(`/work-items/${item.id}`));
 *     } else {
 *       navigate(`/work-items/${item.id}`);
 *     }
 *   }}
 *
 *   // Show tooltip when activeTouchId === item.id
 */

import { useState, useCallback, useEffect, useRef } from 'react';

function isTouchPrimary(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export interface UseTouchTooltipResult {
  /** True when the device is touch-primary (pointer: coarse). */
  isTouchDevice: boolean;
  /** ID of the item that received the first tap and is showing its tooltip. */
  activeTouchId: string | null;
  /**
   * Call this from an item's onClick (or onTouchEnd) handler on touch devices.
   * On first tap: sets activeTouchId to itemId (triggers tooltip show in caller).
   * On second tap of the same item: clears activeTouchId and calls onNavigate().
   * On tap of a different item: sets activeTouchId to the new item.
   *
   * @param itemId - ID of the tapped item.
   * @param onNavigate - Navigation callback to invoke on the confirming tap.
   */
  handleTouchTap: (itemId: string, onNavigate: () => void) => void;
  /** Programmatically clear the active touch tooltip (e.g. on scroll or modal open). */
  clearActiveTouchId: () => void;
}

/**
 * Hook implementing two-tap touch interaction for list/chart items.
 *
 * Returns touch interaction state and a tap handler.  Callers attach the returned
 * handler to their onClick (which fires for both touch and pointer events).
 */
export function useTouchTooltip(): UseTouchTooltipResult {
  const [isTouchDevice, setIsTouchDevice] = useState(() => isTouchPrimary());
  const [activeTouchId, setActiveTouchId] = useState<string | null>(null);

  // Ref so the handler closure always sees the latest activeTouchId (sync via effect to avoid
  // "Cannot update ref during render" lint error while ensuring handler always reads latest value)
  const activeTouchIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeTouchIdRef.current = activeTouchId;
  }, [activeTouchId]);

  // Respond to media query changes (e.g. connecting a mouse to a touch device)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(pointer: coarse)');
    const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const clearActiveTouchId = useCallback(() => {
    setActiveTouchId(null);
  }, []);

  const handleTouchTap = useCallback((itemId: string, onNavigate: () => void) => {
    const current = activeTouchIdRef.current;
    if (current === itemId) {
      // Second tap on the same item — navigate and clear
      setActiveTouchId(null);
      onNavigate();
    } else {
      // First tap (or tap on a different item) — show tooltip
      setActiveTouchId(itemId);
    }
  }, []);

  return { isTouchDevice, activeTouchId, handleTouchTap, clearActiveTouchId };
}
