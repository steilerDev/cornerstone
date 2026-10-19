---
name: story-2226-photo-tags-server-tests
description: Story #2226 server QA - real-flow tag/undo tests, moved-export mock blast radius, local ts-jest target workaround
metadata:
  type: project
---

- Real-flow file `server/src/routes/photos.tags.test.ts` covers PATCH /photos/tags, PATCH /:id `undo`, and tag Undo (409 matrix) without mocks; `photos.test.ts` mocks all of photoService, so it is unit-level only.
- Moving `isDiaryRowSignatureLocked` into photoService broke `photos.test.ts` (18 x 500) because its `unstable_mockModule` factory lacked the export. Fix: async factory that mirrors the real body via `@cornerstone/shared`. Same blast-radius family as [[issue-1912-esm-mock-blast-radius]].
- AJV `coerceTypes` turns `photoIds: [5]` into "5" (404, not 400); use an object element to hit the 400 type error.
- Sandbox: `npx jest` for server fails with TS2554 on `AppError.ts` (`super(msg, {cause})`) because the inline ts-jest tsconfig has no target; CI is fine. Local workaround: untracked `jest.qa-local.config.mjs` importing `./jest.config.ts` and setting `tsconfig.target/lib = ES2024` on the server project (delete afterwards). Rebuild `shared` (`cd shared && npx tsc`) after shared type/const changes.
- `git` fails in this worktree ("wiki/.git not recognized"); use file tools, not git status/diff.
