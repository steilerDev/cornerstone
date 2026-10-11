import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { registerSqlFunctions } from './sqlFunctions.js';

describe('registerSqlFunctions', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    registerSqlFunctions(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  function scalar(expr: string, ...params: unknown[]): unknown {
    return (sqlite.prepare(`SELECT ${expr} AS v`).get(...params) as { v: unknown }).v;
  }

  it('is not available on a connection that did not register it', () => {
    const bare = new Database(':memory:');
    expect(() => bare.prepare("SELECT fold('x')").get()).toThrow(/no such function/);
    bare.close();
  });

  it('fold() applies the shared fold', () => {
    expect(scalar("fold('Müller')")).toBe('muller');
    expect(scalar("fold('Mueller')")).toBe('muller');
    expect(scalar("fold('Fußboden')")).toBe('fussboden');
  });

  it('fold() passes NULL through', () => {
    expect(scalar('fold(NULL)')).toBeNull();
  });

  it('fold() stringifies non-string input', () => {
    expect(scalar('fold(?)', 1234)).toBe('1234');
    expect(scalar('fold(12.5)')).toBe('12.5');
  });

  it('digits() keeps digits only', () => {
    expect(scalar("digits('+1 (2) 3-4')")).toBe('1234');
    expect(scalar("digits('abc')")).toBe('');
  });

  it('digits() passes NULL through and stringifies numbers', () => {
    expect(scalar('digits(NULL)')).toBeNull();
    expect(scalar('digits(?)', 4711)).toBe('4711');
  });

  it('works inside LIKE over table columns', () => {
    sqlite.exec("CREATE TABLE t (n TEXT); INSERT INTO t VALUES ('Müller'), (NULL), ('Meier')");
    const rows = sqlite.prepare("SELECT n FROM t WHERE fold(n) LIKE 'mull%'").all();
    expect(rows).toEqual([{ n: 'Müller' }]);
  });
});
