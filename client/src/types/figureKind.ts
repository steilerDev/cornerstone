/**
 * The closed list of figure kinds (#2232). A UI element whose text is only a Left to spend,
 * Still to pay, Paid or Ready to submit figure, or a holds-up sentence, carries
 * `data-figure="<kind>"`. The E2E consistency registry reads these markers; add a kind here and in
 * `e2e/fixtures/figureSurfaces.ts` together.
 */
export type FigureKind = 'left-to-spend' | 'still-to-pay' | 'paid' | 'ready-to-submit' | 'holds-up';
