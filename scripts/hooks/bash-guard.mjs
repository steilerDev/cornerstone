#!/usr/bin/env node
// bash-guard.mjs -- PreToolUse hook for the Bash tool.
//
// Enforces two CLAUDE.md rules at the harness level instead of prose:
//   1. Block `git push` to main/beta and pushes of worktree-* branches.
//   2. Pre-check agent trailers on `git commit` (mirrors scripts/check-trailers.sh
//      rules 2-6) so a missing trailer fails at commit time, not in CI.
//
// Exit 0 = allow, exit 2 = block (stderr is shown to the model).
// The hook must never crash the session: any internal error allows the call.

import { execSync } from 'node:child_process';

function readStdin() {
  try {
    return execSync('cat', { stdio: ['inherit', 'pipe', 'pipe'] }).toString();
  } catch {
    return '';
  }
}

function block(msg) {
  process.stderr.write(msg + '\n');
  process.exit(2);
}

try {
  const payload = JSON.parse(readStdin() || '{}');
  const cmd = String(payload?.tool_input?.command ?? '');
  if (!cmd) process.exit(0);

  // --- Rule 1: protected pushes -------------------------------------------
  if (/\bgit\s+push\b/.test(cmd)) {
    // Destination may be a bare branch, a src:dst refspec, or a fully qualified
    // refs/heads/* ref -- all three forms must be caught.
    if (
      /\bpush\b[^;|&]*\s(?:origin|upstream)\s+(?:\S*:)?(?:refs\/heads\/)?(?:main|beta)(?![\w./-])/.test(
        cmd,
      )
    ) {
      block(
        'bash-guard: pushing directly to main/beta is not allowed. ' +
          'All changes go through feature branches and PRs (CLAUDE.md > Branching Strategy).',
      );
    }
    // A bare `git push` (no refspec) pushes the current branch.
    if (
      /\bgit\s+push\s*(?:$|[;|&])|\bgit\s+push\s+(?:-u\s+)?(?:origin|upstream)\s*(?:$|[;|&])/.test(
        cmd,
      )
    ) {
      try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        if (branch === 'main' || branch === 'beta') {
          block(
            `bash-guard: refusing bare 'git push' while checked out on ${branch}. ` +
              'All changes go through feature branches and PRs (CLAUDE.md > Branching Strategy).',
          );
        }
      } catch {
        /* fail open on git errors */
      }
    }
    if (/\bpush\b[^;|&]*\bworktree-[A-Za-z0-9._-]+/.test(cmd)) {
      block(
        'bash-guard: never push a worktree-* branch. Rename it first: ' +
          'git branch -m <type>/<issue-number>-<short-description> (CLAUDE.md > Branching Strategy).',
      );
    }
  }

  // --- Rule 2: trailer pre-check on commit --------------------------------
  if (/\bgit\s+commit\b/.test(cmd)) {
    // Skip when the message is not visible in the command itself.
    if (/\s(-F|--file)\b/.test(cmd) || (/--amend\b/.test(cmd) && !/\s-m\s/.test(cmd))) {
      process.exit(0);
    }

    let staged = [];
    try {
      staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);
    } catch {
      process.exit(0);
    }
    if (staged.length === 0) process.exit(0);

    const isTest = (f) => /\.test\.tsx?$/.test(f);
    const required = new Set();
    for (const f of staged) {
      if (/^(server|shared)\//.test(f) && !isTest(f)) required.add('backend-developer');
      if (
        /^client\//.test(f) &&
        !/^client\/src\/i18n\/de\//.test(f) &&
        f !== 'client/src/i18n/glossary.json' &&
        !isTest(f)
      )
        required.add('frontend-developer');
      if (/^client\/src\/i18n\/de\//.test(f) || f === 'client/src/i18n/glossary.json')
        required.add('translator');
      if (/^e2e\//.test(f)) required.add('e2e-test-engineer');
      if (!/^e2e\//.test(f) && isTest(f)) required.add('qa-integration-tester');
    }
    if (required.size === 0) process.exit(0);

    // No human escape hatch here: this hook only fires on Bash calls issued by
    // the harness, so a trailer-less commit of production files is always an
    // agent forgetting trailers. (check-trailers.sh keeps its human skip -- it
    // runs in CI against ranges that may contain genuine human commits.)
    const missing = [...required].filter(
      (agent) => !new RegExp(`claude\\s+${agent}\\s*[<(]`, 'i').test(cmd),
    );
    if (missing.length > 0) {
      block(
        `bash-guard: staged production files require missing agent trailer(s): ${missing.join(', ')}. ` +
          "Add 'Co-Authored-By: Claude <agent> <noreply@anthropic.com>' per CLAUDE.md > Canonical Agent Trailers.",
      );
    }
  }

  process.exit(0);
} catch {
  process.exit(0);
}
