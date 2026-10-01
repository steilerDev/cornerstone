---
name: account-provisioning-hazards
description: Hazards to pre-empt in any spec that creates user accounts outside setup/admin flows (OIDC JIT, invites) — setup lockout, case-variant email dup, collision-path testability
metadata:
  type: project
---

Any path that creates a `users` row outside `POST /api/auth/setup` / `POST /api/users` must pre-empt:

1. **Setup lockout** — `POST /api/auth/setup` is gated on `countUsers() === 0`. A provisioned `member`
   created before setup permanently blocks setup and leaves the instance with no admin. Refuse
   provisioning while `countUsers === 0`. Not covered by #2142's ACs; found at spec time.
2. **Case-variant email duplicates** — `users.email` UNIQUE is BINARY collation, and
   `findByEmailForOidc` returns `undefined` for both "no match" and "ambiguous". Provision only when
   zero rows match `lower(email)`, or the insert silently creates a third case variant.
3. **Collision path is untestable in-process** — better-sqlite3 is synchronous, so concurrent
   `app.inject` calls serialize and never hit the unique index. Factor the insert into an exported
   helper that catches `UNIQUE constraint failed: users.oidc_subject` (walk `err.cause` too — drizzle
   may wrap) and re-reads; test it against a pre-seeded row. SQLite's default ABORT reverts only the
   failing statement, so catching inside `db.transaction` is safe.
4. **Adding a required `AppConfig` field** breaks ~7 typed `makeConfig()` test fixtures under tsc —
   list them in the QA spec.

**Why:** #2142 (OIDC JIT). ADR-035 had explicitly rejected a provisioning flag, so the ADR amendment
was routed to product-architect, not the implementer.
**How to apply:** check all four whenever a story adds account creation; see [[review-round-discipline]].
