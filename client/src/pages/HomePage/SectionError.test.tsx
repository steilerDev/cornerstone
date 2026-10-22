/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionError } from './SectionError.js';

describe('SectionError', () => {
  it('names the section in the banner and offers a retry', async () => {
    const onRetry = jest.fn();
    render(<SectionError section="pulse" onRetry={onRetry} testId="err" />);

    expect(screen.getByTestId('err')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load Pulse.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses the section wording for Needs attention', () => {
    render(<SectionError section="needs-attention" onRetry={jest.fn()} testId="err" />);
    expect(screen.getByText("Couldn't load Needs attention.")).toBeInTheDocument();
  });
});
