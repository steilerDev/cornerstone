import { describe, it, expect, afterEach } from '@jest/globals';
import { findDuplicateTestIds } from './findDuplicateTestIds.js';

function html(markup: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = markup;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findDuplicateTestIds', () => {
  it('returns an empty array when every data-testid is unique', () => {
    const root = html('<i data-testid="a"></i><i data-testid="b"></i>');
    expect(findDuplicateTestIds(root)).toEqual([]);
  });

  it('returns an empty array when there are no test ids at all', () => {
    expect(findDuplicateTestIds(html('<p>x</p>'))).toEqual([]);
  });

  it('reports a duplicated id once', () => {
    const root = html('<i data-testid="a"></i><i data-testid="a"></i><i data-testid="b"></i>');
    expect(findDuplicateTestIds(root)).toEqual(['a']);
  });

  it('reports each duplicate once, sorted, even when repeated three times', () => {
    const root = html(
      '<i data-testid="z"></i><i data-testid="b"></i><i data-testid="z"></i>' +
        '<i data-testid="b"></i><i data-testid="b"></i><i data-testid="ok"></i>',
    );
    expect(findDuplicateTestIds(root)).toEqual(['b', 'z']);
  });

  it('ignores empty data-testid values', () => {
    const root = html('<i data-testid=""></i><i data-testid=""></i>');
    expect(findDuplicateTestIds(root)).toEqual([]);
  });

  it('scopes to the given root subtree, excluding nodes outside it', () => {
    const root = html('<i data-testid="a"></i>');
    const outside = html('<i data-testid="a"></i>');
    expect(outside).not.toBe(root);
    expect(findDuplicateTestIds(root)).toEqual([]);
    expect(findDuplicateTestIds()).toEqual(['a']); // default root = document
  });
});
