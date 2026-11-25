import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOSSARY } from './glossary.js';

/**
 * AC2 (#2258): German labels are well formed and report types use the bank's words.
 *
 * Mutation notes (each must turn a test red):
 *  - de `common.confirmDialog.confirm` = "Rechnung Hinzufügen"  -> "no compound label ends in a capitalised infinitive"
 *  - de `budget.sourceReports.useCase.proof-of-funds` = "Nachweis" -> "report types use the bank's words"
 */
const i18nRoot = path.dirname(fileURLToPath(import.meta.url));

type Json = string | { [key: string]: Json };

function flatten(node: Json, prefix: string, out: Map<string, string>): void {
  if (typeof node === 'string') {
    out.set(prefix, node);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, out);
  }
}

function loadDe(): Map<string, string> {
  const out = new Map<string, string>();
  const dir = path.join(i18nRoot, 'de');
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    flatten(
      JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Json,
      file.replace(/\.json$/, ''),
      out,
    );
  }
  return out;
}

const de = loadDe();
const budget = JSON.parse(fs.readFileSync(path.join(i18nRoot, 'de', 'budget.json'), 'utf8')) as {
  sourceReports: { useCase: Record<string, string>; table: { title: Record<string, string> } };
};

const CAPITALISED_INFINITIVE =
  /(?<!\b(?:zum|beim|vom|dem|des|der|den|das|im|am|Zum|Beim|vor|nach|ohne|und|oder|mit|für))\s(Hinzufügen|Bearbeiten|Löschen|Entfernen|Speichern|Verknüpfen|Erstellen|Anzeigen|Auswählen|Hochladen|Herunterladen|Öffnen|Schließen|Ändern|Erfassen|Markieren|Aufschlüsseln|Verschieben|Zuordnen|Kopieren|Drucken|Exportieren|Umbenennen|Wiederherstellen|Zurücksetzen|Einreichen|Starten|Verwerfen|Anlegen|Lösen)[\s.…]*$/u;

describe('German compound labels (AC2)', () => {
  it('no compound label ends in a capitalised infinitive', () => {
    const offenders = [...de]
      .filter(([, value]) => CAPITALISED_INFINITIVE.test(value))
      .map(([key, value]) => `${key}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it('the matcher flags a capitalised infinitive and spares nominalised forms', () => {
    expect(CAPITALISED_INFINITIVE.test('Rechnung Hinzufügen')).toBe(true);
    expect(CAPITALISED_INFINITIVE.test('Auftragnehmer Hinzufügen…')).toBe(true);
    expect(CAPITALISED_INFINITIVE.test('Rechnung hinzufügen')).toBe(false);
    expect(CAPITALISED_INFINITIVE.test('Klicke zum Speichern')).toBe(false);
  });

  it('the checked set is non-trivial', () => {
    expect(de.size).toBeGreaterThan(1000);
  });
});

describe('report types use the bank words (AC2)', () => {
  const germanFor = (canon: string): string => {
    const term = GLOSSARY.terms.find((t) => t.canon === canon);
    if (!term) throw new Error(`glossary term missing: ${canon}`);
    return term.de.singular ?? term.de.noun ?? '';
  };

  it('reads the glossary German forms', () => {
    expect(germanFor('Draw-down request')).toBe('Mittelabruf');
    expect(germanFor('Proof of funds')).toBe('Verwendungsnachweis');
    expect(germanFor('Budget overview')).toBe('Kostenaufstellung');
  });

  it.each([
    ['claim', 'Draw-down request'],
    ['proof-of-funds', 'Proof of funds'],
    ['budget-overview', 'Budget overview'],
  ])('use case %s is named %s in German, in the picker and on the table title', (id, canon) => {
    const word = germanFor(canon);
    expect(budget.sourceReports.useCase[id]).toContain(word);
    expect(budget.sourceReports.table.title[id]).toContain(word);
  });

  it('the former name Budgetübersicht is not a report-type name', () => {
    expect(budget.sourceReports.useCase['budget-overview']).not.toContain('Budgetübersicht');
    expect(budget.sourceReports.table.title['budget-overview']).not.toContain('Budgetübersicht');
  });
});
