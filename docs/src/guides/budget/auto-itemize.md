---
sidebar_position: 8
title: Auto-itemize Invoices
---

# Auto-itemize Invoices

When a vendor sends you a PDF invoice, Cornerstone can read the line items off the page for you and turn them into budget lines you only need to review -- not type out. You scan or import the invoice into Paperless-ngx, link it to a Cornerstone invoice, and click **Auto-itemize** on the linked document. A language model reads the OCR text and proposes one budget line per row on the invoice. Cornerstone then opens a dedicated **Auto-itemize** page with the original PDF on one side and the extracted lines on the other, so you can edit, assign, and save each line against the document it came from.

This feature is **opt-in** and disabled by default. You connect Cornerstone to any LLM provider that speaks the OpenAI chat-completions API -- Google Gemini, Anthropic, OpenAI, or a self-hosted model running on your own machine. Cornerstone never sends the binary PDF off your server; only the OCR text and a few invoice details (vendor name, total, date) leave your host.

:::tip Create a whole invoice from a document
You can also go the other way: start from a Paperless document and let Cornerstone build the invoice for you. When Paperless and Auto-itemize are both configured, **New Invoice** opens a document picker, extracts the metadata and line items, and creates the invoice and its budget lines in one step. See [Creating an Invoice from a Paperless document](vendors-and-invoices#creating-an-invoice-from-a-paperless-document). The review screen is the same one described below.
:::

## Prerequisites

Before you can auto-itemize, three things must be in place:

1. **Paperless-ngx is configured.** Auto-itemize reads the OCR text Paperless produces, so the document integration must be active. See [Documents Setup](/guides/documents/setup) if you have not configured it yet.
2. **An LLM provider is configured.** Cornerstone needs an LLM endpoint to send the OCR text to (next section).
3. **At least one Paperless document is linked to the invoice you want to itemize.** See [Linking Documents](/guides/documents/linking-documents).

When all three are in place, an **Auto-itemize** action appears on each linked-document card in the **Documents** section of the invoice detail page. Clicking it opens the dedicated Auto-itemize page for that document.

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

The easiest way to verify: open any invoice that has at least one linked Paperless document. If you see an **Auto-itemize** action on the linked-document card in the **Documents** section, the LLM provider is configured correctly. If not, double-check the three required variables and that the container was restarted.

## Walkthrough

This walkthrough assumes you have an invoice in Cornerstone with at least one Paperless document linked to it -- typically the PDF the vendor sent you.

### 1. Open the invoice and start auto-itemize

Navigate to **Budget > Invoices** and open the invoice you want to itemize. Scroll to the **Documents** section, find the linked invoice PDF, and click its **Auto-itemize** action.

Cornerstone opens the dedicated **Auto-itemize** page. A spinner with an elapsed-seconds counter shows while it fetches the OCR text from Paperless and sends it to your LLM provider. There is no document-picker step -- you choose which document to itemize when you click its action on the card.

### 2. Review the page layout

When extraction finishes, the page shows two columns:

- **Left column -- the form.** The invoice metadata fields at the top, a mode selector, and one card per extracted line item.
- **Right column -- the PDF preview.** The original document renders inline so you can check each extracted line against the source page without leaving the screen. If the PDF cannot be embedded, a fallback panel offers an **Open in Paperless-ngx** link instead.

On narrow screens the PDF preview moves below the form.

### 3. Review and correct the invoice metadata

The top card shows the invoice's **number, amount, date, due date, notes, and status**, pre-filled with the current invoice values. Where the model read a different value off the document than what is on the invoice, a **suggestion badge** appears next to the field -- click it to apply the extracted value. Anything you change here is written back to the invoice when you save.

### 4. Choose append or replace

The **mode selector** controls how the new lines combine with what is already on the invoice:

- **Append** (default) -- add the extracted lines on top of whatever is already there.
- **Replace** -- delete previously auto-extracted lines on this invoice and use only the new ones. Manually-added lines are always preserved.

### 5. Edit, exclude, or correct each line

Each extracted line is a card with editable **description, quantity, unit, unit price, and total amount** fields, plus an **include** checkbox -- uncheck a card to leave that line out. A coloured confidence dot shows how sure the model was about each row.

OCR is not perfect: descriptions sometimes have stray characters, quantities may be missing, and the model occasionally invents a line that does not exist on the invoice. Treat every card as a draft -- fix what is wrong, uncheck what should not be saved, and use the PDF preview to confirm against the source.

A **totals card** at the bottom sums the included lines and compares them against the invoice amount, showing a green match, an amber warning (within 5%), or a red mismatch.

### 6. Assign each line and set its category and funding source

Each line card carries inline **Category** and **Funding source** pickers, plus an **Assign** button:

- **Category / Funding source.** Pick the budget category and which financing source pays for the line directly on the card. New lines default their funding source to **Discretionary Funding** (see [Funding source](#funding-source) below).
- **Assign.** Click **Assign** to open the two-step picker. First choose the target **work item** or **household item**; then either pick an existing budget line on that item to link to, or click **Create Budget Line** to add a fresh line (pre-filled from the extracted row). A line created from the extraction is marked with a **"Created from auto-itemization"** badge so you can tell it apart. Clear an assignment with the **✕** next to it to re-assign or switch to create-new.

When you choose **Create Budget Line**, the picker closes immediately and the new line is *queued* rather than created on the spot: the card shows a **"Creating New"** badge with an inline form for the new line's details and a **Discard** button to back out. The actual budget line is only written when you **Save** the whole page -- so you can keep reviewing the other rows without interruption, and nothing is committed until you are ready. While a queued line is active, that card's category and funding-source pickers step aside (the new line carries its own), and for a line assigned to a work item the VAT toggle is hidden because the value comes straight from the extracted row.

A line you do not assign to any item is still saved against the invoice and counts toward financing-source totals and category aggregates, but it does not roll up into a single work item's budget until you assign it.

### 7. Save

Click **Save**. Cornerstone writes the included lines (and any metadata changes) and returns you to the invoice. If you try to leave with unsaved edits, a confirmation dialog asks whether to discard them.

:::tip You can move an assigned line later
Unlike the old one-shot flow, an invoice-linked budget line is no longer locked to its first parent. You can later edit any invoice-linked line -- including auto-itemized ones -- and **move it to a different work item or household item** from the line's edit view. See [Inline budget line editing](work-item-budgets#editing-invoice-linked-budget-lines).
:::

## Funding source

Every budget line is funded by one of your [financing sources](financing-sources) -- your construction loan, savings, a subsidy, and so on. But when a language model reads an invoice, it has no way of knowing which pot of money you intend to draw on for each row. A line that says "Bathroom tiles -- 480 EUR" tells you nothing about whether you are paying for it out of your loan or your savings.

So auto-extracted lines default to the built-in **Discretionary Funding** source. Think of it as a holding bay: the line is recorded and counted, but parked against a neutral source until you decide where the money really comes from. You can override the funding source per line directly on the Auto-itemize page using each card's **Funding source** picker.

A note in the **extracted lines** section of the Auto-itemize page reminds you, before you save, that any lines still on Discretionary Funding can be moved onto a real source at any time -- nothing is locked in. It is just a sensible default to get lines recorded quickly.

### Reassign a line's funding source

When you know which source should fund a line, change it from the line's edit view:

1. Open the work item or household item the line is assigned to (or **Budget > Overview**).
2. Edit the line and pick the correct financing source from the source selector, then save.

If a whole batch of lines belongs to the same source -- for example, everything on one invoice -- the [Financing Sources](financing-sources) page lets you multi-select lines and move them in a single operation. The depletion totals on both the old and new source update immediately.

:::tip Funding source is not the same as the linked item
Reassigning the **funding source** (which pot of money pays for the line) is separate from assigning the line to a **work item or household item** (what the line is for). You can change either independently and as often as you like -- both the funding source and the parent item assignment can be edited later from the line's edit view.
:::

## What data leaves your server

Cornerstone sends the following to your LLM provider when you click Auto-itemize:

- **The OCR text from the selected Paperless document.** This is plain text Paperless extracted from the PDF -- typically 1-5 KB. The text is truncated at 32,000 characters to keep prompts small and predictable.
- **The human-authored Paperless metadata for that document** -- the details you (or Paperless) maintain about the file: its **title, correspondent, document type, tags, creation date, and original filename**. These are sent alongside the OCR text, and the model is told to treat them as authoritative over anything it would otherwise have to infer from the scanned text. This is what makes the extracted vendor, dates, and line items more accurate -- a clean correspondent name beats a smudged letterhead, and a Paperless creation date beats an OCR misread.
- **A few invoice metadata hints** to help the model produce useful output: vendor name, invoice total, and invoice date.

The same OCR text plus Paperless metadata is sent on both paths that call the model -- itemizing an existing invoice from its linked document, and [creating a new invoice from a Paperless document](vendors-and-invoices#creating-an-invoice-from-a-paperless-document).

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
