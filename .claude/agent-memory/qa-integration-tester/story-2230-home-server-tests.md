---
name: story-2230-home-server-tests
description: Story #2230 Home server/shared tests - NODE_OPTIONS trap, big-heredoc refusal, dead defensive branches, two defect pins, fixture reuse
metadata:
  type: project
---

- `NODE_OPTIONS` must keep `--experimental-vm-modules` when raising heap (`"--experimental-vm-modules --max-old-space-size=6144"`); setting only the heap flag silently breaks `unstable_mockModule` suites (match.queryMap fails 7/7).
- The sandbox refuses big heredocs and compound `cd; export; npx` loops with variables: use Write for new files, small python3 edits, one npx per call.
- `server/src/test/attentionFixture.ts` (`seedAttentionFixture`, FIXTURE_NOW/TODAY/USER) is the shared fixture; reuse it to cross-check Home vs attention subjects/links.
- Route handlers' `if (!request.user) throw` are unreachable through `buildApp` (auth hook 401s first): cover with a bare `Fastify()` + `register(routes)` + custom error handler.
- homeService branch coverage 97% after backend removed dead fallbacks.
- Both defect pins (undated task on agenda; label sort) were fixed by backend and flipped to plain tests.
- `heldUpBy` is null for a held-up task whose milestone gate has no contributors (fixture wi-8): not a bug, UI must tolerate it.
