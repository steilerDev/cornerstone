## What's New

This release focuses on internal code quality and accessibility improvements. No new user-facing features were added -- instead, duplicated logic across Work Items and Household Items was consolidated into shared patterns, and UI consistency was improved across all entity detail pages.

### Highlights

- **Improved Accessibility** -- All interactive elements now show `:focus-visible` indicators, status messages use `role="status"` and `role="alert"` attributes, and touch targets meet the 44px minimum for comfortable mobile use
- **Consistent Error Handling** -- All detail pages now display structured 404 and error states with a uniform layout, instead of each page implementing its own error display
- **Reduced Code Duplication** -- Budget, subsidy, and payback logic that was duplicated between Work Items and Household Items has been extracted into shared service factories and React components, reducing detail page code by approximately 25%
- **Harmonized Design Tokens** -- Semantic CSS custom properties are now used consistently across all entity views, with proper dark mode support throughout
