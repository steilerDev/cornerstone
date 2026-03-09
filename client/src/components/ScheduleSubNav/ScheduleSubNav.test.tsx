/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScheduleSubNav } from './ScheduleSubNav.js';

function renderNav(initialPath = '/schedule/gantt') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ScheduleSubNav />
    </MemoryRouter>,
  );
}

describe('ScheduleSubNav', () => {
  it('renders both Gantt and Calendar tabs', () => {
    renderNav();

    expect(screen.getByTestId('schedule-view-gantt')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-view-calendar')).toBeInTheDocument();
    expect(screen.getByText('Gantt')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('renders nav with aria-label="Schedule view navigation"', () => {
    renderNav();

    expect(
      screen.getByRole('navigation', { name: 'Schedule view navigation' }),
    ).toBeInTheDocument();
  });

  it('renders data-testid="schedule-view-gantt" on Gantt tab', () => {
    renderNav();

    expect(screen.getByTestId('schedule-view-gantt')).toBeInTheDocument();
  });

  it('renders data-testid="schedule-view-calendar" on Calendar tab', () => {
    renderNav();

    expect(screen.getByTestId('schedule-view-calendar')).toBeInTheDocument();
  });

  it('Gantt tab links to /schedule/gantt', () => {
    renderNav();

    const ganttTab = screen.getByTestId('schedule-view-gantt');
    expect(ganttTab).toHaveAttribute('href', '/schedule/gantt');
  });

  it('Calendar tab links to /schedule/calendar', () => {
    renderNav();

    const calendarTab = screen.getByTestId('schedule-view-calendar');
    expect(calendarTab).toHaveAttribute('href', '/schedule/calendar');
  });
});
