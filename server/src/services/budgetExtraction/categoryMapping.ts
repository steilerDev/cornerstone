/**
 * Category name mapping: LLM-extracted category names → budget category IDs.
 *
 * Implements fuzzy matching with synonym support to map free-text category
 * extractions from invoices to project-managed budget categories.
 */

// Synonym map: canonical lower-case key → array of recognized aliases (lower-case)
const SYNONYMS: Record<string, string[]> = {
  materials: ['material', 'materialien', 'baumaterial', 'baustoffe'],
  labor: ['labour', 'arbeit', 'arbeitsleistung', 'lohnkosten', 'montage'],
  tile: ['fliesen', 'tiles', 'fliesenarbeiten', 'tile work'],
  electrical: ['elektro', 'elektrik', 'elektroarbeiten', 'elektriker'],
  plumbing: ['sanitär', 'sanitaer', 'installation', 'installateur', 'wasser', 'klempner'],
  roofing: ['dach', 'dachdecker', 'dacharbeiten'],
  painting: ['maler', 'malerarbeiten', 'anstrich'],
  flooring: ['boden', 'bodenbelag', 'parkett', 'bodenarbeiten'],
};

interface CategoryRow {
  id: string;
  name: string;
  translationKey?: string | null;
}

/**
 * Map an LLM-extracted category name to a project budget category ID.
 * Returns the matched ID, or null if no reasonable match.
 *
 * Matching strategy (in order):
 * 1. Exact (case-insensitive) match on category.name
 * 2. Exact (case-insensitive) match on category.translationKey
 * 3. Partial containment in either direction (extracted ⊂ name or name ⊂ extracted)
 * 4. Synonym map lookup: extracted term matches an alias → look up canonical key in categories
 */
export function mapCategoryNameToId(
  extracted: string | null | undefined,
  categories: CategoryRow[],
): string | null {
  if (!extracted) return null;
  const norm = extracted.trim().toLowerCase();
  if (!norm || categories.length === 0) return null;

  // 1. Exact match on name
  const byName = categories.find((c) => c.name.toLowerCase() === norm);
  if (byName) return byName.id;

  // 2. Exact match on translationKey
  const byKey = categories.find(
    (c) => c.translationKey && c.translationKey.toLowerCase() === norm,
  );
  if (byKey) return byKey.id;

  // 3. Partial containment
  const partial = categories.find(
    (c) =>
      c.name.toLowerCase().includes(norm) || norm.includes(c.name.toLowerCase()),
  );
  if (partial) return partial.id;

  // 4. Synonym map
  for (const [canonical, aliases] of Object.entries(SYNONYMS)) {
    if (aliases.includes(norm) || norm === canonical) {
      const syn = categories.find(
        (c) =>
          c.name.toLowerCase().includes(canonical) ||
          canonical.includes(c.name.toLowerCase()),
      );
      if (syn) return syn.id;
    }
  }

  return null;
}
