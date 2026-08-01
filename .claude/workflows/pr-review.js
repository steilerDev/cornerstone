export const meta = {
  name: 'pr-review',
  description: 'Fan out the applicable PR reviewer agents in parallel and collect their verdicts',
  whenToUse:
    'Invoked by /develop step 8 and /review-pr step 3 after the orchestrator has computed which reviewers apply.',
  phases: [{ title: 'Review' }],
}

// args: { pr: number, reviewers: [{ agent: '<agent-type>', focus: '<optional extra instruction>' }] }
const { pr, reviewers } = args
if (!pr || !Array.isArray(reviewers) || reviewers.length === 0) {
  throw new Error('pr-review workflow requires args { pr, reviewers: [{ agent, focus? }] }')
}

const reports = await parallel(
  reviewers.map((r) => () =>
    agent(
      `Review PR #${pr} of steilerDev/cornerstone according to your PR-review responsibilities. ` +
        (r.focus ? `${r.focus} ` : '') +
        `Fetch the diff with \`gh pr diff ${pr}\`, apply your review checklist and verdict matrix, ` +
        `post your review on GitHub via \`gh pr review\` (prefixing comments with your agent name), ` +
        `and return a short report that ends with your verdict line.`,
      { agentType: r.agent, label: `review:${r.agent}`, phase: 'Review' },
    ),
  ),
)

return reviewers.map((r, i) => ({ agent: r.agent, report: reports[i] }))
