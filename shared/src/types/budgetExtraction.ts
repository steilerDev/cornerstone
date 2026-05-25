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
}

export interface ExtractionHints {
  vendorName?: string;
  invoiceTotal?: number;
  invoiceDate?: string; // ISO 8601 date
  locale?: string; // e.g., 'de-DE'
}

/**
 * Top-level extraction result from the LLM provider.
 * Carries document-level extracted fields (invoiceDate, dueDate) alongside line items.
 * Introduced in story #1576.
 */
export interface ExtractionResult {
  /** ISO 8601 date (YYYY-MM-DD) if the LLM extracted it from the document header, else absent. */
  invoiceDate?: string;
  /** ISO 8601 date (YYYY-MM-DD) if the LLM extracted a due date, else absent. */
  dueDate?: string;
  lines: ExtractedLine[];
}
