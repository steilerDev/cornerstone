// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Cornerstone',
  tagline: 'A self-hosted home building project management tool',
  favicon: 'img/favicon.svg',

  url: 'https://cornerstone.steiler.dev',
  baseUrl: '/',

  organizationName: 'steilerDev',
  projectName: 'cornerstone',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'src',
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
        },
        blog: false,
        theme: {
          customCss: './theme/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Cornerstone',
        logo: {
          alt: 'Cornerstone Logo',
          src: 'img/logo.svg',
          srcDark: 'img/logo-dark.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'guides',
            position: 'left',
            label: 'Guides',
          },
          {
            type: 'docSidebar',
            sidebarId: 'development',
            position: 'left',
            label: 'Development',
          },
          {
            href: 'https://github.com/steilerDev/cornerstone',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Guides',
            items: [
              { label: 'Getting Started', to: '/getting-started' },
              { label: 'Work Items', to: '/guides/work-items' },
              { label: 'Budget', to: '/guides/budget' },
              { label: 'Roadmap', to: '/roadmap' },
            ],
          },
          {
            title: 'Development',
            items: [
              { label: 'Agent Team', to: '/development/agentic/agent-team' },
              { label: 'Workflow', to: '/development/agentic/workflow' },
              { label: 'Tech Stack', to: '/development/tech-stack' },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/steilerDev/cornerstone',
              },
              {
                label: 'Wiki',
                href: 'https://github.com/steilerDev/cornerstone/wiki',
              },
              {
                label: 'Project Board',
                href: 'https://github.com/users/steilerDev/projects/4',
              },
            ],
          },
        ],
        copyright: `Copyright ${new Date().getFullYear()} steilerDev. Built with Docusaurus.`,
      },
      colorMode: {
        defaultMode: 'light',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      prism: {
        additionalLanguages: ['bash', 'json', 'yaml', 'docker'],
      },
    }),
};

export default config;
