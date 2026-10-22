/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { copyText } from './copyText.js';

type ExecCommand = (commandId: string) => boolean;
const doc = document as unknown as { execCommand: ExecCommand | undefined };
const originalExec = doc.execCommand;
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

afterEach(() => {
  doc.execCommand = originalExec;
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else delete (navigator as unknown as Record<string, unknown>).clipboard;
  jest.restoreAllMocks();
});

describe('copyText', () => {
  it('writes through the Clipboard API and never touches the DOM fallback', async () => {
    const writeText = jest.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const exec = jest.fn<ExecCommand>().mockReturnValue(true);
    doc.execCommand = exec;

    await expect(copyText('https://example.test/tasks/1')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('https://example.test/tasks/1');
    expect(exec).not.toHaveBeenCalled();
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    setClipboard({ writeText: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('no')) });
    let copied = '';
    doc.execCommand = jest.fn<ExecCommand>((command) => {
      copied = (document.querySelector('textarea') as HTMLTextAreaElement).value;
      return command === 'copy';
    });

    await expect(copyText('fallback text')).resolves.toBe(true);

    expect(copied).toBe('fallback text');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('uses the fallback when there is no clipboard object (plain http)', async () => {
    setClipboard(undefined);
    const exec = jest.fn<ExecCommand>().mockReturnValue(true);
    doc.execCommand = exec;

    await expect(copyText('plain http')).resolves.toBe(true);

    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('resolves false when execCommand reports failure, and removes the textarea', async () => {
    setClipboard(undefined);
    doc.execCommand = jest.fn<ExecCommand>().mockReturnValue(false);

    await expect(copyText('nope')).resolves.toBe(false);

    expect(document.querySelector('textarea')).toBeNull();
  });

  it('resolves false when execCommand throws, and removes the textarea', async () => {
    setClipboard({ writeText: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('no')) });
    doc.execCommand = jest.fn<ExecCommand>(() => {
      throw new Error('blocked');
    });

    await expect(copyText('nope')).resolves.toBe(false);

    expect(document.querySelector('textarea')).toBeNull();
  });

  it('restores focus to the previously focused element after the fallback copy', async () => {
    setClipboard(undefined);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    doc.execCommand = jest.fn<ExecCommand>(() => {
      // select() moved focus into the textarea
      (document.querySelector('textarea') as HTMLTextAreaElement).focus();
      return true;
    });

    await expect(copyText('x')).resolves.toBe(true);

    expect(document.activeElement).toBe(button);
    button.remove();
  });

  it('restores focus also when the fallback copy fails', async () => {
    setClipboard(undefined);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    doc.execCommand = jest.fn<ExecCommand>(() => {
      (document.querySelector('textarea') as HTMLTextAreaElement).focus();
      return false;
    });

    await expect(copyText('x')).resolves.toBe(false);

    expect(document.activeElement).toBe(button);
    button.remove();
  });

  it('leaves focus alone when nothing focusable held it (body)', async () => {
    setClipboard(undefined);
    doc.execCommand = jest.fn<ExecCommand>().mockReturnValue(true);
    (document.activeElement as HTMLElement | null)?.blur();

    await expect(copyText('x')).resolves.toBe(true);

    expect(document.activeElement).toBe(document.body);
  });

  it('does not try to focus a non-HTML previously focused element (an SVG)', async () => {
    setClipboard(undefined);
    doc.execCommand = jest.fn<ExecCommand>().mockReturnValue(true);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('tabindex', '0');
    document.body.appendChild(svg);
    svg.focus();

    await expect(copyText('x')).resolves.toBe(true);

    expect(document.querySelector('textarea')).toBeNull();
    svg.remove();
  });
});
