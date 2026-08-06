# Template: RELEASE_SUMMARY.md (docs-writer, epic promotions)

Written at the repo root during each epic promotion; `release.yml` prepends it to the auto-generated GitHub Release notes. Write for end users — no commit hashes, PR numbers, or internal jargon. The file persists and is overwritten each promotion; if absent (e.g., hotfix releases), CI falls back to auto-generated notes.

```markdown
## What's New

Brief 2-3 sentence prose summary for end users.

### Highlights

- **Feature A** — concise description
- **Feature B** — concise description

### Breaking Changes

- Description of any breaking change and migration steps (omit section if none)

### Known Issues

- Description of known limitations or bugs (omit section if none)
```
