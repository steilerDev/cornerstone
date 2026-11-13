/**
 * @jest-environment jsdom
 *
 * The purchase page's Cost tab (#2249, D12): the cost lines, then the grants that cover the
 * purchase. Both are covered per module; here they are stubs that expose what the panel hands them.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { makeCostLineRow } from '../../test/costLineFixtures.js';
import { makePurchasePage } from '../../test/purchasePageFixtures.js';
import type * as SubsidiesApiTypes from '../../lib/householdItemSubsidiesApi.js';

const mockFetchGrants = jest.fn<typeof SubsidiesApiTypes.fetchHouseholdItemSubsidies>();
const mockLink = jest.fn<typeof SubsidiesApiTypes.linkHouseholdItemSubsidy>();
const mockUnlink = jest.fn<typeof SubsidiesApiTypes.unlinkHouseholdItemSubsidy>();

jest.unstable_mockModule('../../lib/householdItemSubsidiesApi.js', () => ({
  fetchHouseholdItemSubsidies: mockFetchGrants,
  linkHouseholdItemSubsidy: mockLink,
  unlinkHouseholdItemSubsidy: mockUnlink,
}));
jest.unstable_mockModule('../../components/CostLineTable/CostLinesSection.js', () => ({
  CostLinesSection: (props: {
    host: { kind: string; id: string; label: string };
    lines: unknown[];
    headingLevel: number;
    onChanged: () => void;
  }) => (
    <div
      data-testid="cost-lines"
      data-host={JSON.stringify(props.host)}
      data-level={props.headingLevel}
    >
      <span data-testid="cost-lines-count">{props.lines.length}</span>
      <button type="button" data-testid="cost-lines-changed" onClick={props.onChanged} />
    </div>
  ),
}));
jest.unstable_mockModule('../../components/RelatedList/GrantLinksList.js', () => ({
  GrantLinksList: (props: {
    revision: number;
    load: () => Promise<unknown>;
    link: (id: string) => Promise<unknown>;
    unlink: (id: string) => Promise<unknown>;
    onChanged: () => void;
    labels: Record<string, string>;
    testId: string;
  }) => (
    <div
      data-testid={props.testId}
      data-revision={props.revision}
      data-labels={JSON.stringify(props.labels)}
    >
      <button type="button" data-testid="grants-load" onClick={() => void props.load()} />
      <button type="button" data-testid="grants-link" onClick={() => void props.link('g-1')} />
      <button type="button" data-testid="grants-unlink" onClick={() => void props.unlink('g-1')} />
      <button type="button" data-testid="grants-changed" onClick={props.onChanged} />
    </div>
  ),
}));

const { PurchaseCostPanel, default: DefaultPanel } = await import('./PurchaseCostPanel.js');

const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/household-items/hi-1?tab=cost', name: 'Sample sofa' } };

function renderPanel(revision = 3) {
  return render(
    <PurchaseCostPanel
      purchase={makePurchasePage({ budgets: [makeCostLineRow()] as never })}
      revision={revision}
      refresh={refresh}
      originState={ORIGIN}
      headingRef={{ current: null }}
    />,
  );
}

describe('PurchaseCostPanel', () => {
  beforeEach(() => {
    for (const mock of [mockFetchGrants, mockLink, mockUnlink, refresh]) mock.mockReset();
    mockFetchGrants.mockResolvedValue([]);
    mockLink.mockResolvedValue({} as never);
    mockUnlink.mockResolvedValue({ undo: null } as never);
    refresh.mockResolvedValue(undefined);
  });

  it('exports the panel as the default too', () => {
    expect(DefaultPanel).toBe(PurchaseCostPanel);
  });

  it('hands the cost lines section the purchase as host, its lines, a level 2 heading and the refresh', () => {
    renderPanel();
    expect(JSON.parse(screen.getByTestId('cost-lines').dataset.host!)).toEqual({
      kind: 'household_item',
      id: 'hi-1',
      label: 'Sample sofa',
    });
    expect(screen.getByTestId('cost-lines').dataset.level).toBe('2');
    expect(screen.getByTestId('cost-lines-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('cost-lines-changed'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the grants below the cost lines with the purchase labels and the revision', () => {
    renderPanel(3);
    const grants = screen.getByTestId('purchase-grants');
    expect(
      screen.getByTestId('cost-lines').compareDocumentPosition(grants) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(grants.dataset.revision).toBe('3');
    expect(JSON.parse(grants.dataset.labels!)).toEqual({
      title: 'Grants',
      empty: 'No grant covers this purchase.',
      add: 'Add',
      loadError: "Couldn't load the list.",
      linkError: "Couldn't add it. Try again.",
    });
    expect(screen.getByTestId('purchase-cost-panel')).toContainElement(grants);
  });

  it('loads, links and unlinks grants of this purchase through the purchase API', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('grants-load'));
    fireEvent.click(screen.getByTestId('grants-link'));
    fireEvent.click(screen.getByTestId('grants-unlink'));
    fireEvent.click(screen.getByTestId('grants-changed'));
    expect(mockFetchGrants).toHaveBeenCalledWith('hi-1');
    expect(mockLink).toHaveBeenCalledWith('hi-1', 'g-1');
    expect(mockUnlink).toHaveBeenCalledWith('hi-1', 'g-1');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
