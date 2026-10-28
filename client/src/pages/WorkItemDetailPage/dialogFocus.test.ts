/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { restoreFocusAfterDialog } from './dialogFocus.js';

describe('restoreFocusAfterDialog', () => {
  let add: HTMLButtonElement;
  let heading: HTMLHeadingElement;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    add = document.createElement('button');
    add.dataset.testid = 'list-add';
    heading = document.createElement('h1');
    heading.tabIndex = -1;
    opener = document.createElement('button');
    document.body.append(add, heading, opener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('focuses the list Add button when the opener is gone and focus fell to the body', () => {
    opener.remove();
    restoreFocusAfterDialog({ current: opener }, 'list-add', { current: heading });
    expect(add).toHaveFocus();
  });

  it('falls back to the page heading when there is no Add button', () => {
    opener.remove();
    add.remove();
    restoreFocusAfterDialog({ current: opener }, 'list-add', { current: heading });
    expect(heading).toHaveFocus();
  });

  it('does nothing when there is neither an Add button nor a heading', () => {
    opener.remove();
    add.remove();
    restoreFocusAfterDialog({ current: null }, 'list-add', { current: null });
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves focus alone while the opener is still on the page', () => {
    restoreFocusAfterDialog({ current: opener }, 'list-add', { current: heading });
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves focus alone when it is already somewhere useful', () => {
    opener.remove();
    heading.focus();
    restoreFocusAfterDialog({ current: opener }, 'list-add', { current: heading });
    expect(heading).toHaveFocus();
    expect(add).not.toHaveFocus();
  });
});
