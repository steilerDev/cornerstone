# Release Summary

## What's New

This release is a reliability and polish pass on the bank report wizard -- the PDFs you hand to a lender now render correctly in every case that was previously fragile, from long German descriptions to multi-page tables. It also adds a configurable login rate limit, a "No Category" option for subsidies, and three security fixes.

### Highlights

- **Report table columns now flow through to the exported PDF.** The Show/Hide columns you toggle in the wizard preview are respected in the downloaded document, not just the on-screen preview.
- **Long rows are handled cleanly.** Descriptions that need to continue onto the next page are now clearly marked as continuations instead of reading like truncated or broken rows.
- **Split invoices are footnoted correctly.** The report now distinguishes an invoice split across budget lines from one split via a deposit tagged to a different source, so the footnote on each row explains the right reason.
- **Editable fields in the report editor have sensible length limits**, so cover letters and usage descriptions stay within what the PDF layout can safely render.
- **Fixed German header word-breaks, a missing timestamp on later report pages, and the page footer's locale**, so multi-page German-language reports read correctly throughout.
- **AI-assisted report generation is now guarded** against switching report type or source while a generation is still in progress, preventing content written for the wrong report from landing in your draft.
- **Configurable login rate limiting.** New `AUTH_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_WINDOW` settings let you tune the login endpoint's rate limit for your household's network setup -- see the [Configuration guide](https://cornerstone.steiler.dev/getting-started/configuration#authentication-rate-limiting).
- **Subsidies can now include uncategorized items.** A subsidy program's applicable-categories picker gained a "No Category" option, so a subsidy can cover budget lines that have no category assigned.
- **Budget source drill-down is deposit-aware.** Instalment-paid invoices now show the correct paid and outstanding split when viewed from a financing source.
- **Failed column-preference saves now surface an error toast** in list views instead of failing silently.

### Security

- Fixed an IPv6 address-normalization bypass in the login rate limiter (CVE-2026-15144).
- Remediated a credential-leak/SSRF vulnerability in the `undici` HTTP client (GHSA-g4rg-993r-mgx8).
- Remediated a vulnerability in the `brace-expansion` dependency (GHSA-rhx6-c78j-4q9w).

## Upgrade

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Schema migrations run automatically on first boot.
