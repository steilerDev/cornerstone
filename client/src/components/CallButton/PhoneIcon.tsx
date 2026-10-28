export interface PhoneIconProps {
  readonly className?: string;
}

/** The one phone glyph (14px, decorative) shared by CallButton and the ObjectHeader `tel` primary. */
export function PhoneIcon({ className }: PhoneIconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M3 2.5h3l1 3-1.5 1a8 8 0 0 0 4 4l1-1.5 3 1v3a1.5 1.5 0 0 1-1.5 1.5A11 11 0 0 1 1.5 4 1.5 1.5 0 0 1 3 2.5z" />
    </svg>
  );
}
