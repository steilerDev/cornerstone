import { describe, it, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import { HighlightedText } from './HighlightedText.js';

function renderText(text: string, query: string): HTMLElement {
  const { container } = render(
    <p data-testid="host">
      <HighlightedText text={text} query={query} />
    </p>,
  );
  return container.querySelector('[data-testid="host"]') as HTMLElement;
}

describe('HighlightedText', () => {
  it('renders the plain text without marks when nothing matches', () => {
    const host = renderText('Kitchen tiles', 'bath');
    expect(host.querySelectorAll('mark')).toHaveLength(0);
    expect(host.textContent).toBe('Kitchen tiles');
  });

  it('renders unmatched text bare, without a wrapper element', () => {
    const host = renderText('Kitchen tiles', 'bath');
    expect(host.children).toHaveLength(0);
    expect(host.childNodes).toHaveLength(1);
  });

  it('renders the plain text without marks for a blank query', () => {
    const host = renderText('Kitchen tiles', '   ');
    expect(host.querySelectorAll('mark')).toHaveLength(0);
    expect(host.textContent).toBe('Kitchen tiles');
  });

  it('wraps the match in a mark and keeps the surrounding text', () => {
    const host = renderText('Kitchen tiles', 'tiles');
    const marks = host.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('tiles');
    expect(host.textContent).toBe('Kitchen tiles');
  });

  it('marks every occurrence and the text between them', () => {
    const host = renderText('roof and Roof', 'roof');
    const marks = Array.from(host.querySelectorAll('mark')).map((m) => m.textContent);
    expect(marks).toEqual(['roof', 'Roof']);
    expect(host.textContent).toBe('roof and Roof');
  });

  it('marks a match at the very start and the very end without empty pieces', () => {
    const host = renderText('Dach', 'dach');
    expect(host.querySelectorAll('mark')).toHaveLength(1);
    expect(host.textContent).toBe('Dach');
  });

  it('marks the original characters when the match goes through German folding', () => {
    const host = renderText('Müller Bau', 'mueller');
    const marks = host.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('Müller');
  });

  it('never renders markup contained in the text as HTML', () => {
    const host = renderText('<b>bold</b> tag', 'bold');
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toBe('<b>bold</b> tag');
    expect(host.querySelector('mark')!.textContent).toBe('bold');
  });
});
