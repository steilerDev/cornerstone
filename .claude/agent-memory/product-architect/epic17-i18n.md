---
name: EPIC-17 i18n Architecture
description: Internationalization architecture decisions for EPIC-17 (English + German, currency env var, react-i18next)
type: project
---

EPIC-17 adds i18n support with English and German. ADR-021.

**Why:** Cornerstone targets German homeowners; UI must be available in German with locale-aware formatting.

**How to apply:**
- Library: react-i18next (pure JS, no native binaries)
- Translations: statically bundled in `client/src/i18n/{en,de}/*.json` (11 namespaces per language)
- Locale stored as user preference (key: `locale`, values: `en|de|system`) -- no schema changes
- LocaleContext mirrors ThemeContext pattern (localStorage + server sync)
- CURRENCY env var (default EUR) exposed via `GET /api/config` (public, no auth)
- Formatters gain locale/currency params; `useFormatters()` hook wraps them
- Error translation: client-side from ErrorCode using `errors` namespace
- ADR-021 documents full design including namespace structure, key conventions, detection order
- API Contract updated: GET /api/config + added to unprotected routes
- Architecture.md updated: i18n section + CURRENCY in Core env vars table
