/**
 * @jest-environment jsdom
 */
import { createRef } from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FileList, type FileListItem } from './FileList.js';

function makeItem(overrides: Partial<FileListItem> = {}): FileListItem {
  return {
    id: '1',
    name: 'claim-home-loan-2026-01-15-part-1-of-2.pdf',
    meta: 'Part 1 of 2 · 1.0 MB · 2 attachments',
    actionLabel: 'Download',
    actionAriaLabel: 'Download claim-home-loan-2026-01-15-part-1-of-2.pdf',
    onAction: jest.fn(),
    ...overrides,
  };
}

describe('FileList', () => {
  it('renders a section labelled by its heading, with the summary and one row per item', () => {
    render(
      <FileList
        heading="Generated files"
        summary="2 files, 1.5 MB in total"
        items={[makeItem(), makeItem({ id: '2', name: 'second.pdf', meta: 'Part 2 of 2' })]}
      />,
    );

    const section = screen.getByRole('region', { name: 'Generated files' });
    const heading = within(section).getByRole('heading', { level: 3, name: 'Generated files' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(within(section).getByText('2 files, 1.5 MB in total')).toBeInTheDocument();
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('second.pdf')).toBeInTheDocument();
    expect(screen.getByText('Part 2 of 2')).toBeInTheDocument();
  });

  it('describes the list by the summary paragraph via aria-describedby', () => {
    render(<FileList heading="Files" summary="Summary text" items={[makeItem()]} />);

    const list = screen.getByRole('list');
    const describedBy = list.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(screen.getByText('Summary text').id).toBe(describedBy);
  });

  it('uses the default test id prefix and per-row ids', () => {
    render(<FileList heading="Files" summary="s" items={[makeItem({ id: '7' })]} />);

    expect(screen.getByTestId('file-list')).toBeInTheDocument();
    expect(screen.getByTestId('file-list-row-7')).toBeInTheDocument();
    expect(screen.getByTestId('file-list-action-7')).toHaveTextContent('Download');
  });

  it('honours a custom test id prefix', () => {
    render(
      <FileList heading="Files" summary="s" items={[makeItem()]} testIdPrefix="report-parts" />,
    );

    expect(screen.getByTestId('report-parts')).toBeInTheDocument();
    expect(screen.getByTestId('report-parts-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('report-parts-action-1')).toBeInTheDocument();
  });

  it('fires onAction when the row action is clicked and exposes the aria-label', () => {
    const onAction = jest.fn();
    render(<FileList heading="Files" summary="s" items={[makeItem({ onAction })]} />);

    const button = screen.getByRole('button', {
      name: 'Download claim-home-loan-2026-01-15-part-1-of-2.pdf',
    });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('disables the action when actionDisabled is true and enables it otherwise', () => {
    const onAction = jest.fn();
    render(
      <FileList
        heading="Files"
        summary="s"
        items={[
          makeItem({ id: 'a', actionDisabled: true, onAction }),
          makeItem({ id: 'b', actionDisabled: false }),
          makeItem({ id: 'c' }),
        ]}
      />,
    );

    expect(screen.getByTestId('file-list-action-a')).toBeDisabled();
    expect(screen.getByTestId('file-list-action-b')).toBeEnabled();
    expect(screen.getByTestId('file-list-action-c')).toBeEnabled();
    fireEvent.click(screen.getByTestId('file-list-action-a'));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders badges and detail only when provided', () => {
    render(
      <FileList
        heading="Files"
        summary="s"
        items={[
          makeItem({ id: 'with', badges: <span>Over limit</span>, detail: 'Failed: boom' }),
          makeItem({ id: 'without', badges: undefined, detail: null }),
        ]}
      />,
    );

    const withRow = screen.getByTestId('file-list-row-with');
    expect(within(withRow).getByText('Over limit')).toBeInTheDocument();
    expect(within(withRow).getByText('Failed: boom')).toBeInTheDocument();
    const withoutRow = screen.getByTestId('file-list-row-without');
    expect(within(withoutRow).queryByText('Over limit')).not.toBeInTheDocument();
    expect(within(withoutRow).queryByText('Failed: boom')).not.toBeInTheDocument();
  });

  it('renders children between the summary and the list', () => {
    render(
      <FileList heading="Files" summary="Summary text" items={[makeItem()]}>
        <p>Stale notice</p>
      </FileList>,
    );

    const summary = screen.getByText('Summary text');
    const notice = screen.getByText('Stale notice');
    const list = screen.getByRole('list');
    expect(summary.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('forwards headingRef so the heading can be focused programmatically', () => {
    const ref = createRef<HTMLHeadingElement>();
    render(<FileList heading="Files" summary="s" items={[makeItem()]} headingRef={ref} />);

    expect(ref.current).toBe(screen.getByRole('heading', { name: 'Files' }));
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
  });

  it('renders an empty list without rows', () => {
    render(<FileList heading="Files" summary="s" items={[]} />);

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
