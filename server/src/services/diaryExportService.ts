/**
 * Diary export service — PDF generation for construction diary entries.
 *
 * EPIC-17: Diary PDF Export
 *
 * Generates PDF documents with filtered diary entries, photos, and signatures.
 */

import PDFDocument from 'pdfkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, desc, and, gte, lte, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { diaryEntries, photos, users } from '../db/schema.js';
import { ValidationError, ExportEmptyError } from '../errors/AppError.js';
import type {
  DiaryEntryType,
  DiaryEntrySummary,
  DiaryUserSummary,
  DiaryEntryMetadata,
} from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Options for PDF export.
 */
export interface DiaryExportOptions {
  dateFrom?: string;
  dateTo?: string;
  types?: string;
  includeAutomatic?: boolean;
  includePhotos?: boolean;
}

/**
 * Convert database user row to DiaryUserSummary shape.
 */
function toDiaryUserSummary(user: typeof users.$inferSelect | null): DiaryUserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
  };
}

/**
 * Parse metadata from JSON string, returning null if not present or invalid.
 */
function parseMetadata(metadata: string | null): DiaryEntryMetadata | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

/**
 * Convert database diary entry row to DiaryEntrySummary shape.
 */
function toDiarySummary(
  entry: typeof diaryEntries.$inferSelect,
  user: typeof users.$inferSelect | null,
  photoCount: number,
): DiaryEntrySummary {
  return {
    id: entry.id,
    entryType: entry.entryType as any,
    entryDate: entry.entryDate,
    title: entry.title,
    body: entry.body,
    metadata: parseMetadata(entry.metadata),
    isAutomatic: entry.isAutomatic,
    sourceEntityType: entry.sourceEntityType as any,
    sourceEntityId: entry.sourceEntityId,
    photoCount,
    createdBy: toDiaryUserSummary(user),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Type label strings for display.
 */
const TYPE_LABELS: Record<DiaryEntryType, string> = {
  daily_log: 'Daily Log',
  site_visit: 'Site Visit',
  delivery: 'Delivery',
  issue: 'Issue',
  general_note: 'General Note',
  work_item_status: 'Work Item Status',
  invoice_status: 'Invoice Status',
  milestone_delay: 'Milestone Delay',
  budget_breach: 'Budget Breach',
  auto_reschedule: 'Auto Reschedule',
  subsidy_status: 'Subsidy Status',
};

/**
 * Query diary entries matching the export filters.
 */
function queryDiaryEntriesForExport(
  db: DbType,
  options: DiaryExportOptions,
): { entry: typeof diaryEntries.$inferSelect; user: typeof users.$inferSelect | null }[] {
  const conditions: SQL<unknown>[] = [];

  // Filter by type(s)
  if (options.types) {
    type EntryTypeValue = typeof diaryEntries.entryType._.data;
    const types = options.types
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean) as EntryTypeValue[];
    if (types.length === 1) {
      conditions.push(eq(diaryEntries.entryType, types[0]));
    } else if (types.length > 1) {
      conditions.push(inArray(diaryEntries.entryType, types));
    }
  }

  // Filter by date range
  if (options.dateFrom) {
    conditions.push(gte(diaryEntries.entryDate, options.dateFrom));
  }

  if (options.dateTo) {
    conditions.push(lte(diaryEntries.entryDate, options.dateTo));
  }

  // Filter by automatic vs manual
  if (options.includeAutomatic === false) {
    conditions.push(eq(diaryEntries.isAutomatic, false));
  } else if (options.includeAutomatic === true) {
    // Include all (automatic and manual)
  } else {
    // By default, include only manual entries
    conditions.push(eq(diaryEntries.isAutomatic, false));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Query entries in chronological order (ASC for reading)
  return db
    .select({
      entry: diaryEntries,
      user: users,
    })
    .from(diaryEntries)
    .leftJoin(users, eq(users.id, diaryEntries.createdBy))
    .where(whereClause)
    .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.createdAt))
    .all();
}

/**
 * Fetch photos for an entity.
 */
function getPhotosForEntity(db: DbType, entityId: string): (typeof photos.$inferSelect)[] {
  return db
    .select()
    .from(photos)
    .where(and(eq(photos.entityType, 'diary_entry'), eq(photos.entityId, entityId)))
    .orderBy(photos.sortOrder, photos.createdAt)
    .all();
}

/**
 * Read photo file from disk, up to 4 photos per entry.
 */
async function readPhotoFile(
  photoStoragePath: string,
  photoUuid: string,
  ext: string,
): Promise<Buffer | null> {
  const photoPath = path.join(photoStoragePath, photoUuid, `original.${ext}`);
  try {
    const fileBuffer = await readFile(photoPath);
    return fileBuffer;
  } catch {
    return null;
  }
}

/**
 * Generate a PDF document of diary entries.
 *
 * @param db Database instance
 * @param photoStoragePath Path to stored photos
 * @param options Export options (filters, date range, etc.)
 * @returns Promise resolving to a Buffer containing the PDF data
 * @throws ValidationError if date range > 365 days
 * @throws ExportEmptyError if no entries match the filters
 */
export async function generateDiaryPdf(
  db: DbType,
  photoStoragePath: string,
  options: DiaryExportOptions,
): Promise<Buffer> {
  // Validate date range
  if (options.dateFrom && options.dateTo) {
    const from = new Date(options.dateFrom);
    const to = new Date(options.dateTo);
    const daysDiff = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      throw new ValidationError('Date range cannot exceed 365 days');
    }
  }

  // Query entries
  const entryRows = queryDiaryEntriesForExport(db, options);

  if (entryRows.length === 0) {
    throw new ExportEmptyError();
  }

  // Create PDF document
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  // Collect PDF output
  const buffers: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => {
    buffers.push(chunk);
  });

  // Cover page
  doc.fontSize(28).font('Helvetica-Bold').text('Construction Diary', { align: 'center' });
  doc.moveDown(1);

  const dateRangeText =
    options.dateFrom && options.dateTo
      ? `${options.dateFrom} to ${options.dateTo}`
      : 'Full History';
  doc.fontSize(14).font('Helvetica').text(dateRangeText, { align: 'center' });
  doc.moveDown(2);

  const timestamp = new Date().toLocaleString();
  doc.fontSize(11).text(`Generated: ${timestamp}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.text(`Total Entries: ${entryRows.length}`, { align: 'center' });

  doc.addPage();

  // Table of Contents page
  doc.fontSize(18).font('Helvetica-Bold').text('Table of Contents', { underline: true });
  doc.moveDown(1);
  doc.fontSize(11).font('Helvetica');

  // Build TOC entries (list of dates/titles)
  const tocEntries: { date: string; title: string | null; pageNum: number }[] = [];
  let currentPageNum = 3; // Start after cover and TOC

  for (const row of entryRows) {
    tocEntries.push({
      date: row.entry.entryDate,
      title: row.entry.title || row.entry.entryType,
      pageNum: currentPageNum,
    });
    // Rough estimate: each entry takes ~1-2 pages depending on content/photos
    currentPageNum += Math.ceil(row.entry.body.length / 1500) + 1;
  }

  for (const toc of tocEntries) {
    const label = (toc.title ?? 'Untitled').substring(0, 50);
    doc.text(`${toc.date} - ${label}`);
  }

  // Entries pages
  for (const row of entryRows) {
    doc.addPage();

    const entry = row.entry;
    const user = row.user;

    // Entry header
    doc.fontSize(14).font('Helvetica-Bold').text(entry.entryDate, { underline: true });
    doc.moveDown(0.3);

    const typeLabel = TYPE_LABELS[entry.entryType as DiaryEntryType] || entry.entryType;
    doc.fontSize(12).font('Helvetica').text(typeLabel);

    if (entry.title) {
      doc.moveDown(0.5);
      doc.fontSize(13).font('Helvetica-Bold').text(entry.title);
    }

    doc.moveDown(0.5);

    // Metadata table (author, creation timestamp, type)
    const metaData = [
      ['Author:', user?.displayName || 'Unknown'],
      ['Created:', entry.createdAt.substring(0, 10)],
      ['Type:', entry.isAutomatic ? 'Automatic' : 'Manual'],
    ];

    const tableOptions = {
      width: doc.page.width - 80,
      x: 40,
      y: doc.y,
      rowHeight: 18,
      columnGap: 10,
      columns: [80, doc.page.width - 130],
    };

    // Draw table manually (PDFKit doesn't have built-in table support)
    doc.fontSize(10).font('Helvetica-Bold');
    for (const [label, value] of metaData) {
      doc.text(label, { width: 80, align: 'right' });
      doc.moveUp();
      doc.text(value, 130);
      doc.moveDown(0.8);
    }

    doc.moveDown(0.5);

    // Entry body
    doc
      .fontSize(11)
      .font('Helvetica')
      .text(entry.body, {
        align: 'left',
        width: doc.page.width - 80,
      });

    // Entry metadata (e.g., weather, severity, etc.)
    const entryMetadata = parseMetadata(entry.metadata);
    if (entryMetadata && Object.keys(entryMetadata).length > 0) {
      doc.moveDown(0.8);
      doc.fontSize(10).font('Helvetica-Bold').text('Entry Details:', { underline: true });
      doc.moveDown(0.3);
      doc.font('Helvetica');

      for (const [key, value] of Object.entries(entryMetadata)) {
        if (value !== null && value !== undefined && key !== 'signatureDataUrl') {
          const displayKey = key.replace(/([A-Z])/g, ' $1').trim();
          const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
          doc.fontSize(9).text(`${displayKey}: ${displayValue}`);
        }
      }
    }

    // Photos (if included and available)
    if (options.includePhotos) {
      const entryPhotos = getPhotosForEntity(db, entry.id);
      const photosToInclude = entryPhotos.slice(0, 4); // Max 4 photos per entry

      if (photosToInclude.length > 0) {
        doc.moveDown(0.8);
        doc.fontSize(10).font('Helvetica-Bold').text('Photos:', { underline: true });
        doc.moveDown(0.3);

        for (const photo of photosToInclude) {
          // Try to read the photo file
          const ext =
            photo.mimeType.includes('jpeg') || photo.mimeType.includes('heic')
              ? 'jpg'
              : photo.mimeType.includes('png')
                ? 'png'
                : photo.mimeType.includes('webp')
                  ? 'webp'
                  : 'jpg';

          try {
            const photoBuffer = await readPhotoFile(photoStoragePath, photo.id, ext);
            if (photoBuffer) {
              const maxWidth = 150;
              const maxHeight = 150;
              const aspectRatio = (photo.width ?? 150) / (photo.height ?? 150);
              let imageWidth = maxWidth;
              let imageHeight = maxWidth / aspectRatio;

              if (imageHeight > maxHeight) {
                imageHeight = maxHeight;
                imageWidth = maxHeight * aspectRatio;
              }

              // Check if we need a new page
              if (doc.y + imageHeight + 20 > doc.page.height - 40) {
                doc.addPage();
              }

              doc.image(photoBuffer, { width: imageWidth, height: imageHeight });
              doc.moveDown(0.3);

              if (photo.caption) {
                doc.fontSize(9).font('Helvetica-Italic').text(photo.caption, {
                  width: imageWidth,
                  align: 'center',
                });
              }

              doc.moveDown(0.5);
            }
          } catch {
            // Photo file not found or unreadable, skip
          }
        }
      }
    }

    // Signature (if present)
    const metadata = parseMetadata(entry.metadata);
    if (
      metadata &&
      typeof metadata === 'object' &&
      'signatureDataUrl' in metadata &&
      metadata.signatureDataUrl
    ) {
      const sigDataUrl = metadata.signatureDataUrl as string;
      try {
        // Parse data URL and extract base64 data
        const match = sigDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const sigBuffer = Buffer.from(match[2], 'base64');

          if (doc.y + 80 > doc.page.height - 40) {
            doc.addPage();
          }

          doc.moveDown(0.5);
          doc.fontSize(9).font('Helvetica-Bold').text('Signature:', { underline: true });
          doc.moveDown(0.2);
          doc.image(sigBuffer, { width: 150 });
        }
      } catch {
        // Signature data invalid, skip
      }
    }

    // Page break after entry
    doc.moveDown(1);
    const lineX = 40;
    const lineY = doc.y;
    doc
      .moveTo(lineX, lineY)
      .lineTo(doc.page.width - 40, lineY)
      .stroke();
  }

  // Add page numbers
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(9)
      .text(`Page ${i + 1} of ${pageCount}`, 40, doc.page.height - 30, { align: 'center' });
  }

  // Finalize PDF
  doc.end();

  return new Promise((resolve) => {
    doc.on('finish', () => {
      resolve(Buffer.concat(buffers));
    });
  });
}
