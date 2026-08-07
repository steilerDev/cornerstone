export const meta = {
  name: 'pr-review',
  description: 'Fan out the applicable PR reviewer agents in parallel and collect their verdicts',
  whenToUse:
    'Invoked by /develop step 8 and /review-pr step 3 after the orchestrator has computed which reviewers apply, pre-fetched the diff, and derived per-reviewer file scopes.',
  phases: [{ title: 'Review' }],
};

// args: { pr: number, diffPath?: string, reviewers: [{ agent: '<agent-type>', focus?: string, files?: string[] }] }
const { pr, diffPath, reviewers } = args;
if (!pr || !Array.isArray(reviewers) || reviewers.length === 0) {
  throw new Error(
    'pr-review workflow requires args { pr, reviewers: [{ agent, focus?, files? }] }',
  );
}

const reports = await parallel(
  reviewers.map(
    (r) => () =>
      agent(
        `Review PR #${pr} of steilerDev/cornerstone according to your PR-review responsibilities. ` +
          (r.focus ? `${r.focus} ` : '') +
          (diffPath
            ? `The diff is pre-fetched at ${diffPath} — read it from there, do not re-fetch it. `
            : `Fetch the diff with \`gh pr diff ${pr}\`. `) +
          (Array.isArray(r.files) && r.files.length > 0
            ? `Your review scope is limited to these files (ignore the rest of the diff): ${r.files.join(', ')}. `
            : '') +
          `Apply your review checklist and CLAUDE.md > Reviewer Verdict Policy (fix-or-block: low-effort findings ` +
          `are request-changes labeled fix-in-session; deferrals require a filed, justified GitHub issue in the review body), ` +
          `post your review on GitHub via \`gh pr review\` (prefixing comments with your agent name), ` +
          `and return a short report that ends with your verdict line.`,
        { agentType: r.agent, label: `review:${r.agent}`, phase: 'Review' },
      ),
  ),
);

return reviewers.map((r, i) => ({ agent: r.agent, report: reports[i] }));
