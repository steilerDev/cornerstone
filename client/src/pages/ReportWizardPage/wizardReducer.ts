import type {
  SourceReportType,
  SourceReportResponse,
  GenerateReportContentResponse,
} from '@cornerstone/shared';
import type { ResolvedLocale } from '../../contexts/LocaleContext.js';
import type { ReportColumnKey, ReportContentOverrides } from '../../lib/reportContent/index.js';
import type { SkippedDocument } from '../../lib/reportPdf/index.js';

export interface SelectionTier {
  useCase: SourceReportType | null;
  sourceId: string | null;
}

export interface SourcesTier {
  step2Amounts: Map<string, number>;
  step2Loading: boolean;
  step2RequestId: string | null;
}

export interface ReportTier {
  report: SourceReportResponse | null;
  reportStatus: 'loading' | 'ready' | 'error';
  reportRequestId: string | null;
  excludedInvoiceIds: Set<string>;
  excludedLineIds: Set<string>;
  skippedDocuments: SkippedDocument[];
}

export interface ContentTier {
  overrides: ReportContentOverrides;
  aiContent: GenerateReportContentResponse | null;
  aiRequestId: string | null;
  aiError: string;
  /** R5: per-wizard-run only, resets on use-case change (via freshContentTier()), never
   * persisted to a preference endpoint. */
  hiddenColumns: Set<ReportColumnKey>;
}

export interface SettingsTier {
  reportLanguageOverride: ResolvedLocale | null;
  attachDocuments: boolean;
  includeCoverLetter: boolean;
}

export interface NavTier {
  currentStep: number;
  maxReachedStep: number;
}

export type WizardState = SelectionTier &
  SourcesTier &
  ReportTier &
  ContentTier &
  SettingsTier &
  NavTier;

/**
 * Tier factories — each returns a complete, fresh object of its named tier type.
 * Reducer cases build their next state by spreading the relevant factories plus
 * explicit field writes, NEVER by ad-hoc spread of individually-cleared fields.
 * Adding a field to a tier type is a compile error in its factory, which is AC4.
 */
function freshSelectionTier(): SelectionTier {
  return { useCase: null, sourceId: null };
}

function freshSourcesTier(): SourcesTier {
  return { step2Amounts: new Map(), step2Loading: false, step2RequestId: null };
}

function freshReportTier(): ReportTier {
  return {
    report: null,
    reportStatus: 'loading',
    reportRequestId: null,
    excludedInvoiceIds: new Set(),
    excludedLineIds: new Set(),
    skippedDocuments: [],
  };
}

function freshContentTier(): ContentTier {
  return {
    overrides: {},
    aiContent: null,
    aiRequestId: null,
    aiError: '',
    hiddenColumns: new Set(),
  };
}

function freshSettingsTier(): SettingsTier {
  return { reportLanguageOverride: null, attachDocuments: true, includeCoverLetter: false };
}

function freshNavTier(): NavTier {
  return { currentStep: 1, maxReachedStep: 1 };
}

let _requestCounter = 0;
export function nextRequestId(): string {
  return String(++_requestCounter);
}

export type WizardAction =
  | { type: 'SELECT_USE_CASE'; payload: { useCase: SourceReportType; step2RequestId: string } }
  | { type: 'SELECT_SOURCE'; payload: { sourceId: string; requestId: string } }
  | { type: 'STEP2_AMOUNTS_LOADED'; payload: { requestId: string; amounts: Map<string, number> } }
  | { type: 'REPORT_LOADED'; payload: { requestId: string; report: SourceReportResponse } }
  | { type: 'REPORT_ERROR'; payload: { requestId: string } }
  | { type: 'REPORT_REFRESHED'; payload: { report: SourceReportResponse } }
  | { type: 'TOGGLE_INVOICE'; payload: { invoiceId: string; excluded: boolean } }
  | { type: 'TOGGLE_ALL_INVOICES'; payload: { excludeAll: boolean } }
  | { type: 'TOGGLE_LINE'; payload: { lineId: string; excluded: boolean } }
  | { type: 'SET_REPORT_LANGUAGE'; payload: { lang: ResolvedLocale } }
  | { type: 'SET_ATTACH_DOCUMENTS'; payload: { value: boolean } }
  | { type: 'SET_INCLUDE_COVER_LETTER'; payload: { value: boolean } }
  | { type: 'SET_OVERRIDE'; payload: { key: string; value: string } }
  | { type: 'RESET_OVERRIDE'; payload: { key: string } }
  | { type: 'AI_GENERATION_STARTED'; payload: { requestId: string } }
  | {
      type: 'AI_GENERATION_COMPLETE';
      payload: { requestId: string; result: GenerateReportContentResponse };
    }
  | { type: 'AI_GENERATION_ERROR'; payload: { requestId: string; error: string } }
  | { type: 'AI_GENERATION_BLOCKED'; payload: { error: string } }
  | { type: 'DISCARD_EDITS' }
  | { type: 'GO_TO_STEP'; payload: { step: number } }
  | { type: 'PDF_GENERATED'; payload: { skippedDocuments: SkippedDocument[] } }
  | { type: 'TOGGLE_COLUMN'; payload: { column: ReportColumnKey } };

export function createInitialWizardState(sourceIdFromQuery: string | null): WizardState {
  return {
    ...freshSelectionTier(),
    ...freshSourcesTier(),
    ...freshReportTier(),
    ...freshContentTier(),
    ...freshSettingsTier(),
    ...freshNavTier(),
    sourceId: sourceIdFromQuery,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SELECT_USE_CASE':
      return {
        ...state,
        ...freshSelectionTier(),
        ...freshSourcesTier(),
        ...freshReportTier(),
        ...freshContentTier(),
        useCase: action.payload.useCase,
        step2RequestId: action.payload.step2RequestId,
        step2Loading: true,
        currentStep: Math.min(state.currentStep, 2),
        maxReachedStep: 2,
      };

    case 'SELECT_SOURCE':
      // M-I: preserve aiError by spreading freshContentTier() then overriding aiError back.
      // Adding a future ContentTier field will be caught here at compile time.
      return {
        ...state,
        ...freshReportTier(),
        reportRequestId: action.payload.requestId,
        ...freshContentTier(),
        aiError: state.aiError,
        sourceId: action.payload.sourceId,
        currentStep: Math.min(state.currentStep, 3),
        maxReachedStep: 3,
      };

    case 'STEP2_AMOUNTS_LOADED':
      if (action.payload.requestId !== state.step2RequestId) return state;
      return {
        ...state,
        step2Amounts: action.payload.amounts,
        step2Loading: false,
        step2RequestId: null,
      };

    case 'REPORT_LOADED':
      if (action.payload.requestId !== state.reportRequestId) return state;
      return {
        ...state,
        report: action.payload.report,
        reportStatus: 'ready',
        reportRequestId: null,
        includeCoverLetter: Boolean(
          action.payload.report.source.contactAddress || action.payload.report.source.reference,
        ),
      };

    case 'REPORT_ERROR':
      if (action.payload.requestId !== state.reportRequestId) return state;
      return { ...state, reportStatus: 'error', reportRequestId: null };

    case 'REPORT_REFRESHED': {
      if (state.report === null) return state;
      const validInvoiceIds = new Set(action.payload.report.invoices.map((inv) => inv.invoiceId));
      return {
        ...state,
        report: action.payload.report,
        excludedInvoiceIds: new Set(
          [...state.excludedInvoiceIds].filter((id) => validInvoiceIds.has(id)),
        ),
      };
    }

    case 'TOGGLE_INVOICE': {
      const next = new Set(state.excludedInvoiceIds);
      if (action.payload.excluded) {
        next.add(action.payload.invoiceId);
      } else {
        next.delete(action.payload.invoiceId);
      }
      return { ...state, excludedInvoiceIds: next };
    }

    case 'TOGGLE_ALL_INVOICES':
      if (!state.report) return state;
      return {
        ...state,
        excludedInvoiceIds: action.payload.excludeAll
          ? new Set(state.report.invoices.map((inv) => inv.invoiceId))
          : new Set<string>(),
      };

    case 'TOGGLE_LINE': {
      const next = new Set(state.excludedLineIds);
      if (action.payload.excluded) {
        next.add(action.payload.lineId);
      } else {
        next.delete(action.payload.lineId);
      }
      return { ...state, excludedLineIds: next };
    }

    case 'SET_REPORT_LANGUAGE':
      return { ...state, reportLanguageOverride: action.payload.lang };
    case 'SET_ATTACH_DOCUMENTS':
      return { ...state, attachDocuments: action.payload.value };
    case 'SET_INCLUDE_COVER_LETTER':
      return { ...state, includeCoverLetter: action.payload.value };

    case 'SET_OVERRIDE':
      return {
        ...state,
        overrides: { ...state.overrides, [action.payload.key]: action.payload.value },
      };
    case 'RESET_OVERRIDE': {
      const next = { ...state.overrides };
      delete next[action.payload.key];
      return { ...state, overrides: next };
    }

    case 'AI_GENERATION_STARTED':
      return { ...state, aiRequestId: action.payload.requestId, aiError: '' };
    case 'AI_GENERATION_COMPLETE':
      if (action.payload.requestId !== state.aiRequestId) return state;
      return { ...state, aiContent: action.payload.result, overrides: {}, aiRequestId: null };
    case 'AI_GENERATION_ERROR':
      if (action.payload.requestId !== state.aiRequestId) return state;
      return { ...state, aiError: action.payload.error, aiRequestId: null };
    case 'AI_GENERATION_BLOCKED':
      return { ...state, aiError: action.payload.error };

    case 'DISCARD_EDITS':
      // M-I: spread freshContentTier() for AC4 enforcement, then override aiError conditionally.
      // hiddenColumns is explicitly PRESERVED here (not discarded with overrides/aiContent):
      // column visibility is a presentation choice, not a "content edit" — R5 co-locates it with
      // `overrides` on ContentTier for reset-on-use-case-change purposes only, not to make it
      // discardable together with text edits (#1973).
      return {
        ...state,
        ...freshContentTier(),
        hiddenColumns: state.hiddenColumns,
        aiError: state.aiRequestId !== null ? '' : state.aiError,
      };

    case 'GO_TO_STEP':
      return {
        ...state,
        currentStep: action.payload.step,
        maxReachedStep: Math.max(state.maxReachedStep, action.payload.step),
      };

    case 'PDF_GENERATED':
      return { ...state, skippedDocuments: action.payload.skippedDocuments };

    case 'TOGGLE_COLUMN': {
      const next = new Set(state.hiddenColumns);
      if (next.has(action.payload.column)) next.delete(action.payload.column);
      else next.add(action.payload.column);
      return { ...state, hiddenColumns: next };
    }

    default:
      return (action satisfies never, state);
  }
}

export function isGeneratingAi(state: WizardState): boolean {
  return state.aiRequestId !== null;
}

export function hasManualEdits(state: WizardState): boolean {
  return Object.keys(state.overrides).length > 0;
}

export function isDirty(state: WizardState): boolean {
  return hasManualEdits(state) || state.aiContent !== null || isGeneratingAi(state);
}

export function isGeneratingOnly(state: WizardState): boolean {
  return isGeneratingAi(state) && !hasManualEdits(state) && state.aiContent === null;
}
