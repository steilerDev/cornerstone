import { foldSearchText } from '@cornerstone/shared';
import { searchCompanies } from './vendorsApi.js';

/**
 * The one company whose name equals `name` (case and accent folded); null when none or several
 * match, or when the lookup fails. Used to pre-fill the company from a document's correspondent.
 */
export async function findCompanyByName(
  name: string,
): Promise<{ readonly id: string; readonly name: string } | null> {
  try {
    const wanted = foldSearchText(name);
    const exact = (await searchCompanies(name)).filter(
      (company) => foldSearchText(company.name) === wanted,
    );
    return exact.length === 1 ? { id: exact[0]!.id, name: exact[0]!.name } : null;
  } catch {
    return null;
  }
}
