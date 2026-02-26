interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Cornerstone logo — a 3D isometric brick wall corner viewed from above.
 *
 * The design shows two wall faces meeting at an outside corner, rendered as a
 * hexagonal silhouette with chevron-shaped mortar-line cutouts (even-odd fill).
 * The cornerstone at the base is the largest solid block (5 units), separated
 * from the smaller brick courses above (3 units each) by a thick mortar gap.
 *
 * Isometric projection uses a 3:2 slope (~34° viewing angle) for a "half top"
 * viewpoint. All coordinates are integers for crisp rendering at small sizes.
 *
 * Reads clearly at both 16 px (favicon) and 200 px (splash).
 *
 * Uses `currentColor` for all fills so it inherits the text colour of its
 * container and works correctly in both light and dark contexts with no
 * hardcoded hex values.
 *
 * Accessible: role="img" + aria-label so screen readers announce "Cornerstone".
 */
export function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Cornerstone"
      className={className}
    >
      {/*
       * The shape is drawn as a single compound path using the even-odd fill
       * rule so the mortar lines punch through as transparent gaps — giving
       * the brick coursing pattern without needing a background colour.
       *
       * Outer shape: hexagonal silhouette of two wall faces meeting at a corner.
       * Inner cutouts: three chevron-shaped mortar lines (one thick for the
       * cornerstone separator, two thin for brick course separators).
       */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d={[
          // --- Outer silhouette (hexagonal, clockwise) ---
          'M 16 28',
          'L 7 22',
          'L 7 4',
          'L 16 10',
          'L 25 4',
          'L 25 22',
          'Z',

          // --- Thick mortar — cornerstone separator (2-unit gap) ---
          'M 7 17',
          'L 16 23',
          'L 25 17',
          'L 25 15',
          'L 16 21',
          'L 7 15',
          'Z',

          // --- Thin mortar 1 — brick course separator (1-unit gap) ---
          'M 7 12',
          'L 16 18',
          'L 25 12',
          'L 25 11',
          'L 16 17',
          'L 7 11',
          'Z',

          // --- Thin mortar 2 — brick course separator (1-unit gap) ---
          'M 7 8',
          'L 16 14',
          'L 25 8',
          'L 25 7',
          'L 16 13',
          'L 7 7',
          'Z',
        ].join(' ')}
      />
    </svg>
  );
}
