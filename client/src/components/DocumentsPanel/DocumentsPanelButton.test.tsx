import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { createRef } from 'react';
import type * as ButtonModule from './DocumentsPanelButton.js';
import type { DocumentsPanelHost } from './useDocumentsPanel.js';

const mockOpen = jest.fn();
const mockOpenLink = jest.fn();
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
  openLink: mockOpenLink,
  triggerRef: createRef<HTMLButtonElement>(),
  fact: null,
  panel: <div data-testid="the-panel" />,
  ...overrides,
});

beforeEach(async () => {
  ({ DocumentsPanelButton } = (await import('./DocumentsPanelButton.js')) as typeof ButtonModule);
  mockOpen.mockReset();
  mockOpenLink.mockReset();
  mockArgs = [];
  mockHost = makeHost();
});

describe('DocumentsPanelButton', () => {
  it('passes the entity to the host hook', () => {
    render(<DocumentsPanelButton entityType="budget_source" entityId="src-1" />);

    expect(mockArgs).toEqual(['budget_source', 'src-1']);
  });

  it('wraps the button and panel in a div with wrapperClassName only while the button shows', () => {
    const { container } = render(
      <DocumentsPanelButton entityType="work_item" entityId="wi-1" wrapperClassName="section" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper).toHaveClass('section');
    expect(wrapper).toContainElement(screen.getByTestId('documents-panel-button'));
    expect(wrapper).toContainElement(screen.getByTestId('the-panel'));
  });

  it('renders no wrapper element without wrapperClassName', () => {
    const { container } = render(<DocumentsPanelButton entityType="work_item" entityId="wi-1" />);
    expect(container.firstElementChild).toBe(screen.getByTestId('documents-panel-button'));
  });

  it.each(['pending', 'hidden'] as const)(
    'renders no empty wrapper box while the host is %s',
    (mode) => {
      mockHost = makeHost({ mode });
      const { container } = render(
        <DocumentsPanelButton entityType="work_item" entityId="wi-1" wrapperClassName="section" />,
      );
      expect(container).toBeEmptyDOMElement();
    },
  );

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

  describe('linkAction (#2242, MNY-030 / JRN-074)', () => {
    it('shows a Link button after the count in full mode and opens the picker through the host', () => {
      render(
        <DocumentsPanelButton
          entityType="budget_source"
          entityId="src-1"
          contextName="Loan Alpha"
          linkAction
          testId="docs"
        />,
      );

      const link = screen.getByTestId('docs-link');
      expect(link).toHaveTextContent('Link');
      expect(link).toHaveAttribute('aria-haspopup', 'dialog');
      expect(link).toHaveAccessibleName('Link a document to Loan Alpha');
      fireEvent.click(link);
      expect(mockOpenLink).toHaveBeenCalledTimes(1);
      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('has no aria-label without a contextName', () => {
      render(
        <DocumentsPanelButton entityType="work_item" entityId="wi-1" linkAction testId="docs" />,
      );
      expect(screen.getByTestId('docs-link')).not.toHaveAttribute('aria-label');
    });

    it.each(['readOnly', 'unreachable'] as const)('is absent in %s mode', (mode) => {
      mockHost = makeHost({ mode });
      render(
        <DocumentsPanelButton entityType="work_item" entityId="wi-1" linkAction testId="docs" />,
      );
      expect(screen.queryByTestId('docs-link')).toBeNull();
    });

    it('is absent unless asked for', () => {
      render(<DocumentsPanelButton entityType="work_item" entityId="wi-1" testId="docs" />);
      expect(screen.queryByTestId('docs-link')).toBeNull();
    });
  });
});
