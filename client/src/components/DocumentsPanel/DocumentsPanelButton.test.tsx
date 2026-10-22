import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { createRef } from 'react';
import type * as ButtonModule from './DocumentsPanelButton.js';
import type { DocumentsPanelHost } from './useDocumentsPanel.js';

const mockOpen = jest.fn();
let mockHost: DocumentsPanelHost;
let mockArgs: unknown[] = [];

jest.unstable_mockModule('./useDocumentsPanel.js', () => ({
  useDocumentsPanel: (...args: unknown[]) => {
    mockArgs = args;
    return mockHost;
  },
}));

let DocumentsPanelButton: (typeof ButtonModule)['DocumentsPanelButton'];

const makeHost = (overrides: Partial<DocumentsPanelHost> = {}): DocumentsPanelHost => ({
  mode: 'full',
  count: 3,
  isOpen: false,
  open: mockOpen,
  triggerRef: createRef<HTMLButtonElement>(),
  fact: null,
  panel: <div data-testid="the-panel" />,
  ...overrides,
});

beforeEach(async () => {
  ({ DocumentsPanelButton } = (await import('./DocumentsPanelButton.js')) as typeof ButtonModule);
  mockOpen.mockReset();
  mockArgs = [];
  mockHost = makeHost();
});

describe('DocumentsPanelButton', () => {
  it('passes the entity to the host hook', () => {
    render(<DocumentsPanelButton entityType="budget_source" entityId="src-1" />);

    expect(mockArgs).toEqual(['budget_source', 'src-1']);
  });

  it.each(['pending', 'hidden'] as const)(
    'renders nothing (not even the panel) while %s',
    (mode) => {
      mockHost = makeHost({ mode });
      const { container } = render(<DocumentsPanelButton entityType="work_item" entityId="wi-1" />);

      expect(container).toBeEmptyDOMElement();
    },
  );

  it.each(['full', 'readOnly', 'unreachable'] as const)(
    'renders the button and the panel in %s mode',
    (mode) => {
      mockHost = makeHost({ mode });
      render(<DocumentsPanelButton entityType="work_item" entityId="wi-1" />);

      expect(screen.getByTestId('documents-panel-button')).toBeInTheDocument();
      expect(screen.getByTestId('the-panel')).toBeInTheDocument();
    },
  );

  it('shows "Documents (n)", including zero', () => {
    mockHost = makeHost({ count: 0 });
    render(<DocumentsPanelButton entityType="work_item" entityId="wi-1" />);

    expect(screen.getByRole('button', { name: 'Documents (0)' })).toBeInTheDocument();
  });

  it('shows plain "Documents" while the count is loading', () => {
    mockHost = makeHost({ count: null });
    render(
      <DocumentsPanelButton entityType="work_item" entityId="wi-1" contextName="Fixture source" />,
    );

    const button = screen.getByTestId('documents-panel-button');
    expect(button).toHaveTextContent(/^Documents$/);
    expect(button).not.toHaveAttribute('aria-label');
  });

  it('names the record with contextName; the accessible name starts with the visible text', () => {
    render(
      <DocumentsPanelButton
        entityType="budget_source"
        entityId="src-1"
        contextName="Fixture source"
      />,
    );

    const button = screen.getByTestId('documents-panel-button');
    expect(button).toHaveAttribute('aria-label', 'Documents (3) for Fixture source');
    expect(button).toHaveAccessibleName('Documents (3) for Fixture source');
    expect(button.textContent).toBe('Documents (3)');
    expect(button.getAttribute('aria-label')?.startsWith(button.textContent ?? '')).toBe(true);
  });

  it('has no aria-label without contextName', () => {
    render(<DocumentsPanelButton entityType="work_item" entityId="wi-1" />);

    expect(screen.getByTestId('documents-panel-button')).not.toHaveAttribute('aria-label');
  });

  it('is a dialog trigger reflecting the open state and opening through the host', () => {
    mockHost = makeHost({ isOpen: true });
    render(<DocumentsPanelButton entityType="work_item" entityId="wi-1" />);
    const button = screen.getByTestId('documents-panel-button');

    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('attaches the host trigger ref to the button and accepts a custom test id', () => {
    render(<DocumentsPanelButton entityType="work_item" entityId="wi-1" testId="source-docs-s1" />);

    expect(mockHost.triggerRef.current).toBe(screen.getByTestId('source-docs-s1'));
  });
});
