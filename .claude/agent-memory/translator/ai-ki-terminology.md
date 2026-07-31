---
name: ai-ki-terminology
description: German user-facing copy always renders "AI" as "KI" (Künstliche Intelligenz), never as "AI" or "AI-Unterstützung"
metadata:
  type: project
---

Existing precedent in `client/src/i18n/de/budget.json`: `autoItemize.extractionStarted` translates
"Analyzing document with AI…" as "Dokument wird mit KI analysiert…" — this predates the AI report
content feature (issue #1901) and establishes "KI" as the settled term for the abbreviation in
UI copy aimed at end users.

Distinct from this: backend `LLM_*` error codes (`errors.json`) translate "LLM"/"extraction
service" as "Extraktionsdienst", not "KI" — that's a different concept (the service) rather than
the technology label shown to users, so don't conflate the two when translating error strings vs.
UI labels.

**Why:** a dev-team-lead Translator Spec for #1901 asked to flag "AI-Unterstützung" as a future
glossary candidate. That term is not idiomatic German — flagged "KI-Unterstützung" instead when
reporting back, and used "KI-Unterstützung aktivieren" / "Mit KI generieren" / "KI-Generierung
fehlgeschlagen" for the new report content generation keys (`sourceReports.settingsStep.*`,
`sourceReports.editable.*`).

**How to apply:** whenever a spec or English string contains literal "AI", translate/gloss it as
"KI" in German UI copy. If proposing a glossary addition for "AI assistance"/"AI-generated" style
terms, propose "KI-Unterstützung" / "KI-generiert", not a literal "AI-" transliteration.
