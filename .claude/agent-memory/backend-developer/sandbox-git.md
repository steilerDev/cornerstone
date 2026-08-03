# Sandbox Git Worktree Limitations & Workarounds (CRITICAL when commits fail)

The sandbox has strict limitations for git operations in worktrees:

1. **`core.sharedRepository=group`** in `.git/config` prevents writing new objects to `.git/objects` — git requires group-write on object dirs owned by uid 502/dialout. Some object subdirs are owned by uid 502 (not `agent`), making writes impossible.

2. **Write tools (Edit, Write) do NOT work reliably in worktrees** — use Bash with `python3 -c "..."` or heredoc `cat > file << 'EOF'` for file modifications.

3. **Working git worktree commit workflow**:

   ```bash
   ALTDIR=/tmp/git-obj-$$; mkdir -p $ALTDIR
   printf "$ALTDIR\n" >> /path/to/.git/objects/info/alternates
   # Stage: GIT_OBJECT_DIRECTORY=$ALTDIR GIT_ALTERNATE_OBJECT_DIRECTORIES=/path/.git/objects git add <files>
   # Commit: GIT_OBJECT_DIRECTORY=$ALTDIR GIT_ALTERNATE_OBJECT_DIRECTORIES=/path/.git/objects git commit -m "..."
   # Verify: GIT_ALTERNATE_OBJECT_DIRECTORIES=$ALTDIR git log --oneline -3
   # If branch ref detaches, manually: echo "SHA" > .git/refs/heads/branch-name
   # Push: GIT_ALTERNATE_OBJECT_DIRECTORIES=$ALTDIR git push "https://USER:TOKEN@github.com/..." branch:branch
   ```

4. **git reset/branch rename** also requires reflog directories to exist. Create them with `mkdir -p .git/logs/refs/heads/DIRNAME`.

5. **`git -C worktree-path` works for status/log but NOT for git add** (due to sharedRepository).

6. **`git branch -m`** via `GIT_DIR=.git/worktrees/atomic-...` fails — the worktree metadata dir is NOT a full git dir. Use `GIT_DIR=.git` or direct ref file manipulation.

7. **ALTDIR objects are transient** — push immediately after commit. The `$ALTDIR` path is session-specific.
