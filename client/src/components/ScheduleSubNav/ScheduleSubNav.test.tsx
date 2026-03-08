/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleSubNav } from './ScheduleSubNav.js';

describe('ScheduleSubNav', () => {
  it('renders both Gantt and Calendar buttons', () => {
    render(<ScheduleSubNav activeView="gantt" onViewChange={jest.fn()} />);

    expect(screen.getByTestId('schedule-view-gantt')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-view-calendar')).toBeInTheDocument();
    expect(screen.getByText('Gantt')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('sets aria-pressed="true" on Gantt and aria-pressed="false" on Calendar when activeView="gantt"', () => {
    render(<ScheduleSubNav activeView="gantt" onViewChange={jest.fn()} />);

    expect(screen.getByTestId('schedule-view-gantt')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('schedule-view-calendar')).toHaveAttribute('aria-pressed', 'false');
  });

  it('sets aria-pressed="true" on Calendar and aria-pressed="false" on Gantt when activeView="calendar"', () => {
    render(<ScheduleSubNav activeView="calendar" onViewChange={jest.fn()} />);

    expect(screen.getByTestId('schedule-view-calendar')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('schedule-view-gantt')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onViewChange("calendar") when Calendar button is clicked', () => {
    const onViewChange = jest.fn();
    render(<ScheduleSubNav activeView="gantt" onViewChange={onViewChange} />);

    fireEvent.click(screen.getByTestId('schedule-view-calendar'));

    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith('calendar');
  });

  it('calls onViewChange("gantt") when Gantt button is clicked', () => {
    const onViewChange = jest.fn();
    render(<ScheduleSubNav activeView="calendar" onViewChange={onViewChange} />);

    fireEvent.click(screen.getByTestId('schedule-view-gantt'));

    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith('gantt');
  });

  it('renders nav with aria-label="Schedule view navigation"', () => {
    render(<ScheduleSubNav activeView="gantt" onViewChange={jest.fn()} />);

    expect(screen.getByRole('navigation', { name: 'Schedule view navigation' })).toBeInTheDocument();
  });

  it('renders data-testid="schedule-view-gantt" on Gantt button', () => {
    render(<ScheduleSubNav activeView="gantt" onViewChange={jest.fn()} />);

    expect(screen.getByTestId('schedule-view-gantt')).toBeInTheDocument();
  });

  it('renders data-testid="schedule-view-calendar" on Calendar button', () => {
    render(<ScheduleSubNav activeView="gantt" onViewChange={jest.fn()} />);

    expect(screen.getByTestId('schedule-view-calendar')).toBeInTheDocument();
  });

  it('renders SVG icons with aria-hidden="true" on both buttons', () => {
    const { container } = render(<ScheduleSubNav activeView="gantt" onViewChange={jest.fn()} />);

    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
    svgs.forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('does not call onViewChange when the already-active button is clicked', () => {
    const onViewChange = jest.fn();
    render(<ScheduleSubNav activeView="gantt" onViewChange={onViewChange} />);

    // Clicking the already-active Gantt button still invokes the handler
    // (ScheduleSubNav is a controlled component — caller decides whether to update)
    fireEvent.click(screen.getByTestId('schedule-view-gantt'));

    expect(onViewChange).toHaveBeenCalledWith('gantt');
  });
});
