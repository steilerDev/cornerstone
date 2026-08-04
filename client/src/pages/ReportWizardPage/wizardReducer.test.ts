/**
 * Unit tests for wizardReducer.ts
 *
 * Pure unit tests — no React rendering, no jsdom, no module mocks.
 * All tests operate on the reducer, factories, and selectors directly.
 *
 * Coverage: createInitialWizardState, wizardReducer (all 20 action types),
 * isGeneratingAi, hasManualEdits, isDirty, isGeneratingOnly.
 *
 * Story #1947 / Bug #1943 regression tests are in Group 17.
 */
import { describe, it, expect } from '@jest/globals';
import type { SourceReportResponse, GenerateReportContentResponse } from '@cornerstone/shared';
import type { WizardState } from './wizardReducer.js';
import {
  createInitialWizardState,
  wizardReducer,
  nextRequestId,
  isGeneratingAi,
  hasManualEdits,
  isDirty,
  isGeneratingOnly,
} from './wizardReducer.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSourceSummary(
  overrides: Partial<SourceReportResponse['source']> = {},
): SourceReportResponse['source'] {
  return {
    id: 'src-1',
    name: 'Home Loan',
    sourceType: 'bank_loan',
    reference: null,
    contactAddress: null,
    ...overrides,
  };
}

function makeInvoice(id: string): SourceReportResponse['invoices'][0] {
  return {
    invoiceId: id,
    vendorId: 'vend-1',
    vendorName: 'ACME',
    invoiceNumber: `INV-${id}`,
    date: '2026-01-10',
    status: 'pending',
    invoiceAmount: 1000,
    allocatedAmount: 1000,
    lineKind: 'invoice',
    isSplit: false,
    documents: [],
    budgetLines: [
      {
        id: `bl-${id}`,
        description: 'Usage text',
        allocatedPortion: 0,
        linkedItem: null,
      },
    ],
    deposits: [],
  };
}

function makeReport(
  sourceId: string,
  invoiceIds: string[] = ['inv-1'],
  sourceOverrides: Partial<SourceReportResponse['source']> = {},
): SourceReportResponse {
  return {
    type: 'claim',
    source: makeSourceSummary({ id: sourceId, ...sourceOverrides }),
    invoices: invoiceIds.map((id) => makeInvoice(id)),
    totalAmount: 1000,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
  };
}

function makeAiResult(): GenerateReportContentResponse {
  return {
    letterSubject: 'AI subject',
    letterBody: 'AI body',
    descriptions: { 'inv-1': 'AI description' },
  };
}

/** Build a WizardState by starting from createInitialWizardState(null) and spreading overrides. */
function makeState(overrides: Partial<WizardState> = {}): WizardState {
  return { ...createInitialWizardState(null), ...overrides };
}

// ─── nextRequestId ────────────────────────────────────────────────────────────

describe('nextRequestId', () => {
  it('returns a string and increments on each call', () => {
    const id1 = nextRequestId();
    const id2 = nextRequestId();
    expect(typeof id1).toBe('string');
    expect(id1.length).toBeGreaterThan(0);
    expect(Number(id2)).toBe(Number(id1) + 1);
  });
});

// ─── Group 1: createInitialWizardState ────────────────────────────────────────

describe('createInitialWizardState', () => {
  it('with null sourceId: sets sourceId null and all tier defaults', () => {
    const state = createInitialWizardState(null);
    expect(state.sourceId).toBeNull();
    expect(state.useCase).toBeNull();
    expect(state.currentStep).toBe(1);
    expect(state.maxReachedStep).toBe(1);
    expect(state.step2Loading).toBe(false);
    expect(state.report).toBeNull();
    expect(state.reportStatus).toBe('loading');
    expect(state.overrides).toEqual({});
    expect(state.aiRequestId).toBeNull();
  });

  it("with 'src-42' sourceId: sets sourceId and all other fields match defaults", () => {
    const state = createInitialWizardState('src-42');
    expect(state.sourceId).toBe('src-42');
    expect(state.useCase).toBeNull();
    expect(state.currentStep).toBe(1);
    expect(state.maxReachedStep).toBe(1);
    expect(state.step2Loading).toBe(false);
    expect(state.report).toBeNull();
    expect(state.reportStatus).toBe('loading');
    expect(state.overrides).toEqual({});
    expect(state.aiRequestId).toBeNull();
  });
});

// ─── Group 2: Tier factories (via createInitialWizardState) ──────────────────

describe('Tier factories (via createInitialWizardState)', () => {
  it('freshReportTier shape: report=null, reportStatus=loading, reportRequestId=null, empty sets, []', () => {
    const state = createInitialWizardState(null);
    expect(state.report).toBeNull();
    expect(state.reportStatus).toBe('loading');
    expect(state.reportRequestId).toBeNull();
    expect(state.excludedInvoiceIds).toBeInstanceOf(Set);
    expect(state.excludedInvoiceIds.size).toBe(0);
    expect(state.excludedLineIds).toBeInstanceOf(Set);
    expect(state.excludedLineIds.size).toBe(0);
    expect(state.skippedDocuments).toEqual([]);
  });

  it('freshContentTier shape: aiContent=null, aiRequestId=null, aiError="", overrides={}', () => {
    const state = createInitialWizardState(null);
    expect(state.aiContent).toBeNull();
    expect(state.aiRequestId).toBeNull();
    expect(state.aiError).toBe('');
    expect(state.overrides).toEqual({});
  });
});

// ─── Group 3: SELECT_USE_CASE ─────────────────────────────────────────────────

describe('SELECT_USE_CASE', () => {
  it('resets ReportTier to fresh values', () => {
    const state = makeState({
      report: makeReport('src-1'),
      reportStatus: 'ready',
      reportRequestId: 'req-old',
      excludedInvoiceIds: new Set(['inv-1']),
      excludedLineIds: new Set(['bl-1']),
      skippedDocuments: [
        {
          invoiceId: 'inv-1',
          documentId: 'doc-1',
          reason: 'footnoteFetchFailed',
          vendorName: 'ACME',
          invoiceNumber: 'INV-001',
        },
      ],
    });

    const next = wizardReducer(state, {
      type: 'SELECT_USE_CASE',
      payload: { useCase: 'budget-overview', step2RequestId: 'req-1' },
    });

    expect(next.report).toBeNull();
    expect(next.reportStatus).toBe('loading');
    expect(next.reportRequestId).toBeNull();
    expect(next.excludedInvoiceIds.size).toBe(0);
    expect(next.excludedLineIds.size).toBe(0);
    expect(next.skippedDocuments).toEqual([]);
  });

  it('resets SelectionTier: sourceId=null, useCase=action.payload.useCase', () => {
    const state = makeState({ sourceId: 'src-1', useCase: 'claim' });
    const next = wizardReducer(state, {
      type: 'SELECT_USE_CASE',
      payload: { useCase: 'budget-overview', step2RequestId: 'req-1' },
    });
    expect(next.sourceId).toBeNull();
    expect(next.useCase).toBe('budget-overview');
  });

  it('sets step2Loading=true and step2RequestId', () => {
    const state = makeState();
    const next = wizardReducer(state, {
      type: 'SELECT_USE_CASE',
      payload: { useCase: 'claim', step2RequestId: 'req-42' },
    });
    expect(next.step2Loading).toBe(true);
    expect(next.step2RequestId).toBe('req-42');
  });

  it('sets maxReachedStep=2; currentStep=min(prev,2)', () => {
    const stateAt1 = makeState({ currentStep: 1, maxReachedStep: 1 });
    const next1 = wizardReducer(stateAt1, {
      type: 'SELECT_USE_CASE',
      payload: { useCase: 'claim', step2RequestId: 'req-1' },
    });
    expect(next1.maxReachedStep).toBe(2);
    expect(next1.currentStep).toBe(1); // stayed at 1

    const stateAt4 = makeState({ currentStep: 4, maxReachedStep: 4 });
    const next4 = wizardReducer(stateAt4, {
      type: 'SELECT_USE_CASE',
      payload: { useCase: 'claim', step2RequestId: 'req-2' },
    });
    expect(next4.maxReachedStep).toBe(2);
    expect(next4.currentStep).toBe(2); // clamped to 2
  });

  it('clears ContentTier: overrides={}, aiContent=null, aiRequestId=null, aiError=""', () => {
    const state = makeState({
      overrides: { 'row.inv-1.usageText': 'edited' },
      aiContent: makeAiResult(),
      aiRequestId: 'ai-req-1',
      aiError: 'some error',
    });
    const next = wizardReducer(state, {
      type: 'SELECT_USE_CASE',
      payload: { useCase: 'claim', step2RequestId: 'req-1' },
    });
    expect(next.overrides).toEqual({});
    expect(next.aiContent).toBeNull();
    expect(next.aiRequestId).toBeNull();
    expect(next.aiError).toBe('');
  });

  it('preserves SettingsTier fields', () => {
    const state = makeState({
      attachDocuments: false,
      includeCoverLetter: true,
      reportLanguageOverride: 'de',
    });
    const next = wizardReducer(state, {
      type: 'SELECT_USE_CASE',
      payload: { useCase: 'claim', step2RequestId: 'req-1' },
    });
    expect(next.attachDocuments).toBe(false);
    expect(next.includeCoverLetter).toBe(true);
    expect(next.reportLanguageOverride).toBe('de');
  });
});

// ─── Group 4: SELECT_SOURCE ───────────────────────────────────────────────────

describe('SELECT_SOURCE', () => {
  it('sets sourceId, reportRequestId, reportStatus=loading', () => {
    const state = makeState({ sourceId: null, reportStatus: 'error' });
    const next = wizardReducer(state, {
      type: 'SELECT_SOURCE',
      payload: { sourceId: 'src-2', requestId: 'req-10' },
    });
    expect(next.sourceId).toBe('src-2');
    expect(next.reportRequestId).toBe('req-10');
    expect(next.reportStatus).toBe('loading');
  });

  it('resets excludedInvoiceIds, excludedLineIds, skippedDocuments', () => {
    const state = makeState({
      excludedInvoiceIds: new Set(['inv-1']),
      excludedLineIds: new Set(['bl-1']),
      skippedDocuments: [
        {
          invoiceId: 'inv-1',
          documentId: 'doc-1',
          reason: 'footnoteFetchFailed',
          vendorName: 'ACME',
          invoiceNumber: null,
        },
      ],
    });
    const next = wizardReducer(state, {
      type: 'SELECT_SOURCE',
      payload: { sourceId: 'src-2', requestId: 'req-1' },
    });
    expect(next.excludedInvoiceIds.size).toBe(0);
    expect(next.excludedLineIds.size).toBe(0);
    expect(next.skippedDocuments).toEqual([]);
  });

  it('clears overrides, aiContent, aiRequestId', () => {
    const state = makeState({
      overrides: { key: 'val' },
      aiContent: makeAiResult(),
      aiRequestId: 'ai-1',
    });
    const next = wizardReducer(state, {
      type: 'SELECT_SOURCE',
      payload: { sourceId: 'src-2', requestId: 'req-1' },
    });
    expect(next.overrides).toEqual({});
    expect(next.aiContent).toBeNull();
    expect(next.aiRequestId).toBeNull();
  });

  it('M-I regression: does NOT clear aiError — aiError is preserved after SELECT_SOURCE', () => {
    const state = makeState({ aiError: 'some error' });
    const next = wizardReducer(state, {
      type: 'SELECT_SOURCE',
      payload: { sourceId: 'src-2', requestId: 'req-1' },
    });
    // CRITICAL: this must fail if someone adds `aiError: ''` to the SELECT_SOURCE case
    expect(next.aiError).toBe('some error');
  });

  it('sets maxReachedStep=3; currentStep=min(prev,3)', () => {
    const stateAt2 = makeState({ currentStep: 2, maxReachedStep: 2 });
    const next2 = wizardReducer(stateAt2, {
      type: 'SELECT_SOURCE',
      payload: { sourceId: 'src-1', requestId: 'req-1' },
    });
    expect(next2.maxReachedStep).toBe(3);
    expect(next2.currentStep).toBe(2); // stayed at 2

    const stateAt4 = makeState({ currentStep: 4, maxReachedStep: 4 });
    const next4 = wizardReducer(stateAt4, {
      type: 'SELECT_SOURCE',
      payload: { sourceId: 'src-1', requestId: 'req-2' },
    });
    expect(next4.maxReachedStep).toBe(3);
    expect(next4.currentStep).toBe(3); // clamped to 3
  });
});

// ─── Group 5: STEP2_AMOUNTS_LOADED ───────────────────────────────────────────

describe('STEP2_AMOUNTS_LOADED', () => {
  it('matching requestId: updates step2Amounts, clears step2Loading and step2RequestId', () => {
    const state = makeState({ step2RequestId: 'req-1', step2Loading: true });
    const amounts = new Map<string, number>([['src-1', 50000]]);
    const next = wizardReducer(state, {
      type: 'STEP2_AMOUNTS_LOADED',
      payload: { requestId: 'req-1', amounts },
    });
    expect(next.step2Amounts).toBe(amounts);
    expect(next.step2Loading).toBe(false);
    expect(next.step2RequestId).toBeNull();
  });

  it('non-matching requestId: returns same state reference unchanged', () => {
    const state = makeState({ step2RequestId: 'req-current', step2Loading: true });
    const next = wizardReducer(state, {
      type: 'STEP2_AMOUNTS_LOADED',
      payload: { requestId: 'req-stale', amounts: new Map() },
    });
    expect(next).toBe(state);
  });
});

// ─── Group 6: REPORT_LOADED ───────────────────────────────────────────────────

describe('REPORT_LOADED', () => {
  it('matching requestId, source with contactAddress: sets report, status=ready, includeCoverLetter=true', () => {
    const report = makeReport('src-1', ['inv-1'], { contactAddress: '123 Main St' });
    const state = makeState({ reportRequestId: 'req-1', includeCoverLetter: false });
    const next = wizardReducer(state, {
      type: 'REPORT_LOADED',
      payload: { requestId: 'req-1', report },
    });
    expect(next.report).toBe(report);
    expect(next.reportStatus).toBe('ready');
    expect(next.reportRequestId).toBeNull();
    expect(next.includeCoverLetter).toBe(true);
  });

  it('matching requestId, source with no contactAddress/reference: includeCoverLetter=false', () => {
    const report = makeReport('src-1', ['inv-1'], { contactAddress: null, reference: null });
    const state = makeState({ reportRequestId: 'req-1', includeCoverLetter: true });
    const next = wizardReducer(state, {
      type: 'REPORT_LOADED',
      payload: { requestId: 'req-1', report },
    });
    expect(next.includeCoverLetter).toBe(false);
  });

  it('non-matching requestId: returns same state reference unchanged', () => {
    const state = makeState({ reportRequestId: 'req-current' });
    const next = wizardReducer(state, {
      type: 'REPORT_LOADED',
      payload: { requestId: 'req-stale', report: makeReport('src-1') },
    });
    expect(next).toBe(state);
  });
});

// ─── Group 7: REPORT_ERROR ────────────────────────────────────────────────────

describe('REPORT_ERROR', () => {
  it('matching requestId: sets reportStatus=error, clears reportRequestId', () => {
    const state = makeState({ reportRequestId: 'req-1', reportStatus: 'loading' });
    const next = wizardReducer(state, {
      type: 'REPORT_ERROR',
      payload: { requestId: 'req-1' },
    });
    expect(next.reportStatus).toBe('error');
    expect(next.reportRequestId).toBeNull();
  });

  it('non-matching requestId: returns same state reference unchanged', () => {
    const state = makeState({ reportRequestId: 'req-current' });
    const next = wizardReducer(state, {
      type: 'REPORT_ERROR',
      payload: { requestId: 'req-stale' },
    });
    expect(next).toBe(state);
  });
});

// ─── Group 8: REPORT_REFRESHED ────────────────────────────────────────────────

describe('REPORT_REFRESHED', () => {
  it('when state.report is null: returns same state reference unchanged (M-J no-op)', () => {
    const state = makeState({ report: null });
    const next = wizardReducer(state, {
      type: 'REPORT_REFRESHED',
      payload: { report: makeReport('src-1') },
    });
    expect(next).toBe(state);
  });

  it('when state.report is non-null: updates report and prunes excludedInvoiceIds', () => {
    const oldReport = makeReport('src-1', ['inv-1', 'inv-2', 'inv-3']);
    const newReport = makeReport('src-1', ['inv-1', 'inv-3']); // inv-2 removed
    const state = makeState({
      report: oldReport,
      excludedInvoiceIds: new Set(['inv-1', 'inv-2']), // inv-2 no longer valid
    });
    const next = wizardReducer(state, {
      type: 'REPORT_REFRESHED',
      payload: { report: newReport },
    });
    expect(next.report).toBe(newReport);
    // inv-1 still valid → kept; inv-2 gone → pruned
    expect(next.excludedInvoiceIds.has('inv-1')).toBe(true);
    expect(next.excludedInvoiceIds.has('inv-2')).toBe(false);
    expect(next.excludedInvoiceIds.has('inv-3')).toBe(false); // was never excluded
  });
});

// ─── Group 9: TOGGLE_INVOICE / TOGGLE_ALL_INVOICES / TOGGLE_LINE ─────────────

describe('TOGGLE_INVOICE / TOGGLE_ALL_INVOICES / TOGGLE_LINE', () => {
  it('TOGGLE_INVOICE excluded=true: adds invoiceId to excludedInvoiceIds', () => {
    const state = makeState({ excludedInvoiceIds: new Set<string>() });
    const next = wizardReducer(state, {
      type: 'TOGGLE_INVOICE',
      payload: { invoiceId: 'inv-1', excluded: true },
    });
    expect(next.excludedInvoiceIds.has('inv-1')).toBe(true);
  });

  it('TOGGLE_INVOICE excluded=false: removes invoiceId from excludedInvoiceIds', () => {
    const state = makeState({ excludedInvoiceIds: new Set(['inv-1']) });
    const next = wizardReducer(state, {
      type: 'TOGGLE_INVOICE',
      payload: { invoiceId: 'inv-1', excluded: false },
    });
    expect(next.excludedInvoiceIds.has('inv-1')).toBe(false);
  });

  it('TOGGLE_ALL_INVOICES excludeAll=true: excludedInvoiceIds contains all invoice ids', () => {
    const report = makeReport('src-1', ['inv-1', 'inv-2', 'inv-3']);
    const state = makeState({ report, excludedInvoiceIds: new Set<string>() });
    const next = wizardReducer(state, {
      type: 'TOGGLE_ALL_INVOICES',
      payload: { excludeAll: true },
    });
    expect(next.excludedInvoiceIds.has('inv-1')).toBe(true);
    expect(next.excludedInvoiceIds.has('inv-2')).toBe(true);
    expect(next.excludedInvoiceIds.has('inv-3')).toBe(true);
    expect(next.excludedInvoiceIds.size).toBe(3);
  });

  it('TOGGLE_ALL_INVOICES excludeAll=false: excludedInvoiceIds is empty', () => {
    const report = makeReport('src-1', ['inv-1', 'inv-2']);
    const state = makeState({ report, excludedInvoiceIds: new Set(['inv-1', 'inv-2']) });
    const next = wizardReducer(state, {
      type: 'TOGGLE_ALL_INVOICES',
      payload: { excludeAll: false },
    });
    expect(next.excludedInvoiceIds.size).toBe(0);
  });

  it('TOGGLE_ALL_INVOICES when report is null: returns same state reference unchanged', () => {
    const state = makeState({ report: null });
    const next = wizardReducer(state, {
      type: 'TOGGLE_ALL_INVOICES',
      payload: { excludeAll: true },
    });
    expect(next).toBe(state);
  });

  it('TOGGLE_LINE excluded=true: adds lineId to excludedLineIds', () => {
    const state = makeState({ excludedLineIds: new Set<string>() });
    const next = wizardReducer(state, {
      type: 'TOGGLE_LINE',
      payload: { lineId: 'bl-1', excluded: true },
    });
    expect(next.excludedLineIds.has('bl-1')).toBe(true);
  });

  it('TOGGLE_LINE excluded=false: removes lineId from excludedLineIds', () => {
    const state = makeState({ excludedLineIds: new Set(['bl-1']) });
    const next = wizardReducer(state, {
      type: 'TOGGLE_LINE',
      payload: { lineId: 'bl-1', excluded: false },
    });
    expect(next.excludedLineIds.has('bl-1')).toBe(false);
  });
});

// ─── Group 10: Settings actions ───────────────────────────────────────────────

describe('Settings actions', () => {
  it("SET_REPORT_LANGUAGE: updates reportLanguageOverride to 'de'", () => {
    const state = makeState({ reportLanguageOverride: null });
    const next = wizardReducer(state, {
      type: 'SET_REPORT_LANGUAGE',
      payload: { lang: 'de' },
    });
    expect(next.reportLanguageOverride).toBe('de');
  });

  it('SET_ATTACH_DOCUMENTS: toggles attachDocuments false→true and true→false', () => {
    const stateOff = makeState({ attachDocuments: false });
    const nextOn = wizardReducer(stateOff, {
      type: 'SET_ATTACH_DOCUMENTS',
      payload: { value: true },
    });
    expect(nextOn.attachDocuments).toBe(true);

    const nextOff = wizardReducer(nextOn, {
      type: 'SET_ATTACH_DOCUMENTS',
      payload: { value: false },
    });
    expect(nextOff.attachDocuments).toBe(false);
  });

  it('SET_INCLUDE_COVER_LETTER: toggles includeCoverLetter', () => {
    const stateOff = makeState({ includeCoverLetter: false });
    const nextOn = wizardReducer(stateOff, {
      type: 'SET_INCLUDE_COVER_LETTER',
      payload: { value: true },
    });
    expect(nextOn.includeCoverLetter).toBe(true);

    const nextOff = wizardReducer(nextOn, {
      type: 'SET_INCLUDE_COVER_LETTER',
      payload: { value: false },
    });
    expect(nextOff.includeCoverLetter).toBe(false);
  });
});

// ─── Group 11: Override actions ───────────────────────────────────────────────

describe('Override actions', () => {
  it('SET_OVERRIDE: adds key/value, preserves other overrides', () => {
    const state = makeState({ overrides: { 'row.inv-1.usageText': 'existing' } });
    const next = wizardReducer(state, {
      type: 'SET_OVERRIDE',
      payload: { key: 'row.inv-2.usageText', value: 'new value' },
    });
    expect(next.overrides['row.inv-1.usageText']).toBe('existing');
    expect(next.overrides['row.inv-2.usageText']).toBe('new value');
  });

  it('RESET_OVERRIDE: removes specific key, other overrides remain', () => {
    const state = makeState({
      overrides: {
        'row.inv-1.usageText': 'keep',
        'row.inv-2.usageText': 'remove',
      },
    });
    const next = wizardReducer(state, {
      type: 'RESET_OVERRIDE',
      payload: { key: 'row.inv-2.usageText' },
    });
    expect(next.overrides['row.inv-1.usageText']).toBe('keep');
    expect('row.inv-2.usageText' in next.overrides).toBe(false);
  });
});

// ─── Group 12: AI generation lifecycle ───────────────────────────────────────

describe('AI generation lifecycle', () => {
  it('AI_GENERATION_STARTED: sets aiRequestId=requestId, clears aiError', () => {
    const state = makeState({ aiRequestId: null, aiError: 'previous error' });
    const next = wizardReducer(state, {
      type: 'AI_GENERATION_STARTED',
      payload: { requestId: 'ai-req-1' },
    });
    expect(next.aiRequestId).toBe('ai-req-1');
    expect(next.aiError).toBe('');
  });

  it('AI_GENERATION_COMPLETE matching requestId: sets aiContent, clears overrides and aiRequestId', () => {
    const result = makeAiResult();
    const state = makeState({
      aiRequestId: 'ai-req-1',
      aiContent: null,
      overrides: { 'row.inv-1.usageText': 'edited' },
    });
    const next = wizardReducer(state, {
      type: 'AI_GENERATION_COMPLETE',
      payload: { requestId: 'ai-req-1', result },
    });
    expect(next.aiContent).toBe(result);
    expect(next.overrides).toEqual({});
    expect(next.aiRequestId).toBeNull();
    expect(isGeneratingAi(next)).toBe(false);
  });

  it('AI_GENERATION_COMPLETE non-matching requestId: returns same state reference unchanged', () => {
    const state = makeState({ aiRequestId: 'ai-req-current' });
    const next = wizardReducer(state, {
      type: 'AI_GENERATION_COMPLETE',
      payload: { requestId: 'ai-req-stale', result: makeAiResult() },
    });
    expect(next).toBe(state);
  });

  it('AI_GENERATION_ERROR matching requestId: sets aiError, clears aiRequestId', () => {
    const state = makeState({ aiRequestId: 'ai-req-1' });
    const next = wizardReducer(state, {
      type: 'AI_GENERATION_ERROR',
      payload: { requestId: 'ai-req-1', error: 'LLM timeout' },
    });
    expect(next.aiError).toBe('LLM timeout');
    expect(next.aiRequestId).toBeNull();
  });

  it('AI_GENERATION_ERROR non-matching requestId: returns same state reference unchanged', () => {
    const state = makeState({ aiRequestId: 'ai-req-current' });
    const next = wizardReducer(state, {
      type: 'AI_GENERATION_ERROR',
      payload: { requestId: 'ai-req-stale', error: 'some error' },
    });
    expect(next).toBe(state);
  });

  it('AI_GENERATION_BLOCKED: sets aiError, leaves aiRequestId unchanged', () => {
    const state = makeState({ aiRequestId: 'ai-req-in-flight', aiError: '' });
    const next = wizardReducer(state, {
      type: 'AI_GENERATION_BLOCKED',
      payload: { error: 'content policy block' },
    });
    expect(next.aiError).toBe('content policy block');
    // aiRequestId is preserved even if it was non-null
    expect(next.aiRequestId).toBe('ai-req-in-flight');
  });
});

// ─── Group 13: DISCARD_EDITS ──────────────────────────────────────────────────

describe('DISCARD_EDITS', () => {
  it('when aiRequestId is non-null: clears overrides, aiContent, aiRequestId, AND clears aiError', () => {
    const state = makeState({
      overrides: { key: 'val' },
      aiContent: makeAiResult(),
      aiRequestId: 'ai-req-1',
      aiError: 'some error',
    });
    const next = wizardReducer(state, { type: 'DISCARD_EDITS' });
    expect(next.overrides).toEqual({});
    expect(next.aiContent).toBeNull();
    expect(next.aiRequestId).toBeNull();
    expect(next.aiError).toBe(''); // cleared because aiRequestId was non-null
  });

  it('when aiRequestId is null: clears overrides, aiContent, aiRequestId, but PRESERVES aiError', () => {
    const state = makeState({
      overrides: { key: 'val' },
      aiContent: makeAiResult(),
      aiRequestId: null,
      aiError: 'persistent error',
    });
    const next = wizardReducer(state, { type: 'DISCARD_EDITS' });
    expect(next.overrides).toEqual({});
    expect(next.aiContent).toBeNull();
    expect(next.aiRequestId).toBeNull();
    expect(next.aiError).toBe('persistent error'); // preserved because aiRequestId was null
  });
});

// ─── Group 14: GO_TO_STEP ─────────────────────────────────────────────────────

describe('GO_TO_STEP', () => {
  it('forward navigation (step > maxReachedStep): updates currentStep and maxReachedStep', () => {
    const state = makeState({ currentStep: 2, maxReachedStep: 2 });
    const next = wizardReducer(state, { type: 'GO_TO_STEP', payload: { step: 4 } });
    expect(next.currentStep).toBe(4);
    expect(next.maxReachedStep).toBe(4);
  });

  it('backward navigation (step < maxReachedStep): updates currentStep, maxReachedStep unchanged', () => {
    const state = makeState({ currentStep: 4, maxReachedStep: 4 });
    const next = wizardReducer(state, { type: 'GO_TO_STEP', payload: { step: 2 } });
    expect(next.currentStep).toBe(2);
    expect(next.maxReachedStep).toBe(4); // unchanged
  });
});

// ─── Group 15: PDF_GENERATED ──────────────────────────────────────────────────

describe('PDF_GENERATED', () => {
  it('updates skippedDocuments to the payload value', () => {
    const state = makeState({ skippedDocuments: [] });
    const skipped = [
      {
        invoiceId: 'inv-1',
        documentId: 'doc-1',
        reason: 'footnoteFetchFailed' as const,
        vendorName: 'ACME',
        invoiceNumber: 'INV-001',
      },
    ];
    const next = wizardReducer(state, {
      type: 'PDF_GENERATED',
      payload: { skippedDocuments: skipped },
    });
    expect(next.skippedDocuments).toBe(skipped);
  });
});

// ─── Group 16: Selectors ──────────────────────────────────────────────────────

describe('Selectors', () => {
  it('isGeneratingAi: true when aiRequestId is non-null; false when null', () => {
    expect(isGeneratingAi(makeState({ aiRequestId: 'req-1' }))).toBe(true);
    expect(isGeneratingAi(makeState({ aiRequestId: null }))).toBe(false);
  });

  it('hasManualEdits: true when overrides has at least one key; false when empty', () => {
    expect(hasManualEdits(makeState({ overrides: { key: 'val' } }))).toBe(true);
    expect(hasManualEdits(makeState({ overrides: {} }))).toBe(false);
  });

  it('isDirty: true from overrides, aiContent, or generating; false when all clear', () => {
    expect(isDirty(makeState({ overrides: { key: 'val' } }))).toBe(true);
    expect(isDirty(makeState({ aiContent: makeAiResult() }))).toBe(true);
    expect(isDirty(makeState({ aiRequestId: 'req-1' }))).toBe(true);
    expect(isDirty(makeState({ overrides: {}, aiContent: null, aiRequestId: null }))).toBe(false);
  });

  it('isGeneratingOnly: true when generating and no manual edits and no aiContent', () => {
    // Generating, no overrides, no aiContent → true
    expect(
      isGeneratingOnly(makeState({ aiRequestId: 'req-1', overrides: {}, aiContent: null })),
    ).toBe(true);

    // Has manual edits → false
    expect(
      isGeneratingOnly(
        makeState({ aiRequestId: 'req-1', overrides: { key: 'val' }, aiContent: null }),
      ),
    ).toBe(false);

    // Has aiContent → false
    expect(
      isGeneratingOnly(
        makeState({ aiRequestId: 'req-1', overrides: {}, aiContent: makeAiResult() }),
      ),
    ).toBe(false);

    // Not generating → false
    expect(isGeneratingOnly(makeState({ aiRequestId: null, overrides: {}, aiContent: null }))).toBe(
      false,
    );
  });
});

// ─── Group 17: AC5 Regression tests ──────────────────────────────────────────

describe('AC5 Regression tests', () => {
  it('Test 52 — Bug #1943 shape: SELECT_USE_CASE cascade-resets all downstream state', () => {
    const startState = makeState({
      useCase: 'claim',
      sourceId: 'src-1',
      report: makeReport('src-1', ['inv-1']),
      excludedInvoiceIds: new Set(['inv-1']),
      overrides: { 'row.inv-1.usageText': 'edited' },
      aiContent: makeAiResult(),
      aiRequestId: null,
    });

    const next = wizardReducer(startState, {
      type: 'SELECT_USE_CASE',
      payload: { useCase: 'budget-overview', step2RequestId: 'req-1' },
    });

    expect(next.report).toBeNull();
    expect(next.sourceId).toBeNull();
    expect(next.excludedInvoiceIds.size).toBe(0);
    expect(next.overrides).toEqual({});
    expect(next.aiContent).toBeNull();
    expect(next.aiRequestId).toBeNull();
    expect(next.maxReachedStep).toBe(2);
  });

  it('Test 53 — Bug #1943 AC8 shape: SELECT_USE_CASE clears sourceId; SELECT_SOURCE re-applies it', () => {
    const stateWithSource = makeState({ sourceId: 'src-1', useCase: 'budget-overview' });

    const afterUseCaseChange = wizardReducer(stateWithSource, {
      type: 'SELECT_USE_CASE',
      payload: { useCase: 'claim', step2RequestId: 'req-2' },
    });
    expect(afterUseCaseChange.sourceId).toBeNull();

    const afterSourceSelect = wizardReducer(afterUseCaseChange, {
      type: 'SELECT_SOURCE',
      payload: { sourceId: 'src-1', requestId: 'req-3' },
    });
    expect(afterSourceSelect.sourceId).toBe('src-1');
  });

  it('Test 54 — Bug M1 shape: REPORT_LOADED is a no-op for stale requests', () => {
    const state = makeState({ reportRequestId: 'req-current', report: null });

    const afterStale = wizardReducer(state, {
      type: 'REPORT_LOADED',
      payload: { requestId: 'req-stale', report: makeReport('src-1') },
    });
    expect(afterStale.report).toBeNull();
    expect(afterStale.reportStatus).toBe('loading');

    const freshReport = makeReport('src-1');
    const afterFresh = wizardReducer(afterStale, {
      type: 'REPORT_LOADED',
      payload: { requestId: 'req-current', report: freshReport },
    });
    expect(afterFresh.report).toBe(freshReport);
    expect(afterFresh.reportStatus).toBe('ready');
  });

  it('Test 55 — Bug M2 shape: AI_GENERATION_COMPLETE is a no-op for stale requests', () => {
    // Start generation
    const stateStarted = wizardReducer(makeState(), {
      type: 'AI_GENERATION_STARTED',
      payload: { requestId: 'req-current' },
    });
    expect(stateStarted.aiRequestId).toBe('req-current');

    // Stale completion: no-op
    const afterStale = wizardReducer(stateStarted, {
      type: 'AI_GENERATION_COMPLETE',
      payload: { requestId: 'req-stale', result: makeAiResult() as GenerateReportContentResponse },
    });
    expect(afterStale.aiContent).toBeNull();
    expect(isGeneratingAi(afterStale)).toBe(true);

    // Fresh completion: applies
    const freshResult = makeAiResult();
    const afterFresh = wizardReducer(afterStale, {
      type: 'AI_GENERATION_COMPLETE',
      payload: { requestId: 'req-current', result: freshResult },
    });
    expect(afterFresh.aiContent).toBe(freshResult);
    expect(isGeneratingAi(afterFresh)).toBe(false);
  });
});

// ─── TypeScript exhaustiveness guard (default branch) ────────────────────────

describe('wizardReducer default/exhaustiveness guard', () => {
  it('returns state unchanged for an unknown action type (runtime safety)', () => {
    const state = makeState();
    // Cast to `any` to bypass the TypeScript discriminated union and hit the `default` branch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = wizardReducer(state, { type: 'UNKNOWN_ACTION' } as any);
    expect(next).toBe(state);
  });
});
