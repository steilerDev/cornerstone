/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import { DOCS_BASE_URL } from '../../lib/externalLinks.js';
import { IntegrationCard } from './IntegrationCard.js';
import type { IntegrationCardProps } from './IntegrationCard.js';
import { INTEGRATION_GUIDE_PATHS } from './integrationGuides.js';

function renderCard(overrides: Partial<IntegrationCardProps> = {}) {
  return render(
    <IntegrationCard
      anchor="ai"
      title="AI features"
      purpose="Reads documents."
      env={{ required: ['FAKE_ENV_ONE', 'FAKE_ENV_TWO'], optional: ['FAKE_ENV_THREE'] }}
      hint="Set these and restart."
      loading={false}
      loadingLabel="Loading AI features"
      {...overrides}
    />,
  );
}

describe('IntegrationCard', () => {
  it('renders a labelled section with the heading, chip and purpose', () => {
    renderCard({ chip: <span>Chip</span> });

    const section = screen.getByTestId('integration-ai');
    expect(section).toHaveAttribute('id', 'ai');
    expect(section).toHaveAttribute('aria-labelledby', 'ai-heading');
    const heading = within(section).getByRole('heading', { level: 2, name: 'AI features' });
    expect(heading).toHaveAttribute('id', 'ai-heading');
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(within(section).getByText('Chip')).toBeInTheDocument();
    expect(within(section).getByText('Reads documents.')).toBeInTheDocument();
  });

  it('shows a skeleton and no setup block while loading', () => {
    renderCard({ loading: true, env: null });

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading AI features' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('lists required and optional names from the env prop', () => {
    renderCard();

    const env = screen.getByTestId('integration-ai-env');
    expect(within(env).getByText('FAKE_ENV_ONE').tagName).toBe('CODE');
    expect(within(env).getByText('FAKE_ENV_TWO')).toBeInTheDocument();
    expect(within(env).getByText('FAKE_ENV_THREE')).toBeInTheDocument();
    expect(within(env).getByText('Required')).toBeInTheDocument();
    expect(within(env).getByText('Optional')).toBeInTheDocument();
  });

  it('omits the required group when there are no required names', () => {
    renderCard({ env: { required: [], optional: ['FAKE_ENV_THREE'] } });

    const env = screen.getByTestId('integration-ai-env');
    expect(within(env).queryByText('Required')).toBeNull();
    expect(within(env).getByText('Optional')).toBeInTheDocument();
  });

  it('omits the optional group when there are no optional names', () => {
    renderCard({ env: { required: ['FAKE_ENV_ONE'], optional: [] } });

    const env = screen.getByTestId('integration-ai-env');
    expect(within(env).queryByText('Optional')).toBeNull();
    expect(within(env).getByText('Required')).toBeInTheDocument();
  });

  it('says no setup is needed when the card has no names', () => {
    renderCard({ env: { required: [], optional: [] } });

    expect(screen.getByText('No setup needed on the server.')).toBeInTheDocument();
    expect(screen.queryByTestId('integration-ai-env')).toBeNull();
  });

  it('shows the hint but no names while env is null', () => {
    renderCard({ env: null });

    expect(screen.getByText('Set these and restart.')).toBeInTheDocument();
    expect(screen.queryByTestId('integration-ai-env')).toBeNull();
    expect(screen.queryByText('No setup needed on the server.')).toBeNull();
  });

  it('renders facts as a definition list with test ids', () => {
    renderCard({
      facts: [
        { name: 'model', label: 'Model', value: 'model-x' },
        { name: 'address', label: 'Address', value: 'llm.example.test' },
      ],
    });

    const row = screen.getByTestId('integration-ai-fact-model');
    expect(within(row).getByText('Model').tagName).toBe('DT');
    expect(within(row).getByText('model-x').tagName).toBe('DD');
    expect(screen.getByTestId('integration-ai-fact-address')).toHaveTextContent(
      'Addressllm.example.test',
    );
  });

  it('renders no facts list for an empty facts array', () => {
    renderCard({ facts: [] });

    expect(screen.queryByTestId(/integration-ai-fact-/)).toBeNull();
  });

  it('renders the notice and the after row', () => {
    renderCard({ notice: <p>Careful</p>, after: <a href="/x">Pointer</a> });

    expect(screen.getByText('Careful')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pointer' })).toBeInTheDocument();
  });

  it('links to the setup guide in a new tab with a label that starts with the visible text', () => {
    renderCard();

    const link = screen.getByTestId('integration-ai-docs');
    expect(link).toHaveAttribute('href', `${DOCS_BASE_URL}/${INTEGRATION_GUIDE_PATHS.ai}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    const visible = (link.textContent ?? '').replace('↗', '').trim();
    expect(visible.length).toBeGreaterThan(0);
    expect(link.getAttribute('aria-label')?.startsWith(visible)).toBe(true);
    expect(link.getAttribute('aria-label')).toContain('AI features');
  });

  it('omits the docs link when docs is false, and shows it by default', () => {
    const { unmount } = renderCard({ docs: false });
    expect(screen.queryByTestId('integration-ai-docs')).toBeNull();
    expect(screen.getByText('Set these and restart.')).toBeInTheDocument();
    unmount();
    renderCard();
    expect(screen.getByTestId('integration-ai-docs')).toBeInTheDocument();
  });
});
