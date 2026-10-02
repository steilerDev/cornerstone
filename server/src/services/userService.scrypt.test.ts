import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
// Static import: resolved BEFORE the node:crypto mock below is registered, so it is the real module.
import * as actualCrypto from 'node:crypto';
import type * as UserServiceModule from './userService.js';
import type * as AppErrorModule from '../errors/AppError.js';

/**
 * Instrumented node:crypto.scrypt: counts derivations, tracks how many are in flight, can
 * hold derivations until released and can fail the next one. It still computes real keys.
 */
const probe = {
  count: 0,
  inFlight: 0,
  maxInFlight: 0,
  failNext: false,
  hold: false,
  started: [] as string[],
  pending: [] as Array<() => Promise<void>>,
};

function resetProbe() {
  probe.count = 0;
  probe.inFlight = 0;
  probe.maxInFlight = 0;
  probe.failNext = false;
  probe.hold = false;
  probe.started = [];
  probe.pending = [];
}

jest.unstable_mockModule('node:crypto', () => {
  const scrypt = ((...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: Error | null, key?: Buffer) => void;
    const rest = args.slice(0, -1);
    probe.count += 1;
    probe.inFlight += 1;
    probe.maxInFlight = Math.max(probe.maxInFlight, probe.inFlight);
    probe.started.push(String(rest[0]));
    // Resolves once this derivation has finished and its callback has been delivered.
    const run = () =>
      new Promise<void>((done) => {
        if (probe.failNext) {
          probe.failNext = false;
          probe.inFlight -= 1;
          cb(new Error('forced scrypt failure'));
          done();
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (actualCrypto.scrypt as any)(...rest, (err: Error | null, key?: Buffer) => {
          probe.inFlight -= 1;
          cb(err, key);
          done();
        });
      });
    if (probe.hold) probe.pending.push(run);
    else run();
  }) as unknown as typeof actualCrypto.scrypt;
  return { ...actualCrypto, scrypt };
});

let userService: typeof UserServiceModule;
let errors: typeof AppErrorModule;

const TEST_PARAMS = { n: 16384, r: 8, p: 1 };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('userService scrypt scheduling', () => {
  beforeEach(async () => {
    if (!userService) {
      // setupTests already loaded the real userService; drop the registry so the
      // instrumented node:crypto applies to a fresh copy.
      jest.resetModules();
      userService = await import('./userService.js');
      errors = await import('../errors/AppError.js');
    }
    userService.setPasswordHashParamsForTesting(TEST_PARAMS);
    resetProbe();
  });

  afterEach(() => {
    probe.hold = false;
    void Promise.all(probe.pending.splice(0).map((run) => run()));
    userService.setPasswordHashParamsForTesting(TEST_PARAMS);
  });

  describe('verifyDummyPassword()', () => {
    it('spends one hash plus one verification on first use', async () => {
      await expect(userService.verifyDummyPassword('anything')).resolves.toBeUndefined();

      expect(probe.count).toBe(2);
    });

    it('caches the dummy hash: a second call costs one verification only', async () => {
      await userService.verifyDummyPassword('first');
      probe.count = 0;

      await userService.verifyDummyPassword('second');

      expect(probe.count).toBe(1);
    });

    it('regenerates the dummy hash after setPasswordHashParamsForTesting() clears the cache', async () => {
      await userService.verifyDummyPassword('first');
      userService.setPasswordHashParamsForTesting(TEST_PARAMS);
      probe.count = 0;

      await userService.verifyDummyPassword('second');

      expect(probe.count).toBe(2);
    });

    it('does not cache a rejection: the next call retries and succeeds', async () => {
      probe.failNext = true;
      await expect(userService.verifyDummyPassword('first')).rejects.toThrow(
        'forced scrypt failure',
      );
      expect(probe.count).toBe(1);

      await expect(userService.verifyDummyPassword('second')).resolves.toBeUndefined();

      // failed hash (1) + retried hash (1) + verification (1)
      expect(probe.count).toBe(3);
    });
  });

  describe('concurrency limit', () => {
    it('keeps at most 2 derivations in flight for 3 concurrent hashes and starts them FIFO', async () => {
      probe.hold = true;
      const all = [1, 2, 3].map(() => userService.hashPassword('pw'));
      await tick();

      expect(probe.count).toBe(2);
      expect(probe.inFlight).toBe(2);

      await probe.pending.shift()!();
      await tick();
      await tick();

      expect(probe.count).toBe(3);
      expect(probe.maxInFlight).toBe(2);

      probe.hold = false;
      void Promise.all(probe.pending.splice(0).map((run) => run()));
      const hashes = await Promise.all(all);

      expect(hashes).toHaveLength(3);
      expect(probe.maxInFlight).toBe(2);
      expect(probe.inFlight).toBe(0);
    });

    it('serves waiters in FIFO order across hashes and verifications', async () => {
      const hash = await userService.hashPassword('seed');
      resetProbe();
      probe.hold = true;
      const ops = [
        userService.verifyPassword(hash, 'a'),
        userService.verifyPassword(hash, 'b'),
        userService.verifyPassword(hash, 'c'),
        userService.verifyPassword(hash, 'd'),
      ];
      await tick();
      expect(probe.started).toEqual(['a', 'b']);

      await probe.pending.shift()!();
      await tick();
      await tick();
      expect(probe.started).toEqual(['a', 'b', 'c']);

      await probe.pending.shift()!();
      await tick();
      await tick();
      expect(probe.started).toEqual(['a', 'b', 'c', 'd']);

      probe.hold = false;
      void Promise.all(probe.pending.splice(0).map((run) => run()));
      await Promise.all(ops);
      expect(probe.maxInFlight).toBe(2);
    });

    it('releases its slot when a derivation fails, so later operations still run', async () => {
      probe.failNext = true;
      await expect(userService.hashPassword('boom')).rejects.toThrow('forced scrypt failure');
      probe.failNext = true;
      await expect(userService.hashPassword('boom')).rejects.toThrow('forced scrypt failure');

      const results = await Promise.all([
        userService.hashPassword('ok1'),
        userService.hashPassword('ok2'),
        userService.hashPassword('ok3'),
      ]);

      expect(results).toHaveLength(3);
      expect(probe.inFlight).toBe(0);
    });
  });

  describe('bounded queue', () => {
    const release = async () => {
      probe.hold = false;
      await Promise.all(probe.pending.splice(0).map((run) => run()));
    };

    it('rejects the call past 2 running + 50 waiting with PasswordHashingBusyError, without queueing it', async () => {
      probe.hold = true;
      const cap = userService.MAX_SCRYPT_QUEUE_LENGTH;
      const accepted = Array.from({ length: 2 + cap }, () => userService.hashPassword('pw'));
      await tick();
      expect(probe.count).toBe(2);

      const rejected = userService.hashPassword('overflow');
      await expect(rejected).rejects.toBeInstanceOf(errors.PasswordHashingBusyError);
      await expect(rejected).rejects.toMatchObject({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });

      // The overflow call never reached scrypt, even once everything drains.
      probe.hold = false;
      const settled = Promise.all(accepted);
      await release();
      while (probe.inFlight > 0 || probe.pending.length > 0) {
        await release();
        await tick();
      }
      await settled;
      expect(probe.count).toBe(2 + cap);
      expect(probe.started).not.toContain('overflow');
    });

    it('resolves every call while the queue stays at or below the cap', async () => {
      probe.hold = true;
      const cap = userService.MAX_SCRYPT_QUEUE_LENGTH;
      const calls = Array.from({ length: 2 + cap }, () => userService.hashPassword('pw'));
      await tick();

      probe.hold = false;
      const settled = Promise.all(calls);
      while (probe.inFlight > 0 || probe.pending.length > 0) {
        await release();
        await tick();
      }

      await expect(settled).resolves.toHaveLength(2 + cap);
    });

    it('accepts new calls again once the queue has drained', async () => {
      probe.hold = true;
      const cap = userService.MAX_SCRYPT_QUEUE_LENGTH;
      const calls = Array.from({ length: 2 + cap }, () => userService.hashPassword('pw'));
      await tick();
      await expect(userService.hashPassword('overflow')).rejects.toBeInstanceOf(
        errors.PasswordHashingBusyError,
      );

      probe.hold = false;
      const settled = Promise.all(calls);
      while (probe.inFlight > 0 || probe.pending.length > 0) {
        await release();
        await tick();
      }
      await settled;

      await expect(userService.hashPassword('after-drain')).resolves.toMatch(/^\$scrypt\$/);
    });
  });
});
