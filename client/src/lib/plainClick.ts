/** True for an unmodified primary-button click that nothing has prevented. */
export function isPlainLeftClick(e: {
  button: number;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  return (
    e.button === 0 && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.defaultPrevented
  );
}
