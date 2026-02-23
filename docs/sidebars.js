// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  guides: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      link: { type: 'doc', id: 'getting-started/index' },
      items: [
        'getting-started/docker-setup',
        'getting-started/first-login',
        'getting-started/configuration',
      ],
    },
    {
      type: 'category',
      label: 'Work Items',
      link: { type: 'doc', id: 'guides/work-items/index' },
      items: [
        'guides/work-items/creating-work-items',
        'guides/work-items/tags',
        'guides/work-items/notes-and-subtasks',
        'guides/work-items/dependencies',
        'guides/work-items/keyboard-shortcuts',
      ],
    },
    {
      type: 'category',
      label: 'Users & Authentication',
      link: { type: 'doc', id: 'guides/users/index' },
      items: ['guides/users/oidc-setup', 'guides/users/admin-panel'],
    },
    {
      type: 'category',
      label: 'Budget',
      link: { type: 'doc', id: 'guides/budget/index' },
      items: [],
    },
    'guides/appearance/dark-mode',
    'roadmap',
  ],

  development: [
    'development/index',
    {
      type: 'category',
      label: 'Agentic Development',
      link: { type: 'doc', id: 'development/agentic/overview' },
      items: [
        'development/agentic/agent-team',
        'development/agentic/workflow',
        'development/agentic/setup',
      ],
    },
    'development/tech-stack',
  ],
};

export default sidebars;
