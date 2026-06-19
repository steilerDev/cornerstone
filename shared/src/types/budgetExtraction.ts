/**
 * Budget extraction types.
 *
 * EPIC-16 Story #1546 & #1547: LLM-powered line item extraction from invoices.
 * These types represent the extracted line items returned by the LLM provider
 * and are used in both dry-run and commit workflows.
 */

export interface ExtractedLine {
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalAmount: number;
  includesVat?: boolean;
  vatRate?: number;
  vendorName?: string;
  confidence: number; // 0..1
  /**
   * Optional pre-existing or eagerly-created budget line ID to link this row to.
   * When present, the server creates only the invoice_budget_lines junction row
   * (no new work_item_budget / household_item_budget row).
   * Must reference either an existing work_item_budgets row or household_item_budgets row.
   *
   * The assignedBudgetLineType discriminates the FK family.
   */
  assignedBudgetLineId?: string;
  /** Discriminator: which budget line FK family the ID refers to. Required when assignedBudgetLineId is set. */
  assignedBudgetLineType?: 'work_item' | 'household_item';
  /** Assignment intent: 'assign-existing' links/updates an existing line; 'create-new' creates one. If absent, inferred from assignedBudgetLineId presence. */
  assignmentMode?: 'create-new' | 'assign-existing';
  /** Budget category ID for new budget line (create-new mode). Null = no category. */
  budgetCategoryId?: string | null;
  /** Raw LLM-extracted category name (e.g. "Materials", "Labor"). Server maps this to budgetCategoryId server-side. */
  category?: string | null;
  /** Budget source ID for new budget line (create-new mode). Falls back to discretionary if absent. */
  budgetSourceId?: string | null;
}

export interface ExtractionHints {
  vendorName?: string;
  invoiceTotal?: number;
  invoiceDate?: string; // ISO 8601 date
  locale?: string; // e.g., 'de-DE'
  /**
   * Available vendors for the LLM to choose from.
   * When populated, the LLM should return chosenVendorName as one of these names.
   * EPIC-18 Story #1679: Added for Paperless-first invoice creation preview.
   */
  availableVendors?: Array<{ id: string; name: string }>;
  /**
   * Human-authored metadata from Paperless-ngx.
   * These fields are set by the user in Paperless-ngx and should be prioritized
   * over values the LLM infers from OCR text alone.
   */
  paperlessMetadata?: {
    /** User-set document title in Paperless-ngx. */
    title?: string | null;
    /** Correspondent (person/org) assigned in Paperless-ngx. */
    correspondent?: string | null;
    /** Document type assigned in Paperless-ngx. */
    documentType?: string | null;
    /** Tag names applied to this document. */
    tags?: string[];
    /** ISO 8601 date (YYYY-MM-DD) set by user as the document's creation date. */
    created?: string | null;
    /** Original filename of the uploaded file. */
    originalFileName?: string | null;
  };
}

/**
 * Top-level extraction result from the LLM provider.
 * Carries document-level extracted fields (invoiceDate, dueDate, invoiceNumber, notes) alongside line items.
 * Introduced in story #1576.
 */
export interface ExtractionResult {
  /** ISO 8601 date (YYYY-MM-DD) if the LLM extracted it from the document header, else absent. */
  invoiceDate?: string;
  /** ISO 8601 date (YYYY-MM-DD) if the LLM extracted a due date, else absent. */
  dueDate?: string;
  /** Vendor's invoice identifier (max 255 chars) if extracted, else absent. */
  invoiceNumber?: string;
  /** One-sentence summary (max 1000 chars) if extracted, else absent. */
  notes?: string;
  /**
   * Vendor name matched by the LLM when availableVendors is provided.
   * Must be an exact match to one of the names in hints.availableVendors.
   * EPIC-18 Story #1679: Added for Paperless-first invoice creation preview.
   */
  chosenVendorName?: string | null;
  lines: ExtractedLine[];
}
