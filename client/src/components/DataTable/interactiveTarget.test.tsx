/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { isInteractiveDescendantClick } from './interactiveTarget.js';

/** Renders a row-like container and returns what the guard says for a click on `testId`. */
function guardFor(testId: string | null): boolean {
  let result: boolean | null = null;
  render(
    <div
      data-testid="row"
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        result = isInteractiveDescendantClick(e);
      }}
    >
      <table>
        <tbody>
          <tr>
            <td data-testid="cell">plain text</td>
            <td>
              <a href="/x" data-testid="link">
                <span data-testid="in-link">inner</span>
              </a>
            </td>
            <td>
              <button type="button" data-testid="button">
                b
              </button>
            </td>
            <td>
              <div role="button" tabIndex={0} data-testid="role-button">
                r
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>,
  );
  fireEvent.click(screen.getByTestId(testId ?? 'row'));
  if (result === null) throw new Error('handler did not run');
  return result;
}

describe('isInteractiveDescendantClick', () => {
  it.each(['link', 'button', 'in-link', 'role-button'])(
    'returns true for a click on %s',
    (testId) => {
      expect(guardFor(testId)).toBe(true);
    },
  );

  it('returns false for a plain cell', () => {
    expect(guardFor('cell')).toBe(false);
  });

  it('returns false when the click target is the row itself', () => {
    expect(guardFor(null)).toBe(false);
  });

  it('returns false when the target is not an Element', () => {
    const fake = {
      target: document.createTextNode('t'),
      currentTarget: document.createElement('div'),
    } as unknown as React.MouseEvent<HTMLElement>;
    expect(isInteractiveDescendantClick(fake)).toBe(false);
  });
});
