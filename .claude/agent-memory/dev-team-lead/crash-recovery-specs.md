---
name: crash-recovery-specs
description: Hazards when speccing multi-step filesystem swaps with crash-recovery markers (restore-in-place, staged replace) — phase granularity, marker atomicity, data-safe sweeps, SQLite staging validation
metadata:
  type: feedback
---

When a design moves many entries in two loops (aside, then in) and protects them with a marker
file, check these before emitting the spec (found in the backup restore-in-place design, 2026-10-02):

- **One "in progress" phase cannot drive a post-SIGKILL rollback.** The in-process `catch` knows
  which entries it moved, but startup recovery does not. The marker needs one phase per loop
  (`moving-aside`, `moving-in`, `swapped`), flipped only after the loop completes. Then every
  non-reserved entry in the target is unambiguously "original" or "restored".
- **Rewrite the marker atomically** (tmp + fsync + rename + dir fsync). The tmp name must be a
  reserved name, or the swap loop moves it.
- **Store basenames in the marker, not absolute paths.** Validate them against the reserved
  prefixes on read; a marker must never be able to point recovery at arbitrary paths.
- **Delete the marker last, in every path.** A no-marker startup sweep must never delete a
  non-empty "moved-aside" directory. Log it and leave it instead, because it may be the only copy of the original data.
- **Unparseable marker means refuse to start.** Never guess. A restart loop is recoverable;
  deleting the wrong side is not.
- **Validate a staged SQLite file with a read-write open.** A readonly open of a WAL-mode file
  can leave `-wal`/`-shm` behind. A read-write open plus a clean close also checkpoints any
  staged WAL into the file.
- **Recovery must work on a full volume.** Staging usually caused the full volume. Delete
  regenerable data (staging, which the archive can recreate) before any write. Write the marker
  only when the disk phase differs from memory. Otherwise ENOSPC on a redundant write becomes a
  crash loop under `restart: unless-stopped` (PR #2169, D1).
- **Staging lives on the live volume, so cap it.** Add a header-size and entry-count pre-pass plus
  a `statfs` free-space check before extracting. Give sensitive artifacts (archive, snapshot,
  staging, pre-restore) mode 0600/0700 (PR #2169, S1 and S2).
- **Skip the recovery sweep for `:memory:`**, because `dirname(':memory:')` is the cwd.

**Why:** the architect's design had a single `swapping` phase plus a no-marker sweep that deleted
`.pre-restore-*`. Either one can lose the user's original data after a crash.
**How to apply:** any spec involving a staged replace, a swap or a marker-driven recovery. See [[code-patterns]].
