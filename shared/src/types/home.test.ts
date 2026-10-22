/**
 * Home contract constants (#2230, contract 24): the tuples the server and the page both enumerate.
 *
 * Mutations these tests catch:
 *  - the agenda window drifting from 21 days (This week 7 + Next 14);
 *  - a set-up step added to the tuple but to neither the core nor the admin-only group;
 *  - an admin-only step also listed as core (members would see an unfinishable core step);
 *  - the step or kind order changing (the page and the API render in tuple order).
 */

import { describe, it, expect } from '@jest/globals';
import {
  HOME_AGENDA_DAYS,
  HOME_AGENDA_KINDS,
  HOME_SETUP_ADMIN_STEPS,
  HOME_SETUP_CORE_STEPS,
  HOME_SETUP_STEPS,
  HOME_WEEK_DAYS,
} from './home.js';

describe('Home contract constants', () => {
  it('covers 21 days: this week is the first 7, the rest is the next 14', () => {
    expect(HOME_AGENDA_DAYS).toBe(21);
    expect(HOME_WEEK_DAYS).toBe(7);
    expect(HOME_AGENDA_DAYS - HOME_WEEK_DAYS).toBe(14);
  });

  it('orders the agenda kinds starts, ends, payment, delivery, milestone', () => {
    expect([...HOME_AGENDA_KINDS]).toEqual(['starts', 'ends', 'payment', 'delivery', 'milestone']);
  });

  it('orders the set-up steps with the five core steps first and the admin steps before the first log', () => {
    expect([...HOME_SETUP_STEPS]).toEqual([
      'house',
      'areas',
      'funding',
      'companies',
      'tasks',
      'household',
      'backups',
      'firstLog',
    ]);
  });

  it('splits the steps into core, admin-only and the first log without overlap or gaps', () => {
    const core: readonly string[] = HOME_SETUP_CORE_STEPS;
    const admin: readonly string[] = HOME_SETUP_ADMIN_STEPS;
    expect(core).toEqual(['house', 'areas', 'funding', 'companies', 'tasks']);
    expect(admin).toEqual(['household', 'backups']);
    expect(core.filter((id) => admin.includes(id))).toEqual([]);
    const rest = HOME_SETUP_STEPS.filter((id) => !core.includes(id) && !admin.includes(id));
    expect(rest).toEqual(['firstLog']);
  });
});
