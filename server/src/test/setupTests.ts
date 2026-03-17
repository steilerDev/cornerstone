// Suppress noisy console output in tests (migration logs, etc.).
// console.error is preserved — it usually signals a real problem.
// Individual tests can restore with jest.restoreAllMocks() if needed.
jest.spyOn(console, 'warn').mockImplementation(() => undefined);
jest.spyOn(console, 'log').mockImplementation(() => undefined);
