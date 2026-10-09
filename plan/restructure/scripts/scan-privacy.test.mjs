import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DENYLIST_STOPWORDS,
  collectFiles,
  loadDenylistFromDb,
  mask,
  parseArgs,
  scanPaths,
  scanText,
} from './scan-privacy.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'scan-privacy.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'scan-privacy-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const cats = (text, opts) => scanText(text, opts).map((f) => f.category);

function cli(args, input) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: 'utf8' });
}

describe('scanText contact categories', () => {
  it('flags an e-mail address with 1-based line and column', () => {
    const [f] = scanText('first line\nwrite to  person.one@company-alpha.de today');
    assert.deepEqual(
      { line: f.line, column: f.column, category: f.category, match: f.match },
      { line: 2, column: 11, category: 'email', match: 'person.one@company-alpha.de' },
    );
  });

  it('does not flag allow-listed synthetic e-mail addresses', () => {
    const text = [
      'a@example.com b@mail.example.org c@example.net d@host.example',
      'e@host.test f@host.invalid g@users.noreply.github.com noreply@anthropic.com',
    ].join('\n');
    assert.deepEqual(scanText(text), []);
  });

  it('flags international and German phone numbers', () => {
    assert.deepEqual(cats('call +49 30 1234567 now'), ['phone']);
    assert.deepEqual(cats('call 0049 30 1234567 now'), ['phone']);
    assert.deepEqual(cats('call 030 1234567 now'), ['phone']);
    assert.deepEqual(cats('call 0171/1234567 now'), ['phone']);
  });

  it('does not flag dates, versions, issue numbers or ids as phones', () => {
    const text = '2026-10-08 v1.2.3 #2191 WRK-012 version 10.0.100';
    assert.deepEqual(scanText(text, { profile: 'contact' }), []);
  });

  it('does not report the digits of an IBAN as a phone as well', () => {
    assert.deepEqual(cats('DE89 3704 0044 0532 0130 00'), ['iban']);
  });

  it('flags an IBAN with and without spaces', () => {
    assert.deepEqual(cats('DE89370400440532013000'), ['iban']);
    assert.deepEqual(cats('x DE89 3704 0044 0532 0130 00 y'), ['iban']);
  });

  it('flags German street plus house number in several suffix forms', () => {
    for (const s of [
      'Musterstraße 12',
      'Beispielweg 7a',
      'Testgasse 3',
      'Probeallee 99',
      'Hauptstrasse 1',
      'Alte Straße 5',
    ]) {
      assert.deepEqual(cats(`at ${s} here`), ['street'], s);
    }
  });

  it('does not flag a street word without a house number', () => {
    assert.deepEqual(cats('the Musterstraße is long'), []);
  });

  it('flags a five digit postcode followed by a capitalised city', () => {
    assert.deepEqual(cats('12345 Musterstadt'), ['postcode-city']);
  });

  it('does not flag a five digit number followed by Euro/EUR or a lowercase word', () => {
    assert.deepEqual(cats('12345 Euro', { profile: 'contact' }), []);
    assert.deepEqual(cats('12345 EUR', { profile: 'contact' }), []);
    assert.deepEqual(cats('12345 items'), []);
  });

  it('returns findings sorted by line then column', () => {
    const f = scanText('b@company-alpha.de\n+49 30 1234567 a@company-beta.de');
    assert.deepEqual(
      f.map((x) => [x.line, x.column]),
      [
        [1, 1],
        [2, 1],
        [2, 16],
      ],
    );
  });

  it('handles CRLF line endings', () => {
    assert.equal(scanText('x\r\na@company-alpha.de')[0].line, 2);
  });
});

describe('scanText money and profiles', () => {
  const samples = ['€ 1.234', '-€629', '12,5 EUR', '1.000 Euro', '€1k', 'EUR 5', '7€'];
  for (const s of samples) {
    it(`flags "${s}" as money in the full profile`, () => {
      assert.ok(cats(`cost ${s} total`, { profile: 'full' }).includes('money'));
    });
  }

  it('does not flag money in the contact profile', () => {
    for (const s of samples) assert.deepEqual(cats(`cost ${s}`, { profile: 'contact' }), []);
  });

  it('defaults to the full profile', () => {
    assert.ok(cats('cost €5').includes('money'));
  });

  it('does not flag a currency symbol without digits', () => {
    assert.deepEqual(cats('shown in € and EUR and Euro'), []);
  });
});

describe('scanText denylist', () => {
  it('matches case-insensitively at word boundaries with the source category', () => {
    const f = scanText('see COMPANY ALPHA here', {
      denylist: [{ term: 'Company Alpha', source: 'vendors' }],
    });
    assert.deepEqual(
      f.map((x) => [x.category, x.match, x.column]),
      [['denylist:vendors', 'COMPANY ALPHA', 5]],
    );
  });

  it('does not match inside a longer word (Unicode boundaries)', () => {
    assert.deepEqual(scanText('Alphabet and ÄAlpha and Alphaß', { denylist: ['Alpha'] }), []);
    assert.equal(scanText('an Alpha.', { denylist: ['Alpha'] }).length, 1);
  });

  it('accepts plain string entries and defaults the source to "term"', () => {
    assert.equal(scanText('xx Zeta yy', { denylist: ['Zeta'] })[0].category, 'denylist:term');
  });

  it('defaults the source when an object entry has none', () => {
    assert.equal(scanText('Zeta', { denylist: [{ term: 'Zeta' }] })[0].category, 'denylist:term');
  });

  it('escapes regex metacharacters in terms', () => {
    assert.equal(scanText('x a.b y', { denylist: ['a.b'] }).length, 1);
    assert.equal(scanText('x aXb y', { denylist: ['a.b'] }).length, 0);
  });

  it('ignores empty terms', () => {
    assert.deepEqual(scanText('anything', { denylist: [{ term: '' }] }), []);
  });
});

describe('mask', () => {
  it('keeps the first character and stars the rest', () => {
    assert.equal(mask('secret'), 's*****');
  });
  it('masks a single character completely', () => {
    assert.equal(mask('x'), '*');
  });
});

describe('loadDenylistFromDb', () => {
  const dbPath = join(tmp, 'fixture.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE vendors (id INTEGER, name TEXT, phone TEXT, email TEXT, address TEXT, trade TEXT);
    CREATE TABLE vendor_contacts (id INTEGER, name TEXT, first_name TEXT, last_name TEXT, phone TEXT, email TEXT);
    CREATE TABLE users (id INTEGER, display_name TEXT, email TEXT);
    CREATE TABLE budget_sources (id INTEGER, name TEXT, reference TEXT, contact_address TEXT, total_amount REAL);
    CREATE TABLE app_settings (key TEXT, value TEXT);
    CREATE TABLE invoices (id INTEGER, invoice_number TEXT, amount REAL, note TEXT);
    CREATE TABLE invoice_deposits (id INTEGER, amount REAL);
    CREATE TABLE work_item_budgets (id INTEGER, planned_amount REAL);
    INSERT INTO vendors VALUES (1, 'Company Alpha', '+49 30 1234567', 'info@company-alpha.de', 'Beispielweg 9', 'Plumbing');
    INSERT INTO vendors VALUES (2, NULL, NULL, 'abc', NULL, NULL);
    INSERT INTO vendor_contacts VALUES (1, 'Contact Person', 'Firstname', 'Lastname', '0301234567', 'c@company-alpha.de');
    INSERT INTO users VALUES (1, 'Jane Doe Testuser', 'jane@company-beta.de');
    INSERT INTO users VALUES (2, NULL, NULL);
    INSERT INTO budget_sources VALUES (1, 'Source Gamma', 'REF-4711', 'Gammaplatz 1', 12345.5);
    INSERT INTO app_settings VALUES ('household.name', 'Household Delta');
    INSERT INTO app_settings VALUES ('theme', 'darkmode-value');
    INSERT INTO invoices VALUES (1, 'INV-98765', 1234.5, 'ignored note text');
    INSERT INTO invoices VALUES (2, 'INV-2', 'text-amount', 'x');
    INSERT INTO invoice_deposits VALUES (1, 99.5);
    INSERT INTO invoice_deposits VALUES (2, 250);
    INSERT INTO work_item_budgets VALUES (1, 100000);
  `);
  db.close();

  it('collects terms from each table and column', async () => {
    const terms = (await loadDenylistFromDb(dbPath)).map((t) => t.term);
    for (const expected of [
      'Company Alpha',
      '+49 30 1234567',
      'info@company-alpha.de',
      'Beispielweg 9',
      'Contact Person',
      'Firstname',
      'Lastname',
      '0301234567',
      'c@company-alpha.de',
      'Jane Doe Testuser',
      'jane@company-beta.de',
      'Source Gamma',
      'REF-4711',
      'Gammaplatz 1',
      'Household Delta',
      'INV-98765',
    ]) {
      assert.ok(terms.includes(expected), `missing ${expected}`);
    }
  });

  it('adds each display-name token of at least four characters', async () => {
    const terms = (await loadDenylistFromDb(dbPath)).map((t) => t.term);
    assert.ok(terms.includes('Testuser'));
    assert.ok(terms.includes('Jane'));
    assert.ok(!terms.includes('Doe'), 'tokens under 4 chars are dropped');
  });

  it('drops short terms, unrelated settings and unlisted columns', async () => {
    const terms = (await loadDenylistFromDb(dbPath)).map((t) => t.term);
    assert.ok(!terms.includes('abc'));
    assert.ok(!terms.includes('darkmode-value'));
    assert.ok(!terms.includes('Plumbing'));
    assert.ok(!terms.includes('ignored note text'));
  });

  it('renders amounts of at least 100 in all forms and skips smaller ones', async () => {
    const terms = (await loadDenylistFromDb(dbPath)).map((t) => t.term);
    for (const form of [
      '1234.5',
      '1234.50',
      '1,234.50',
      '1.234,50',
      '12345.5',
      '12345.50',
      '12,345.50',
      '12.345,50',
      '100000',
      '100,000.00',
      '100.000,00',
      '250.00',
    ]) {
      assert.ok(terms.includes(form), `missing amount form ${form}`);
    }
    assert.ok(!terms.includes('99.5'));
    assert.ok(!terms.includes('99.50'));
  });

  it('deduplicates terms case-insensitively and records a source', async () => {
    const list = await loadDenylistFromDb(dbPath);
    const lower = list.map((t) => t.term.toLowerCase());
    assert.equal(new Set(lower).size, lower.length);
    assert.equal(list.find((t) => t.term === 'Company Alpha').source, 'vendors');
    assert.equal(list.find((t) => t.term === '1,234.50').source, 'money:invoices');
  });

  it('opens the database read-only', async () => {
    await loadDenylistFromDb(dbPath);
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    assert.throws(() => ro.exec("INSERT INTO app_settings VALUES ('k', 'v')"), /readonly/i);
    ro.close();
  });

  it('works on a database without any of the known tables', async () => {
    const empty = join(tmp, 'empty.db');
    new DatabaseSync(empty).close();
    assert.deepEqual(await loadDenylistFromDb(empty), []);
  });

  it('rejects when the file does not exist', async () => {
    await assert.rejects(() => loadDenylistFromDb(join(tmp, 'missing.db')));
  });
});

describe('denylist stopwords', () => {
  const dbPath = join(tmp, 'stopwords.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE users (id INTEGER, display_name TEXT, email TEXT);
    CREATE TABLE vendors (id INTEGER, name TEXT);
    INSERT INTO users VALUES (1, 'Admin', NULL);
    INSERT INTO users VALUES (2, 'ADMIN', NULL);
    INSERT INTO users VALUES (3, 'Guest', NULL);
    INSERT INTO users VALUES (4, 'Admin Jordan', NULL);
    INSERT INTO vendors VALUES (1, 'member');
    INSERT INTO vendors VALUES (2, 'Owner');
    INSERT INTO vendors VALUES (3, 'DEMO');
    INSERT INTO vendors VALUES (4, 'Company Alpha');
  `);
  db.close();

  it('exports exactly the generic role words', () => {
    assert.deepEqual([...DENYLIST_STOPWORDS].sort(), [
      'admin',
      'demo',
      'guest',
      'member',
      'owner',
      'test',
      'user',
    ]);
  });

  it('produces no term for stopwords in any case, from users or vendors', async () => {
    const terms = (await loadDenylistFromDb(dbPath)).map((t) => t.term.toLowerCase());
    for (const stop of DENYLIST_STOPWORDS) assert.ok(!terms.includes(stop), stop);
  });

  it('keeps the full display name and the other token but drops the stopword token', async () => {
    const terms = (await loadDenylistFromDb(dbPath)).map((t) => t.term);
    assert.ok(terms.includes('Admin Jordan'));
    assert.ok(terms.includes('Jordan'));
    assert.ok(!terms.some((t) => t.toLowerCase() === 'admin'));
    assert.ok(terms.includes('Company Alpha'));
  });

  it('scanning "guard: admin" with that denylist yields no findings', async () => {
    const denylist = await loadDenylistFromDb(dbPath);
    assert.deepEqual(scanText('guard: admin', { denylist }), []);
    assert.equal(scanText('Jordan was here', { denylist }).length, 1);
  });
});

describe('collectFiles and scanPaths', () => {
  const root = join(tmp, 'tree');
  mkdirSync(join(root, 'sub'), { recursive: true });
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  writeFileSync(join(root, 'a.json'), '{"mail":"x@company-alpha.de"}\n');
  writeFileSync(join(root, 'sub', 'b.md'), 'clean text\n+49 30 1234567\n');
  writeFileSync(join(root, 'sub', 'c.png'), 'x@company-alpha.de');
  writeFileSync(join(root, 'skip.test.mjs'), 'x@company-alpha.de');
  writeFileSync(join(root, 'node_modules', 'd.json'), 'x@company-alpha.de');

  it('walks recursively, keeping scanned extensions and skipping tests and node_modules', () => {
    const files = collectFiles(root).map((f) => f.slice(root.length + 1));
    assert.deepEqual(files, ['a.json', 'sub/b.md']);
  });

  it('returns a file path itself', () => {
    assert.deepEqual(collectFiles(join(root, 'a.json')), [join(root, 'a.json')]);
  });

  it('formats findings as masked file:line:col lines', () => {
    const lines = scanPaths([root], { cwd: root });
    assert.deepEqual(lines, [
      `a.json:1:10 email ${mask('x@company-alpha.de')}`,
      `sub/b.md:2:1 phone ${mask('+49 30 1234567')}`,
    ]);
    assert.ok(lines.every((l) => !l.includes('company-alpha')));
  });
});

describe('parseArgs', () => {
  it('parses flags and paths', () => {
    assert.deepEqual(parseArgs(['--stdin', '--profile', 'contact', '--denylist-db', 'x.db', 'p']), {
      stdin: true,
      profile: 'contact',
      denylistDb: 'x.db',
      paths: ['p'],
    });
  });
  it('defaults to profile full', () => {
    assert.equal(parseArgs([]).profile, 'full');
  });
  it('rejects unknown options, bad profile and missing denylist path', () => {
    assert.throws(() => parseArgs(['--nope']), /unknown option/);
    assert.throws(() => parseArgs(['--profile', 'x']), /must be contact or full/);
    assert.throws(() => parseArgs(['--denylist-db']), /needs a path/);
  });
});

describe('CLI', () => {
  it('--stdin exits 0 on clean input', () => {
    const r = cli(['--stdin', '--profile', 'contact'], 'nothing to see\n');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /clean/);
  });

  it('--stdin exits 1 on findings and never prints the match', () => {
    const r = cli(['--stdin', '--profile', 'contact'], 'mail person.one@company-alpha.de\n');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /stdin:1:6 email p\*+/);
    assert.ok(!r.stderr.includes('person.one'));
    assert.ok(!r.stdout.includes('person.one'));
  });

  it('applies the profile: money fails in full but passes in contact', () => {
    assert.equal(cli(['--stdin', '--profile', 'full'], 'cost €5\n').status, 1);
    assert.equal(cli(['--stdin', '--profile', 'contact'], 'cost €5\n').status, 0);
  });

  it('scans given paths and exits 1 with masked output', () => {
    const dir = join(tmp, 'cli-paths');
    mkdirSync(dir);
    writeFileSync(join(dir, 'x.txt'), 'call +49 30 1234567\n');
    const r = cli([dir]);
    assert.equal(r.status, 1);
    assert.ok(!r.stderr.includes('1234567'));
    assert.match(r.stderr, /x\.txt:1:6 phone \+\*+/);
  });

  it('scans the default restructure directory when no path is given', () => {
    const r = cli([]);
    assert.ok([0, 1].includes(r.status));
  });

  it('uses --denylist-db terms and masks them', () => {
    const dbPath = join(tmp, 'cli.db');
    const d = new DatabaseSync(dbPath);
    d.exec("CREATE TABLE vendors (name TEXT); INSERT INTO vendors VALUES ('Company Epsilon')");
    d.close();
    const r = cli(['--stdin', '--denylist-db', dbPath], 'we met company epsilon today\n');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /denylist:vendors c\*+/);
    assert.ok(!r.stderr.toLowerCase().includes('epsilon'));
  });

  it('exits 2 on usage errors', () => {
    assert.equal(cli(['--bogus']).status, 2);
    assert.equal(cli(['--profile', 'nope']).status, 2);
  });

  it('exits 2 on IO errors such as a missing path or database', () => {
    assert.equal(cli([join(tmp, 'does-not-exist')]).status, 2);
    assert.equal(cli(['--stdin', '--denylist-db', join(tmp, 'nope.db')], 'x').status, 2);
  });
});
