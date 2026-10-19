// tsc does not copy non-TS assets. The migration runner reads dist/db/migrations/,
// so copy the hand-written .sql files there after every compile (build, dev, db:migrate).
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = join(import.meta.dirname, '..', 'src', 'db', 'migrations');
const dest = join(import.meta.dirname, '..', 'dist', 'db', 'migrations');

mkdirSync(dest, { recursive: true });
cpSync(src, dest, {
  recursive: true,
  // Only .sql files (and directories, which have no extension); skip .ts migration tests.
  filter: (path) => path.endsWith('.sql') || !/\.[^\\/]+$/.test(path),
});
