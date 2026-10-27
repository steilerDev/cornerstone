/**
 * Component POM for the shared SummaryStrip (detail template, #2233 / #2239).
 *
 * The strip is a `<section data-testid="<testId>">` (default `summary-strip`; the invoice page
 * passes `invoice-summary`) holding a `<dl>`. Each fact is a `<div data-span-lg>` item with a
 * `<dt>` label and a `<dd>` whose target (link, tab link, button or static span) carries
 * `summary-fact-<id>`. Values that are money figures carry `data-figure="<kind>"`.
 */

import type { Locator, Page } from '@playwright/test';

export interface FactBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly right: number;
  readonly bottom: number;
}

export class SummaryStripControl {
  readonly page: Page;
  readonly root: Locator;
  readonly items: Locator;

  constructor(page: Page, testId = 'summary-strip') {
    this.page = page;
    this.root = page.getByTestId(testId);
    this.items = this.root.locator('dl > div[data-span-lg]');
  }

  /** The interactive or static target of a fact. */
  fact(id: string): Locator {
    return this.root.getByTestId(`summary-fact-${id}`);
  }

  /** The grid cell (`div`) of a fact: label and value together. */
  item(id: string): Locator {
    return this.fact(id).locator('xpath=ancestor::div[@data-span-lg][1]');
  }

  /** The label (`dt`) of a fact. */
  label(id: string): Locator {
    return this.item(id).locator('dt');
  }

  /** Every `data-figure` marker of one kind inside the strip. */
  figure(kind: string): Locator {
    return this.root.locator(`[data-figure="${kind}"]`);
  }

  /** The ids of the facts shown, in order. */
  async factIds(): Promise<string[]> {
    const ids = await this.root
      .locator('[data-testid^="summary-fact-"]')
      .evaluateAll((els) =>
        els.map((el) => (el.getAttribute('data-testid') ?? '').replace('summary-fact-', '')),
      );
    return ids;
  }

  /** Bounding boxes of the fact cells, in order (the strip must be visible). */
  async boxes(): Promise<FactBox[]> {
    const ids = await this.factIds();
    const boxes: FactBox[] = [];
    for (const id of ids) {
      const box = await this.item(id).boundingBox();
      if (!box) throw new Error(`Summary fact "${id}" has no box`);
      boxes.push({
        id,
        x: box.x,
        y: box.y,
        right: box.x + box.width,
        bottom: box.y + box.height,
      });
    }
    return boxes;
  }

  /** The number of distinct visual rows (cells whose tops differ by more than 2 px). */
  static distinct(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    let count = 0;
    let last = Number.NEGATIVE_INFINITY;
    for (const value of sorted) {
      if (value - last > 2) count += 1;
      last = value;
    }
    return count;
  }

  async rowCount(): Promise<number> {
    return SummaryStripControl.distinct((await this.boxes()).map((box) => box.y));
  }

  async columnCount(): Promise<number> {
    return SummaryStripControl.distinct((await this.boxes()).map((box) => box.x));
  }

  /** The strip's own bounding box. */
  async stripBox(): Promise<{ x: number; y: number; right: number; bottom: number }> {
    const box = await this.root.boundingBox();
    if (!box) throw new Error('Summary strip has no box');
    return { x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height };
  }
}
