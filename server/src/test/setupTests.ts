// Suppress noisy console output in tests (migration logs, etc.).
// console.error is preserved — it usually signals a real problem.
// Individual tests can restore with jest.restoreAllMocks() if needed.
import { jest } from '@jest/globals';
import { setPasswordHashParamsForTesting } from '../services/userService.js';

jest.spyOn(console, 'warn').mockImplementation(() => undefined);
jest.spyOn(console, 'log').mockImplementation(() => undefined);

// Keep test hashing cheap (production uses N=131072, ~128 MiB per hash).
setPasswordHashParamsForTesting({ n: 16384, r: 8, p: 1 });
