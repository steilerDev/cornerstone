/**
 * Unit tests for client/src/lib/reportPdf/sinks.ts
 *
 * Covers: downloadPdf's anchor creation/click/revoke sequence, createPreviewUrl delegation to
 * URL.createObjectURL, and uploadToPaperless's delegation to paperlessApi's
 * uploadPaperlessDocument.
 *
 * jsdom does not implement URL.createObjectURL/revokeObjectURL — they must be stubbed directly
 * (not via jest.spyOn, which requires the property to already exist on the object).
 *
 * downloadPdf's revoke now happens inside `setTimeout(() => URL.revokeObjectURL(url), 0)` (item
 * 17 of the frontend fix spec — deferring revocation so the anchor's navigation/download has a
 * chance to actually start before the blob URL is invalidated). The two revoke-ordering tests
 * below use fake timers and advance them explicitly after the synchronous `downloadPdf()` call
 * returns, since the revoke call is no longer observable synchronously.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type * as PaperlessApiModule from '../paperlessApi.js';
import type * as SinksModule from './sinks.js';

const mockUploadPaperlessDocument = jest.fn<typeof PaperlessApiModule.uploadPaperlessDocument>();

jest.unstable_mockModule('../paperlessApi.js', () => ({
  uploadPaperlessDocument: mockUploadPaperlessDocument,
}));

let sinks: typeof SinksModule;
let savedCreateObjectURL: typeof URL.createObjectURL;
let savedRevokeObjectURL: typeof URL.revokeObjectURL;

beforeEach(async () => {
  sinks = await import('./sinks.js');
  mockUploadPaperlessDocument.mockReset();
  savedCreateObjectURL = URL.createObjectURL;
  savedRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn<typeof URL.createObjectURL>().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = jest.fn<typeof URL.revokeObjectURL>();
});

afterEach(() => {
  URL.createObjectURL = savedCreateObjectURL;
  URL.revokeObjectURL = savedRevokeObjectURL;
  jest.restoreAllMocks();
});

describe('downloadPdf', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates an object URL, triggers an anchor click with the given filename, and revokes the URL after the deferred timer fires', () => {
    const clickSpy = jest.fn();
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    const appendSpy = jest.spyOn(document.body, 'appendChild');
    const removeSpy = jest.spyOn(document.body, 'removeChild');

    const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
    sinks.downloadPdf(blob, 'claim-home-loan-2026-01-15.pdf');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    // Revocation is deferred via setTimeout(..., 0) — not yet called synchronously.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    jest.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    const anchorArg = appendSpy.mock.calls[0]![0] as HTMLAnchorElement;
    expect(anchorArg.download).toBe('claim-home-loan-2026-01-15.pdf');
    expect(anchorArg.href).toContain('blob:mock-url');
  });

  it('revokes the object URL only after the click is triggered AND the deferred timer fires (not before)', () => {
    const callOrder: string[] = [];
    (URL.createObjectURL as jest.Mock).mockImplementation(() => {
      callOrder.push('create');
      return 'blob:mock-url';
    });
    (URL.revokeObjectURL as jest.Mock).mockImplementation(() => {
      callOrder.push('revoke');
    });
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        el.click = () => callOrder.push('click');
      }
      return el;
    });

    sinks.downloadPdf(new Blob(['x']), 'file.pdf');
    // Click has fired synchronously, but the revoke timer has not yet run.
    expect(callOrder).toEqual(['create', 'click']);

    jest.runAllTimers();
    expect(callOrder).toEqual(['create', 'click', 'revoke']);
  });
});

describe('createPreviewUrl', () => {
  it('delegates to URL.createObjectURL and returns the resulting URL', () => {
    (URL.createObjectURL as jest.Mock).mockReturnValue('blob:preview-url');
    const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });

    const url = sinks.createPreviewUrl(blob);

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(url).toBe('blob:preview-url');
  });

  it('does NOT revoke any previous URL itself (caller-managed revocation)', () => {
    sinks.createPreviewUrl(new Blob(['x']));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});

describe('uploadToPaperless', () => {
  it('delegates to paperlessApi.uploadPaperlessDocument with the blob and title', async () => {
    mockUploadPaperlessDocument.mockResolvedValueOnce({ taskId: 'task-123' });

    const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
    await sinks.uploadToPaperless(blob, 'claim-home-loan-2026-01-15');

    expect(mockUploadPaperlessDocument).toHaveBeenCalledWith(blob, 'claim-home-loan-2026-01-15');
  });

  it('propagates errors from uploadPaperlessDocument', async () => {
    const err = new Error('upload failed');
    mockUploadPaperlessDocument.mockRejectedValueOnce(err);

    await expect(sinks.uploadToPaperless(new Blob(['x']), 'title')).rejects.toThrow(
      'upload failed',
    );
  });
});
