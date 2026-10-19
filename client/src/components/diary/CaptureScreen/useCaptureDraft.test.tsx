/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { DiaryEntryDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../../lib/apiClient.js';
import type * as HookModule from './useCaptureDraft.js';
import type * as DiaryApiTypes from '../../../lib/diaryApi.js';

const mockCreate = jest.fn<typeof DiaryApiTypes.createDiaryEntry>();
const mockUpdate = jest.fn<typeof DiaryApiTypes.updateDiaryEntry>();
const mockPromote = jest.fn<typeof DiaryApiTypes.promoteDiaryEntry>();
const mockDelete = jest.fn<typeof DiaryApiTypes.deleteDiaryEntry>();

jest.unstable_mockModule('../../../lib/diaryApi.js', () => ({
  createDiaryEntry: mockCreate,
  updateDiaryEntry: mockUpdate,
  promoteDiaryEntry: mockPromote,
  deleteDiaryEntry: mockDelete,
}));

let useCaptureDraft: typeof HookModule.useCaptureDraft;

function entry(overrides: Partial<DiaryEntryDetail> = {}): DiaryEntryDetail {
  return {
    id: 'de-1',
    entryType: 'daily_log',
    entryDate: '2026-10-18',
    title: 'Screed',
    body: 'Poured',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'draft',
    ...overrides,
  } as DiaryEntryDetail;
}

function setup(
  mode: 'new' | 'draft' | 'saved',
  loaded: DiaryEntryDetail | null = null,
  prefillDate: string | null = null,
  prefillType: 'daily_log' | 'general_note' | 'delivery' | null = null,
) {
  const onDraftCreated = jest.fn();
  const announce = jest.fn();
  const view = renderHook(() =>
    useCaptureDraft({ mode, entry: loaded, prefillDate, prefillType, onDraftCreated, announce }),
  );
  return { ...view, onDraftCreated, announce };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 19, 10, 0, 0));
  jest.resetAllMocks();
  setOnline(true);
  mockCreate.mockResolvedValue(entry({ id: 'new-1' }));
  mockUpdate.mockResolvedValue(entry());
  mockPromote.mockResolvedValue(entry({ status: 'saved' }));
  mockDelete.mockResolvedValue(undefined);
  if (!useCaptureDraft) ({ useCaptureDraft } = await import('./useCaptureDraft.js'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useCaptureDraft: new entry (AC13)', () => {
  it('starts as a daily log dated today and writes nothing', async () => {
    const { result } = setup('new');
    await advance(5000);

    expect(result.current.mode).toBe('new');
    expect(result.current.form).toMatchObject({
      entryType: 'daily_log',
      entryDate: '2026-10-19',
      title: '',
      body: '',
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('uses the prefilled date', () => {
    const { result } = setup('new', null, '2026-10-01');

    expect(result.current.form.entryDate).toBe('2026-10-01');
  });

  it('chips, date and type change alone write nothing', async () => {
    const { result } = setup('new');

    await act(async () => {
      result.current.setFields({ weather: 'sunny', workers: 3 });
      result.current.setEntryDate('2026-10-17');
      await result.current.applyTypeChange('delivery');
    });
    await advance(5000);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.current.form.entryDate).toBe('2026-10-17');
    expect(result.current.form.entryType).toBe('delivery');
  });

  it('blank title or text does not create a draft', async () => {
    const { result } = setup('new');

    await act(async () => {
      result.current.setTitle('   ');
      result.current.setBody('\n');
    });
    await advance(1000);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates the draft once on the first character, however fast the typing', async () => {
    const { result, onDraftCreated, announce } = setup('new');

    await act(async () => {
      result.current.setTitle('S');
      result.current.setTitle('Sc');
      result.current.setBody('x');
      result.current.setTitle('Scr');
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({
      entryType: 'daily_log',
      status: 'draft',
      entryDate: '2026-10-19',
      title: 'Scr',
      body: 'x',
    });
    expect(result.current.draftId).toBe('new-1');
    expect(result.current.mode).toBe('draft');
    expect(onDraftCreated).toHaveBeenCalledTimes(1);
    expect(onDraftCreated).toHaveBeenCalledWith('new-1');
    expect(announce).toHaveBeenCalledWith('Draft saved.');
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.getDraftId()).toBe('new-1');
  });

  it('flushes the text typed while the draft was being created', async () => {
    const creating = deferred<DiaryEntryDetail>();
    mockCreate.mockReturnValueOnce(creating.promise);
    const { result } = setup('new');
    await act(async () => {
      result.current.setTitle('Screed');
    });

    await act(async () => {
      result.current.setBody('Poured today');
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    await act(async () => {
      creating.resolve(entry({ id: 'new-1' }));
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      'new-1',
      expect.objectContaining({ title: 'Screed', body: 'Poured today' }),
    );
  });

  it('ensureDraft returns the same promise for concurrent calls and the id afterwards', async () => {
    const { result } = setup('new');

    let first: Promise<string | null> | undefined;
    let second: Promise<string | null> | undefined;
    await act(async () => {
      first = result.current.ensureDraft();
      second = result.current.ensureDraft();
      await Promise.all([first, second]);
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(await first).toBe('new-1');
    expect(await result.current.ensureDraft()).toBe('new-1');
  });

  it('reports a failed creation and creates on the next attempt', async () => {
    mockCreate.mockRejectedValueOnce(new Error('down'));
    const { result } = setup('new');

    await act(async () => {
      result.current.setTitle('Screed');
    });
    expect(result.current.createFailed).toBe(true);
    expect(result.current.draftId).toBeNull();

    let id: string | null = null;
    await act(async () => {
      id = await result.current.ensureDraft();
    });

    expect(id).toBe('new-1');
    expect(result.current.createFailed).toBe(false);
  });

  it('a title-chip style change (setTitle now) creates the draft too', async () => {
    const { result } = setup('new');

    await act(async () => {
      result.current.setTitle('Plaster', 'now');
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('useCaptureDraft: autosave of a draft', () => {
  it('waits 800 ms after the last keystroke', async () => {
    const { result } = setup('draft', entry());

    act(() => result.current.setTitle('Scre'));
    await advance(700);
    act(() => result.current.setTitle('Screed 2'));
    await advance(700);
    expect(mockUpdate).not.toHaveBeenCalled();
    await advance(100);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      'de-1',
      expect.objectContaining({ title: 'Screed 2', entryDate: '2026-10-18' }),
    );
  });

  it('does not announce individual saves after the first', async () => {
    const { result, announce } = setup('draft', entry());

    act(() => result.current.setTitle('A'));
    await advance(800);
    act(() => result.current.setTitle('B'));
    await advance(800);

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(announce).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.savedAt).not.toBeNull();
  });

  it('saves chips, toggles and pickers at once with the full metadata', async () => {
    const { result } = setup('draft', entry());

    await act(async () => {
      result.current.setFields({ weather: 'rainy', workers: 2 });
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]![1]).toMatchObject({
      metadata: { weather: 'rainy', workersOnSite: 2 },
    });
  });

  it('a typing schedule for fields also waits for the debounce', async () => {
    const { result } = setup('draft', entry());

    act(() => result.current.setFields({ temperature: '12' }, 'typing'));
    await advance(799);
    expect(mockUpdate).not.toHaveBeenCalled();
    await advance(1);

    expect(mockUpdate.mock.calls[0]![1]).toMatchObject({ metadata: { temperatureCelsius: 12 } });
  });

  it('saves signatures at once, only the complete ones', async () => {
    const { result } = setup('draft', entry());
    const signed = { signerName: 'Sam', signerType: 'self' as const, signatureDataUrl: 'data:x' };
    const blank = { signerName: '', signerType: 'self' as const, signatureDataUrl: '' };

    await act(async () => {
      result.current.setSignatures([signed, blank]);
    });

    expect(mockUpdate.mock.calls[0]![1]).toMatchObject({ metadata: { signatures: [signed] } });
  });

  it('sends nothing when the change does not alter the payload', async () => {
    const { result } = setup('draft', entry());

    await act(async () => {
      result.current.setTitle('Screed', 'now');
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps one request in flight and sends exactly one follow-up with the latest state', async () => {
    const first = deferred<DiaryEntryDetail>();
    mockUpdate.mockReturnValueOnce(first.promise);
    const { result } = setup('draft', entry());

    await act(async () => {
      result.current.setFields({ workers: 1 });
    });
    await act(async () => {
      result.current.setFields({ workers: 2 });
      result.current.setFields({ workers: 3 });
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(entry());
    });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1]![1]).toMatchObject({ metadata: { workersOnSite: 3 } });
  });

  it('shows Saving only when a request runs longer than 400 ms', async () => {
    const pending = deferred<DiaryEntryDetail>();
    mockUpdate.mockReturnValueOnce(pending.promise);
    const { result } = setup('draft', entry());

    await act(async () => {
      result.current.setFields({ workers: 1 });
    });
    await advance(399);
    expect(result.current.saveStatus).toBe('idle');
    await advance(1);
    expect(result.current.saveStatus).toBe('saving');

    await act(async () => {
      pending.resolve(entry());
    });
    expect(result.current.saveStatus).toBe('saved');
  });

  it('a fast save never shows Saving', async () => {
    const { result } = setup('draft', entry());

    await act(async () => {
      result.current.setFields({ workers: 1 });
    });
    await advance(1000);

    expect(result.current.saveStatus).toBe('saved');
  });

  it('retries after 2, 5 and 15 seconds, then waits for Retry', async () => {
    mockUpdate.mockRejectedValue(new Error('down'));
    const { result, announce } = setup('draft', entry());

    await act(async () => {
      result.current.setFields({ workers: 1 });
    });
    expect(result.current.saveStatus).toBe('failed');
    expect(announce).toHaveBeenCalledWith("Couldn't save. Trying again.");
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    await advance(1999);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    await advance(5000);
    expect(mockUpdate).toHaveBeenCalledTimes(3);
    await advance(15000);
    expect(mockUpdate).toHaveBeenCalledTimes(4);
    await advance(120000);
    expect(mockUpdate).toHaveBeenCalledTimes(4);
    expect(announce).toHaveBeenCalledTimes(1);

    mockUpdate.mockResolvedValue(entry());
    await act(async () => {
      result.current.retrySave();
    });

    expect(mockUpdate).toHaveBeenCalledTimes(5);
    expect(result.current.saveStatus).toBe('saved');
    expect(announce).toHaveBeenLastCalledWith('Saved again.');
  });

  it('goes offline without counting a failure, and resumes when the browser is back', async () => {
    setOnline(false);
    const { result } = setup('draft', entry());

    await act(async () => {
      result.current.setFields({ workers: 1 });
    });
    expect(result.current.saveStatus).toBe('offline');
    expect(mockUpdate).not.toHaveBeenCalled();

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toBe('saved');
  });

  it('shows offline when the browser reports it, and a request failing while offline', async () => {
    mockUpdate.mockRejectedValue(new Error('network'));
    const { result } = setup('draft', entry());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.saveStatus).toBe('offline');

    setOnline(true);
    await act(async () => {
      result.current.setFields({ workers: 1 });
    });
    expect(result.current.saveStatus).toBe('failed');
    setOnline(false);
    await advance(2000);

    expect(result.current.saveStatus).toBe('offline');
  });

  it('ignores online and offline events before a draft exists', async () => {
    const { result } = setup('new');

    act(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.saveStatus).toBe('idle');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('sends typed text when the screen is left before the debounce fired', async () => {
    const { result, unmount } = setup('draft', entry());

    act(() => result.current.setTitle('Typed last'));
    unmount();
    await advance(10);

    expect(mockUpdate).toHaveBeenCalledWith(
      'de-1',
      expect.objectContaining({ title: 'Typed last' }),
    );
  });

  it('holds the metadata back while the end is not after the start', async () => {
    const { result } = setup('draft', entry());

    await act(async () => {
      result.current.setFields({ workStart: '10:00', workEnd: '09:00' });
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]![1]).not.toHaveProperty('metadata');

    await act(async () => {
      result.current.setFields({ workEnd: '12:00' });
    });
    expect(mockUpdate.mock.calls[1]![1]).toMatchObject({
      metadata: { workStart: '10:00', workEnd: '12:00' },
    });
  });
});

describe('useCaptureDraft: date change', () => {
  it('saves the new date at once', async () => {
    const { result } = setup('draft', entry());

    await act(async () => {
      result.current.setEntryDate('2026-10-15');
    });

    expect(mockUpdate.mock.calls[0]![1]).toMatchObject({ entryDate: '2026-10-15' });
    expect(result.current.form.entryDate).toBe('2026-10-15');
  });

  it('puts the old date back and announces when the save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('down'));
    const { result, announce } = setup('draft', entry());

    await act(async () => {
      result.current.setEntryDate('2026-10-15');
    });

    expect(result.current.form.entryDate).toBe('2026-10-18');
    expect(announce).toHaveBeenCalledWith("Couldn't change the date. Try again.");
    await advance(60000);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('two quick changes where the first fails: reverts to the last confirmed date, in order', async () => {
    const first = deferred<DiaryEntryDetail>();
    mockUpdate.mockReturnValueOnce(first.promise);
    const { result, announce } = setup('draft', entry());

    await act(async () => {
      result.current.setEntryDate('2026-10-15');
    });
    await act(async () => {
      result.current.setEntryDate('2026-10-14');
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]![1]).toMatchObject({ entryDate: '2026-10-15' });
    await act(async () => {
      first.reject(new Error('down'));
    });

    expect(result.current.form.entryDate).toBe('2026-10-18');
    expect(announce).toHaveBeenCalledWith("Couldn't change the date. Try again.");
    expect(mockUpdate.mock.calls.every((call) => call[1].entryDate !== '2026-10-14')).toBe(true);
  });

  it('reverts to the date of the last successful save, not the original one', async () => {
    const { result } = setup('draft', entry());
    await act(async () => {
      result.current.setEntryDate('2026-10-15');
    });
    mockUpdate.mockRejectedValue(new Error('down'));

    await act(async () => {
      result.current.setEntryDate('2026-10-14');
    });

    expect(result.current.form.entryDate).toBe('2026-10-15');
  });

  it('a date on a draft-less new entry is local only', async () => {
    const { result } = setup('new');

    await act(async () => {
      result.current.setEntryDate('2026-10-15');
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('useCaptureDraft: type switch', () => {
  it('switches at once when nothing would be lost, saving type and metadata', async () => {
    const { result } = setup('draft', entry());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.requestTypeChange('delivery');
    });

    expect(outcome).toEqual({ kind: 'applied' });
    expect(mockUpdate).toHaveBeenCalledWith('de-1', { entryType: 'delivery', metadata: null });
    expect(result.current.form.entryType).toBe('delivery');
  });

  it('does nothing for the current type', async () => {
    const { result } = setup('draft', entry());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.requestTypeChange('daily_log');
    });

    expect(outcome).toEqual({ kind: 'applied' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('asks to confirm when details would be dropped, and changes nothing yet', async () => {
    const { result } = setup(
      'draft',
      entry({ metadata: { weather: 'sunny', workStart: '07:00', workEnd: '09:00' } }),
    );

    let outcome: Awaited<ReturnType<typeof result.current.requestTypeChange>> | undefined;
    await act(async () => {
      outcome = await result.current.requestTypeChange('general_note');
    });

    expect(outcome).toMatchObject({ kind: 'confirm', to: 'general_note' });
    expect(outcome?.kind === 'confirm' ? outcome.dropped.map((d) => d.key).sort() : []).toEqual([
      'times',
      'weather',
    ]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.current.form.entryType).toBe('daily_log');
  });

  it('applyTypeChange after the confirm prunes the fields and saves the new type', async () => {
    const { result } = setup('draft', entry({ metadata: { weather: 'sunny', workers: 2 } }));

    let ok = false;
    await act(async () => {
      ok = await result.current.applyTypeChange('site_visit');
    });

    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith('de-1', { entryType: 'site_visit', metadata: null });
    expect(result.current.form.fields.weather).toBeNull();
    expect(result.current.form.fields.workers).toBeNull();
  });

  it('drops signatures when the target type has none', async () => {
    const sig = { signerName: 'Sam', signerType: 'self' as const, signatureDataUrl: 'data:x' };
    const { result } = setup('draft', entry({ metadata: { signatures: [sig] } }));

    await act(async () => {
      await result.current.applyTypeChange('delivery');
    });

    expect(result.current.form.signatures).toEqual([]);
  });

  it('keeps signatures when the target type has them', async () => {
    const sig = { signerName: 'Sam', signerType: 'self' as const, signatureDataUrl: 'data:x' };
    const { result } = setup('draft', entry({ metadata: { signatures: [sig] } }));

    await act(async () => {
      await result.current.applyTypeChange('issue');
    });

    expect(result.current.form.signatures).toEqual([sig]);
    expect(result.current.form.fields.resolutionStatus).toBe('open');
  });

  it('reports a failed switch and keeps the type', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('down'));
    const { result } = setup('draft', entry());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.requestTypeChange('delivery');
    });

    expect(outcome).toEqual({ kind: 'failed' });
    expect(result.current.form.entryType).toBe('daily_log');
  });

  it('does not send an inverted time pair when the new type keeps the times', async () => {
    const { result } = setup('draft', entry());
    await act(async () => {
      result.current.setFields({ workStart: '10:00', workEnd: '09:00' });
    });
    mockUpdate.mockClear();

    await act(async () => {
      await result.current.requestTypeChange('site_visit');
    });

    expect(mockUpdate).toHaveBeenCalledWith('de-1', {
      entryType: 'site_visit',
      metadata: { workStart: '10:00' },
    });
  });

  it('waits for a save in flight before it switches', async () => {
    const pending = deferred<DiaryEntryDetail>();
    mockUpdate.mockReturnValueOnce(pending.promise);
    const { result } = setup('draft', entry());
    await act(async () => {
      result.current.setFields({ workStart: '07:00' });
    });

    let done = false;
    const expectedCalls = 2;
    act(() => {
      void result.current.requestTypeChange('site_visit').then(() => {
        done = true;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    await act(async () => {
      pending.resolve(entry());
    });

    expect(mockUpdate).toHaveBeenCalledTimes(expectedCalls);
    expect(done).toBe(true);
  });

  it('after a switch the next change sends the full payload again', async () => {
    const { result } = setup('draft', entry());
    await act(async () => {
      await result.current.requestTypeChange('delivery');
    });
    mockUpdate.mockClear();

    await act(async () => {
      result.current.setFields({ vendor: 'Alpha' });
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      'de-1',
      expect.objectContaining({ title: 'Screed', metadata: { vendor: 'Alpha' } }),
    );
  });
});

describe('useCaptureDraft: saved entry', () => {
  const saved = () =>
    entry({ status: 'saved', metadata: { weather: 'sunny' }, title: 'Screed', body: 'Poured' });

  it('has no autosave and tracks whether the form is dirty', async () => {
    const { result } = setup('saved', saved());
    expect(result.current.mode).toBe('saved');
    expect(result.current.dirty).toBe(false);

    act(() => result.current.setTitle('Screed two'));
    await advance(5000);
    expect(result.current.dirty).toBe(true);

    act(() => result.current.setTitle('Screed'));
    expect(result.current.dirty).toBe(false);

    await act(async () => {
      result.current.setFields({ workers: 3 });
      result.current.setEntryDate('2026-10-10');
      result.current.setSignatures([]);
    });
    expect(result.current.dirty).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('loads the stored values', () => {
    const { result } = setup('saved', saved());

    expect(result.current.form).toMatchObject({
      entryDate: '2026-10-18',
      title: 'Screed',
      body: 'Poured',
      fields: { weather: 'sunny' },
    });
  });

  it('ensureDraft returns the entry id', async () => {
    const { result } = setup('saved', saved());

    await expect(result.current.ensureDraft()).resolves.toBe('de-1');
  });

  it('a body edit does not create anything', async () => {
    const { result } = setup('saved', saved());

    await act(async () => {
      result.current.setBody('New text');
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('Save changes sends the payload without a type and returns the id', async () => {
    const { result } = setup('saved', saved());
    act(() => result.current.setTitle('  Screed two '));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit();
    });

    expect(outcome).toEqual({ status: 'ok', id: 'de-1' });
    expect(mockUpdate).toHaveBeenCalledWith('de-1', {
      entryDate: '2026-10-18',
      title: 'Screed two',
      body: 'Poured',
      metadata: { weather: 'sunny' },
    });
    expect(mockPromote).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it('a type change in saved mode stays local', async () => {
    const { result } = setup('saved', saved());

    await act(async () => {
      await result.current.applyTypeChange('delivery');
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.current.form.entryType).toBe('delivery');
  });
});

describe('useCaptureDraft: submit of a new entry or draft', () => {
  it('saves a new entry with only a title: draft first, then promote', async () => {
    const { result } = setup('new');
    act(() => result.current.setTitle('Plaster'));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit();
    });

    expect(outcome).toEqual({ status: 'ok', id: 'new-1' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockPromote).toHaveBeenCalledWith('new-1', {
      entryDate: '2026-10-19',
      title: 'Plaster',
      body: '',
      metadata: null,
    });
  });

  it('waits for the save in flight before it promotes', async () => {
    const pending = deferred<DiaryEntryDetail>();
    mockUpdate.mockReturnValueOnce(pending.promise);
    const { result } = setup('draft', entry());
    await act(async () => {
      result.current.setFields({ workers: 2 });
    });

    let outcome: unknown;
    act(() => {
      void result.current.submit().then((value) => {
        outcome = value;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockPromote).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(true);

    await act(async () => {
      pending.resolve(entry());
    });

    expect(mockPromote).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ status: 'ok', id: 'de-1' });
  });

  it('stops autosaving once promoted', async () => {
    const { result } = setup('draft', entry());
    await act(async () => {
      await result.current.submit();
    });
    mockUpdate.mockClear();

    await act(async () => {
      result.current.setFields({ workers: 4 });
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('translates a server error and flags missing photos', async () => {
    mockPromote.mockRejectedValue(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'x',
        details: { fields: ['photos'] },
      }),
    );
    const { result } = setup('draft', entry());

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit();
    });

    expect(outcome).toMatchObject({ status: 'error', photosMissing: true });
    expect(outcome?.status === 'error' && outcome.message.length > 0).toBe(true);
  });

  it('flags a server error without field details as not about photos', async () => {
    mockPromote.mockRejectedValue(
      new ApiClientError(403, { code: 'IMMUTABLE_ENTRY', message: 'locked' }),
    );
    const { result } = setup('draft', entry());

    let outcome: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      outcome = await result.current.submit();
    });

    expect(outcome).toMatchObject({ status: 'error', photosMissing: false });
  });

  it('re-enables autosave after a failed promote', async () => {
    mockPromote.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    const { result } = setup('draft', entry());
    await act(async () => {
      await result.current.submit();
    });

    await act(async () => {
      result.current.setFields({ workers: 4 });
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('reports an unknown failure with the generic save message', async () => {
    mockPromote.mockRejectedValue(new Error('boom'));
    const { result } = setup('draft', entry());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit();
    });

    expect(outcome).toEqual({
      status: 'error',
      message: "Couldn't save. Trying again.",
      photosMissing: false,
    });
  });

  it('reports a draft that could not be created', async () => {
    mockCreate.mockRejectedValue(new Error('down'));
    const { result } = setup('new');
    act(() => result.current.setBody('Text'));
    await act(async () => {
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit();
    });

    expect(outcome).toEqual({
      status: 'error',
      message: "Couldn't start the entry. Try again.",
      photosMissing: false,
    });
    expect(mockPromote).not.toHaveBeenCalled();
  });
});

describe('useCaptureDraft: discard', () => {
  it('runs the hook, then deletes the draft', async () => {
    const order: string[] = [];
    mockDelete.mockImplementation(async () => {
      order.push('delete');
    });
    const { result } = setup('draft', entry());

    await act(async () => {
      await result.current.discard(async (id) => {
        order.push(`before:${id}`);
      });
    });

    expect(order).toEqual(['before:de-1', 'delete']);
  });

  it('deletes without a hook', async () => {
    const { result } = setup('draft', entry());

    await act(async () => {
      await result.current.discard();
    });

    expect(mockDelete).toHaveBeenCalledWith('de-1');
  });

  it('does nothing without a draft', async () => {
    const { result } = setup('new');

    await act(async () => {
      await result.current.discard(async () => {
        throw new Error('not expected');
      });
    });

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('cancels the pending autosave, and can resume it after a failed discard', async () => {
    mockDelete.mockRejectedValueOnce(new Error('down'));
    const { result } = setup('draft', entry());
    act(() => result.current.setTitle('Typed'));

    await act(async () => {
      await expect(result.current.discard()).rejects.toThrow('down');
    });
    await advance(2000);
    expect(mockUpdate).not.toHaveBeenCalled();

    act(() => result.current.resumeAfterFailedDiscard());
    await act(async () => {
      result.current.setFields({ workers: 1 });
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('useCaptureDraft: prefillType (#2222 Log now)', () => {
  it('starts a new entry with the prefilled type, clean, and writes nothing', async () => {
    const { result } = setup('new', null, null, 'general_note');
    await advance(5000);

    expect(result.current.form.entryType).toBe('general_note');
    expect(result.current.dirty).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('defaults to a daily log without a prefill type', () => {
    expect(setup('new', null, null, null).result.current.form.entryType).toBe('daily_log');
  });

  it('keeps the prefilled date alongside the type', () => {
    const { result } = setup('new', null, '2026-10-01', 'delivery');
    expect(result.current.form).toMatchObject({ entryType: 'delivery', entryDate: '2026-10-01' });
  });

  it('ignores the prefill type when an entry is loaded', () => {
    const { result } = setup('draft', entry({ entryType: 'daily_log' }), null, 'general_note');
    expect(result.current.form.entryType).toBe('daily_log');
    const saved = setup('saved', entry({ entryType: 'issue', status: 'saved' }), null, 'delivery');
    expect(saved.result.current.form.entryType).toBe('issue');
  });
});
