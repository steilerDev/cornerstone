---
sidebar_position: 8
title: Auto-itemize Invoices
---

# Auto-itemize Invoices

When a vendor sends you a PDF invoice, Cornerstone can read the line items off the page for you and turn them into budget lines you only need to review -- not type out. You scan or import the invoice into Paperless-ngx, link it to a Cornerstone invoice, and click **Auto-itemize**. A language model reads the OCR text and proposes one budget line per row on the invoice. You edit, accept, and assign each line to the work item or household item it belongs to.

This feature is **opt-in** and disabled by default. You connect Cornerstone to any LLM provider that speaks the OpenAI chat-completions API -- Google Gemini, Anthropic, OpenAI, or a self-hosted model running on your own machine. Cornerstone never sends the binary PDF off your server; only the OCR text and a few invoice details (vendor name, total, date) leave your host.

## Prerequisites

Before you can auto-itemize, three things must be in place:

1. **Paperless-ngx is configured.** Auto-itemize reads the OCR text Paperless produces, so the document integration must be active. See [Documents Setup](/guides/documents/setup) if you have not configured it yet.
2. **An LLM provider is configured.** Cornerstone needs an LLM endpoint to send the OCR text to (next section).
3. **At least one Paperless document is linked to the invoice you want to itemize.** See [Linking Documents](/guides/documents/linking-documents).

When all three are in place, the **Auto-itemize** button appears in the Linked Budget Lines section header on the invoice detail page, right next to **+ Add Itemization**.

## Configure your LLM provider

Set the environment variables on the Cornerstone container and restart it. Only the first three are required.

| Variable                  | Required | Description                                                                                |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `LLM_BASE_URL`            | Yes      | Base URL of the LLM API endpoint (e.g., `https://api.openai.com/v1`)                       |
| `LLM_API_KEY`             | Yes      | Bearer token / API key for the provider                                                    |
| `LLM_MODEL`               | Yes      | Model identifier (e.g., `gpt-4o-mini`, `gemini-2.5-flash`, `claude-haiku-4-5-20251001`)    |
| `LLM_REQUEST_TIMEOUT_MS`  | No       | Request timeout in milliseconds (default: `30000`, i.e. 30 seconds)                        |
| `LLM_MAX_TOKENS`          | No       | Max output tokens per call (default: `16384`, handles 100+ line invoices). Increase if you see `LLM_INVALID_RESPONSE` with `finishReason="length"`. |
| `LLM_PROVIDER`            | No       | One of `openai`, `anthropic`, `gemini`, `ollama`, or `generic`. Auto-detected from `LLM_BASE_URL` when unset; override only if auto-detection misses your provider. |

If any of the three required variables is missing, the **Auto-itemize** button is hidden everywhere in the app and no LLM calls are made -- you can still itemize invoices manually exactly as before.

### Example: Google Gemini 2.5 Flash

The cheapest option. Typical cost is around **$0.001 per invoice**.

```env
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_API_KEY=AIzaSy...your-key...
LLM_MODEL=gemini-2.5-flash
```

### Example: Anthropic Claude Haiku

A good balance between cost and accuracy. Typical cost is around **$0.005 per invoice**.

```env
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_API_KEY=sk-ant-...your-key...
LLM_MODEL=claude-haiku-4-5-20251001
```

### Example: OpenAI GPT-4o-mini

Fast and reliable. Typical cost is around **$0.003 per invoice**.

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...your-key...
LLM_MODEL=gpt-4o-mini
```

### Example: Local Ollama

Free, fully local, no data leaves your network. Requires Ollama running on your host with a capable model pulled (e.g., `llama3.1:8b` or `qwen2.5:7b`). Quality varies by model.

```env
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.1:8b
```

:::tip Cost varies by provider
The numbers above are rough estimates for a typical one-page construction invoice (1-5 KB of OCR text). Check your provider's pricing page for current rates. Cornerstone does not meter LLM usage -- monitor spend in your provider's dashboard.
:::

### Verify the configuration

The easiest way to verify: open any invoice that has at least one linked Paperless document. If you see an **Auto-itemize** button in the budget-lines section header, the LLM provider is configured correctly. If not, double-check the three required variables and that the container was restarted.

## Walkthrough

This walkthrough assumes you have an invoice in Cornerstone with at least one Paperless document linked to it -- typically the PDF the vendor sent you.

### 1. Open the invoice

Navigate to **Budget > Invoices** and open the invoice you want to itemize. Scroll to the **Linked Budget Lines** section.

### 2. Click Auto-itemize

Click the **Auto-itemize** button in the section header (next to **+ Add Itemization**). A spinner appears while Cornerstone fetches the OCR text from Paperless and sends it to your LLM provider.

### 3. Pick a document (if needed)

If the invoice has more than one Paperless document linked, a picker modal opens listing each document with its title and date. Click the document you want to analyze. The modal closes and extraction starts.

If the invoice has exactly one document linked, this step is skipped.

### 4. Review the preview

When extraction finishes, the **Auto-itemize Preview** modal opens. It shows:

- **One row per extracted line item**, with editable description, quantity, unit, unit price, and total amount fields. Each row has an include / exclude checkbox -- uncheck rows you do not want to save.
- A **mode selector** (append / replace, defaults to append):
  - **Append** -- add the extracted lines to the invoice on top of whatever is already there.
  - **Replace** -- delete previously auto-extracted lines on this invoice and use only the new ones. Manually-added lines are always preserved.
- A **totals row** comparing the sum of included lines against the invoice amount. If the difference is more than 1%, a warning banner appears at the top of the modal.

### 5. Edit, exclude, or correct lines

Click any cell to edit it. OCR is not perfect: descriptions sometimes have stray characters, quantities may be missing, and the LLM occasionally invents a line that does not exist on the invoice. Treat the preview as a draft -- fix what is wrong, uncheck what should not be saved, and add anything that was missed manually after applying.

### 6. Click Apply

Click **Apply**. The modal closes, the invoice page refreshes, and your new lines appear in the Linked Budget Lines table -- each one tagged with an **Unassigned** pill in the "Linked Item" column.

:::note What's an Unassigned line?
Auto-extracted lines do not know which work item or household item they belong to. They land as "Unassigned" so you can record the line item the moment you see the PDF and decide where it rolls up later. Unassigned lines still count toward your financing-source totals and category aggregates, but they do **not** appear in any single work item's budget rollup until you assign them.
:::

### 7. Assign each line to a work item or household item

Each Unassigned row has an inline **Assign…** button. Click it to open the assignment picker:

- Switch between the **Work Item** and **Household Item** tabs at the top of the picker.
- Use the search field to find the target item.
- Click the item, then click **Save**.

The row's pill changes from "Unassigned" to the linked item's name -- and a click on that name jumps to the item's detail page. From here the line behaves like any other budget line: it shows up on the work item or household item's Budget tab, contributes to that item's totals, and feeds into the budget overview rollups.

:::caution Assignment is one-shot
You can assign an Unassigned line to a work item or household item exactly once. After that, the parent is locked in -- there is no "reassign to a different work item" action. If you assign a line to the wrong target, delete it from the invoice and re-create it manually with the right parent.
:::

## What data leaves your server

Cornerstone sends two things to your LLM provider when you click Auto-itemize:

- **The OCR text from the selected Paperless document.** This is plain text Paperless extracted from the PDF -- typically 1-5 KB. The text is truncated at 32,000 characters to keep prompts small and predictable.
- **A few invoice metadata hints** to help the model produce useful output: vendor name, invoice total, and invoice date.

Cornerstone does **not** send:

- The binary PDF or any image of the document.
- Your API keys, user accounts, or anything from other parts of the app.
- The contents of other invoices, work items, or budget lines.

API keys are never logged and never returned to the browser. The `GET /api/config` endpoint only exposes a boolean flag (`autoItemizeEnabled`) so the frontend can decide whether to show the button -- it never sees the key itself.

For the full architectural rationale and security review, see [ADR-031: Outbound LLM Provider Integration](https://github.com/steilerDev/cornerstone/wiki/ADR-031-Outbound-LLM-Provider-Integration) on the wiki.

## Troubleshooting

| Error                            | What it means                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **LLM provider is unreachable**  | Cornerstone could not connect to `LLM_BASE_URL` (network issue, DNS failure, or the request timed out). Check the URL, your network, and try again. |
| **LLM returned an invalid response** | The provider answered, but the response was not the JSON shape Cornerstone expected. Click **Retry** in the modal. If it persists, try a different model -- some smaller models cannot follow the JSON-only system prompt reliably. |
| **LLM upstream error**           | The provider returned a non-200 status (e.g., rate-limited, out of quota, model not found). Check your provider's dashboard.                   |
| **Auto-itemize is not configured** | One of `LLM_BASE_URL`, `LLM_API_KEY`, or `LLM_MODEL` is missing. The button should not be visible in this case -- if you see this error, double-check the container's environment.        |
| **Sum exceeds invoice amount**   | The included lines' total is more than the invoice's amount. Uncheck some rows or correct their amounts before applying.                       |
| **No line items detected**       | The OCR text did not contain anything the model recognized as a line item. The invoice may be a scan of poor quality, or it might just be a single-line bill -- fall back to manual itemization. |

## Caveats and limits

- **OCR text is truncated at 32,000 characters.** Very long invoices (rare for construction) lose detail past that point. Split them into multiple Paperless documents if needed.
- **Maximum 200 lines per application.** If a single invoice has more, apply in batches.
- **Quality depends on the model.** Larger frontier models (GPT-4 class, Claude Sonnet, Gemini 2.5 Pro) handle messy German invoices better than smaller / older models. If results are consistently poor, try a stronger model before giving up on the feature.
- **You pay the LLM provider directly.** Cornerstone has no billing, no metering, and no usage cap. Monitor spend in your provider's dashboard, especially if you are processing a backlog of dozens of invoices in one sitting.
- **Off by default.** No LLM calls ever leave your server until you explicitly set the three required environment variables.
