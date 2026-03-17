/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiaryEntryFormProps } from './DiaryEntryForm.js';
import type React from 'react';

// DiaryEntryForm has no API deps — import directly after declaring module scope
let DiaryEntryForm: React.ComponentType<DiaryEntryFormProps>;

// ── Default props factory ─────────────────────────────────────────────────────

function makeProps(overrides: Partial<DiaryEntryFormProps> = {}): DiaryEntryFormProps {
  return {
    entryType: 'daily_log',
    entryDate: '2026-03-14',
    title: '',
    body: '',
    onEntryDateChange: jest.fn(),
    onTitleChange: jest.fn(),
    onBodyChange: jest.fn(),
    disabled: false,
    validationErrors: {},
    ...overrides,
  };
}

describe('DiaryEntryForm', () => {
  beforeEach(async () => {
    if (!DiaryEntryForm) {
      const mod = await import('./DiaryEntryForm.js');
      DiaryEntryForm = mod.DiaryEntryForm;
    }
  });

  // ─── Common fields ──────────────────────────────────────────────────────────

  describe('common fields', () => {
    it('renders the entry date input', () => {
      render(<DiaryEntryForm {...makeProps()} />);
      expect(screen.getByLabelText(/entry date/i)).toBeInTheDocument();
    });

    it('entry date input has the correct value', () => {
      render(<DiaryEntryForm {...makeProps({ entryDate: '2026-05-01' })} />);
      const input = screen.getByLabelText(/entry date/i) as HTMLInputElement;
      expect(input.value).toBe('2026-05-01');
    });

    it('calls onEntryDateChange when entry date changes', async () => {
      const onEntryDateChange = jest.fn();
      render(<DiaryEntryForm {...makeProps({ onEntryDateChange })} />);
      const input = screen.getByLabelText(/entry date/i);
      fireEvent.change(input, { target: { value: '2026-06-01' } });
      expect(onEntryDateChange).toHaveBeenCalledWith('2026-06-01');
    });

    it('renders the title input', () => {
      render(<DiaryEntryForm {...makeProps()} />);
      expect(screen.getByLabelText(/^title$/i)).toBeInTheDocument();
    });

    it('title input has the correct value', () => {
      render(<DiaryEntryForm {...makeProps({ title: 'My Entry' })} />);
      const input = screen.getByLabelText(/^title$/i) as HTMLInputElement;
      expect(input.value).toBe('My Entry');
    });

    it('calls onTitleChange when title changes', async () => {
      const user = userEvent.setup();
      const onTitleChange = jest.fn();
      render(<DiaryEntryForm {...makeProps({ onTitleChange })} />);
      const input = screen.getByLabelText(/^title$/i);
      await user.type(input, 'A');
      expect(onTitleChange).toHaveBeenCalled();
    });

    it('renders the body textarea', () => {
      render(<DiaryEntryForm {...makeProps()} />);
      expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument();
    });

    it('body textarea has the correct value', () => {
      render(<DiaryEntryForm {...makeProps({ body: 'Some notes here' })} />);
      const textarea = screen.getByRole('textbox', { name: /^entry/i }) as HTMLTextAreaElement;
      expect(textarea.value).toBe('Some notes here');
    });

    it('calls onBodyChange when body changes', async () => {
      const user = userEvent.setup();
      const onBodyChange = jest.fn();
      render(<DiaryEntryForm {...makeProps({ onBodyChange })} />);
      const textarea = screen.getByRole('textbox', { name: /^entry/i });
      await user.type(textarea, 'X');
      expect(onBodyChange).toHaveBeenCalled();
    });
  });

  // ─── Char counter ───────────────────────────────────────────────────────────

  describe('body char counter', () => {
    it('shows 0/10000 when body is empty', () => {
      render(<DiaryEntryForm {...makeProps({ body: '' })} />);
      expect(screen.getByText('0/10000')).toBeInTheDocument();
    });

    it('shows correct count when body has content', () => {
      render(<DiaryEntryForm {...makeProps({ body: 'Hello' })} />);
      expect(screen.getByText('5/10000')).toBeInTheDocument();
    });

    it('shows full count at maximum length', () => {
      render(<DiaryEntryForm {...makeProps({ body: 'A'.repeat(10000) })} />);
      expect(screen.getByText('10000/10000')).toBeInTheDocument();
    });
  });

  // ─── Validation errors ──────────────────────────────────────────────────────

  describe('validation errors', () => {
    it('shows entry date validation error text when present', () => {
      render(
        <DiaryEntryForm
          {...makeProps({ validationErrors: { entryDate: 'Entry date is required' } })}
        />,
      );
      expect(screen.getByText('Entry date is required')).toBeInTheDocument();
    });

    it('shows body validation error text when present', () => {
      render(
        <DiaryEntryForm {...makeProps({ validationErrors: { body: 'Entry text is required' } })} />,
      );
      expect(screen.getByText('Entry text is required')).toBeInTheDocument();
    });

    it('marks body textarea aria-invalid when body error is present', () => {
      render(
        <DiaryEntryForm {...makeProps({ validationErrors: { body: 'Entry text is required' } })} />,
      );
      const textarea = screen.getByRole('textbox', { name: /^entry/i });
      expect(textarea).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not mark body textarea aria-invalid when no error', () => {
      render(<DiaryEntryForm {...makeProps()} />);
      const textarea = screen.getByRole('textbox', { name: /^entry/i });
      expect(textarea).toHaveAttribute('aria-invalid', 'false');
    });

    it('shows inspector name validation error for site_visit', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'site_visit',
            validationErrors: { siteVisitInspectorName: 'Inspector name is required' },
          })}
        />,
      );
      expect(screen.getByText('Inspector name is required')).toBeInTheDocument();
    });

    it('shows outcome validation error for site_visit', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'site_visit',
            validationErrors: { siteVisitOutcome: 'Inspection outcome is required' },
          })}
        />,
      );
      expect(screen.getByText('Inspection outcome is required')).toBeInTheDocument();
    });

    it('shows severity validation error for issue', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'issue',
            validationErrors: { issueSeverity: 'Severity is required' },
          })}
        />,
      );
      expect(screen.getByText('Severity is required')).toBeInTheDocument();
    });

    it('shows resolution status validation error for issue', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'issue',
            validationErrors: { issueResolutionStatus: 'Resolution status is required' },
          })}
        />,
      );
      expect(screen.getByText('Resolution status is required')).toBeInTheDocument();
    });
  });

  // ─── disabled state ──────────────────────────────────────────────────────────

  describe('disabled state', () => {
    it('disables the entry date input when disabled=true', () => {
      render(<DiaryEntryForm {...makeProps({ disabled: true })} />);
      expect(screen.getByLabelText(/entry date/i)).toBeDisabled();
    });

    it('disables the title input when disabled=true', () => {
      render(<DiaryEntryForm {...makeProps({ disabled: true })} />);
      expect(screen.getByLabelText(/^title$/i)).toBeDisabled();
    });

    it('disables the body textarea when disabled=true', () => {
      render(<DiaryEntryForm {...makeProps({ disabled: true })} />);
      expect(screen.getByRole('textbox', { name: /^entry/i })).toBeDisabled();
    });

    it('disables the weather select when disabled=true (daily_log)', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log', disabled: true })} />);
      expect(screen.getByLabelText(/weather/i)).toBeDisabled();
    });

    it('disables the delivery vendor input when disabled=true (delivery)', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery', disabled: true })} />);
      expect(screen.getByLabelText(/^vendor$/i)).toBeDisabled();
    });
  });

  // ─── daily_log metadata ─────────────────────────────────────────────────────

  describe('daily_log metadata section', () => {
    it('shows "Daily Log Details" section heading', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      expect(screen.getByText('Daily Log Details')).toBeInTheDocument();
    });

    it('renders the weather select', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      expect(screen.getByLabelText(/weather/i)).toBeInTheDocument();
    });

    it('weather select has all options', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      const select = screen.getByLabelText(/weather/i) as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toContain('sunny');
      expect(optionValues).toContain('cloudy');
      expect(optionValues).toContain('rainy');
      expect(optionValues).toContain('snowy');
      expect(optionValues).toContain('stormy');
      expect(optionValues).toContain('other');
    });

    it('shows the current weather value', () => {
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', dailyLogWeather: 'sunny' })} />,
      );
      const select = screen.getByLabelText(/weather/i) as HTMLSelectElement;
      expect(select.value).toBe('sunny');
    });

    it('calls onDailyLogWeatherChange when weather is changed', () => {
      const onDailyLogWeatherChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', onDailyLogWeatherChange })} />,
      );
      const select = screen.getByLabelText(/weather/i);
      fireEvent.change(select, { target: { value: 'rainy' } });
      expect(onDailyLogWeatherChange).toHaveBeenCalledWith('rainy');
    });

    it('renders the temperature input', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      expect(screen.getByLabelText(/temperature/i)).toBeInTheDocument();
    });

    it('shows the current temperature value', () => {
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', dailyLogTemperature: 22 })} />,
      );
      const input = screen.getByLabelText(/temperature/i) as HTMLInputElement;
      expect(input.value).toBe('22');
    });

    it('calls onDailyLogTemperatureChange when temperature changes', () => {
      const onDailyLogTemperatureChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', onDailyLogTemperatureChange })} />,
      );
      const input = screen.getByLabelText(/temperature/i);
      fireEvent.change(input, { target: { value: '15' } });
      expect(onDailyLogTemperatureChange).toHaveBeenCalledWith(15);
    });

    it('calls onDailyLogTemperatureChange with null when cleared', () => {
      const onDailyLogTemperatureChange = jest.fn();
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'daily_log',
            dailyLogTemperature: 20,
            onDailyLogTemperatureChange,
          })}
        />,
      );
      const input = screen.getByLabelText(/temperature/i);
      fireEvent.change(input, { target: { value: '' } });
      expect(onDailyLogTemperatureChange).toHaveBeenCalledWith(null);
    });

    it('renders the workers on site input', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      expect(screen.getByLabelText(/workers on site/i)).toBeInTheDocument();
    });

    it('shows the current workers value', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log', dailyLogWorkers: 7 })} />);
      const input = screen.getByLabelText(/workers on site/i) as HTMLInputElement;
      expect(input.value).toBe('7');
    });

    it('calls onDailyLogWorkersChange when workers changes', () => {
      const onDailyLogWorkersChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', onDailyLogWorkersChange })} />,
      );
      const input = screen.getByLabelText(/workers on site/i);
      fireEvent.change(input, { target: { value: '3' } });
      expect(onDailyLogWorkersChange).toHaveBeenCalledWith(3);
    });
  });

  // ─── site_visit metadata ────────────────────────────────────────────────────

  describe('site_visit metadata section', () => {
    it('shows "Site Visit Details" section heading', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      expect(screen.getByText('Site Visit Details')).toBeInTheDocument();
    });

    it('renders the inspector name input with required marker', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      expect(screen.getByLabelText(/inspector name/i)).toBeInTheDocument();
    });

    it('inspector name input has required attribute', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      expect(screen.getByLabelText(/inspector name/i)).toHaveAttribute('required');
    });

    it('shows the current inspector name value', () => {
      render(
        <DiaryEntryForm
          {...makeProps({ entryType: 'site_visit', siteVisitInspectorName: 'Jane Doe' })}
        />,
      );
      const input = screen.getByLabelText(/inspector name/i) as HTMLInputElement;
      expect(input.value).toBe('Jane Doe');
    });

    it('calls onSiteVisitInspectorNameChange when name changes', () => {
      const onSiteVisitInspectorNameChange = jest.fn();
      render(
        <DiaryEntryForm
          {...makeProps({ entryType: 'site_visit', onSiteVisitInspectorNameChange })}
        />,
      );
      const input = screen.getByLabelText(/inspector name/i);
      fireEvent.change(input, { target: { value: 'Bob Smith' } });
      expect(onSiteVisitInspectorNameChange).toHaveBeenCalledWith('Bob Smith');
    });

    it('renders the inspection outcome select with required attribute', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      const select = screen.getByLabelText(/inspection outcome/i);
      expect(select).toBeInTheDocument();
      expect(select).toHaveAttribute('required');
    });

    it('outcome select has pass, fail, conditional options', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      const select = screen.getByLabelText(/inspection outcome/i) as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toContain('pass');
      expect(optionValues).toContain('fail');
      expect(optionValues).toContain('conditional');
    });

    it('shows the current outcome value', () => {
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'site_visit', siteVisitOutcome: 'pass' })} />,
      );
      const select = screen.getByLabelText(/inspection outcome/i) as HTMLSelectElement;
      expect(select.value).toBe('pass');
    });

    it('calls onSiteVisitOutcomeChange when outcome changes', () => {
      const onSiteVisitOutcomeChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'site_visit', onSiteVisitOutcomeChange })} />,
      );
      const select = screen.getByLabelText(/inspection outcome/i);
      fireEvent.change(select, { target: { value: 'fail' } });
      expect(onSiteVisitOutcomeChange).toHaveBeenCalledWith('fail');
    });
  });

  // ─── delivery metadata ──────────────────────────────────────────────────────

  describe('delivery metadata section', () => {
    it('shows "Delivery Details" section heading', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery' })} />);
      expect(screen.getByText('Delivery Details')).toBeInTheDocument();
    });

    it('renders the vendor input', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery' })} />);
      expect(screen.getByLabelText(/^vendor$/i)).toBeInTheDocument();
    });

    it('shows the current vendor value', () => {
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'delivery', deliveryVendor: 'ACME Corp' })} />,
      );
      const input = screen.getByLabelText(/^vendor$/i) as HTMLInputElement;
      expect(input.value).toBe('ACME Corp');
    });

    it('calls onDeliveryVendorChange when vendor changes', () => {
      const onDeliveryVendorChange = jest.fn();
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery', onDeliveryVendorChange })} />);
      const input = screen.getByLabelText(/^vendor$/i);
      fireEvent.change(input, { target: { value: 'Supplier X' } });
      expect(onDeliveryVendorChange).toHaveBeenCalledWith('Supplier X');
    });

    it('renders the Add button for materials', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery' })} />);
      expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument();
    });

    it('renders existing material chips', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'delivery',
            deliveryMaterials: ['Concrete', 'Steel beams'],
          })}
        />,
      );
      expect(screen.getByText('Concrete')).toBeInTheDocument();
      expect(screen.getByText('Steel beams')).toBeInTheDocument();
    });

    it('renders remove buttons for each material chip', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'delivery',
            deliveryMaterials: ['Lumber', 'Nails'],
          })}
        />,
      );
      expect(screen.getByRole('button', { name: /remove lumber/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /remove nails/i })).toBeInTheDocument();
    });

    it('calls onDeliveryMaterialsChange without the item when remove is clicked', () => {
      const onDeliveryMaterialsChange = jest.fn();
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'delivery',
            deliveryMaterials: ['Lumber', 'Nails'],
            onDeliveryMaterialsChange,
          })}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /remove lumber/i }));
      expect(onDeliveryMaterialsChange).toHaveBeenCalledWith(['Nails']);
    });

    it('calls onDeliveryMaterialsChange with null when last material is removed', () => {
      const onDeliveryMaterialsChange = jest.fn();
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'delivery',
            deliveryMaterials: ['Lumber'],
            onDeliveryMaterialsChange,
          })}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /remove lumber/i }));
      expect(onDeliveryMaterialsChange).toHaveBeenCalledWith(null);
    });

    it('adds a material via the form input and Add button', async () => {
      const user = userEvent.setup();
      const onDeliveryMaterialsChange = jest.fn();
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'delivery',
            deliveryMaterials: null,
            onDeliveryMaterialsChange,
          })}
        />,
      );
      const materialInput = screen.getByPlaceholderText(/add item and press enter/i);
      await user.type(materialInput, 'Rebar');
      await user.click(screen.getByRole('button', { name: /^add$/i }));
      expect(onDeliveryMaterialsChange).toHaveBeenCalledWith(['Rebar']);
    });

    it('does not add material when input is blank', async () => {
      const user = userEvent.setup();
      const onDeliveryMaterialsChange = jest.fn();
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'delivery',
            deliveryMaterials: null,
            onDeliveryMaterialsChange,
          })}
        />,
      );
      await user.click(screen.getByRole('button', { name: /^add$/i }));
      expect(onDeliveryMaterialsChange).not.toHaveBeenCalled();
    });

    it('appends material to existing list', async () => {
      const user = userEvent.setup();
      const onDeliveryMaterialsChange = jest.fn();
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'delivery',
            deliveryMaterials: ['Lumber'],
            onDeliveryMaterialsChange,
          })}
        />,
      );
      const materialInput = screen.getByPlaceholderText(/add item and press enter/i);
      await user.type(materialInput, 'Nails');
      await user.click(screen.getByRole('button', { name: /^add$/i }));
      expect(onDeliveryMaterialsChange).toHaveBeenCalledWith(['Lumber', 'Nails']);
    });

    it('disables Add button when disabled=true', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery', disabled: true })} />);
      expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
    });
  });

  // ─── issue metadata ─────────────────────────────────────────────────────────

  describe('issue metadata section', () => {
    it('shows "Issue Details" section heading', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue' })} />);
      expect(screen.getByText('Issue Details')).toBeInTheDocument();
    });

    it('renders the severity select with required attribute', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue' })} />);
      const select = screen.getByLabelText(/severity/i);
      expect(select).toBeInTheDocument();
      expect(select).toHaveAttribute('required');
    });

    it('severity select has low, medium, high, critical options', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue' })} />);
      const select = screen.getByLabelText(/severity/i) as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toContain('low');
      expect(optionValues).toContain('medium');
      expect(optionValues).toContain('high');
      expect(optionValues).toContain('critical');
    });

    it('shows the current severity value', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue', issueSeverity: 'high' })} />);
      const select = screen.getByLabelText(/severity/i) as HTMLSelectElement;
      expect(select.value).toBe('high');
    });

    it('calls onIssueSeverityChange when severity changes', () => {
      const onIssueSeverityChange = jest.fn();
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue', onIssueSeverityChange })} />);
      const select = screen.getByLabelText(/severity/i);
      fireEvent.change(select, { target: { value: 'critical' } });
      expect(onIssueSeverityChange).toHaveBeenCalledWith('critical');
    });

    it('renders the resolution status select with required attribute', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue' })} />);
      const select = screen.getByLabelText(/resolution status/i);
      expect(select).toBeInTheDocument();
      expect(select).toHaveAttribute('required');
    });

    it('resolution status select has open, in_progress, resolved options', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue' })} />);
      const select = screen.getByLabelText(/resolution status/i) as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toContain('open');
      expect(optionValues).toContain('in_progress');
      expect(optionValues).toContain('resolved');
    });

    it('shows the current resolution status value', () => {
      render(
        <DiaryEntryForm
          {...makeProps({ entryType: 'issue', issueResolutionStatus: 'in_progress' })}
        />,
      );
      const select = screen.getByLabelText(/resolution status/i) as HTMLSelectElement;
      expect(select.value).toBe('in_progress');
    });

    it('calls onIssueResolutionStatusChange when status changes', () => {
      const onIssueResolutionStatusChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'issue', onIssueResolutionStatusChange })} />,
      );
      const select = screen.getByLabelText(/resolution status/i);
      fireEvent.change(select, { target: { value: 'resolved' } });
      expect(onIssueResolutionStatusChange).toHaveBeenCalledWith('resolved');
    });
  });

  // ─── general_note — no metadata section ─────────────────────────────────────

  describe('general_note type', () => {
    it('does not render any type-specific metadata section', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'general_note' })} />);
      expect(screen.queryByText('Daily Log Details')).not.toBeInTheDocument();
      expect(screen.queryByText('Site Visit Details')).not.toBeInTheDocument();
      expect(screen.queryByText('Delivery Details')).not.toBeInTheDocument();
      expect(screen.queryByText('Issue Details')).not.toBeInTheDocument();
    });

    it('still renders date, title, body fields', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'general_note' })} />);
      expect(screen.getByLabelText(/entry date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^title$/i)).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument();
    });
  });

  // ─── metadata sections are exclusive ────────────────────────────────────────

  describe('type exclusivity', () => {
    it('daily_log does not show site_visit section', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      expect(screen.queryByText('Site Visit Details')).not.toBeInTheDocument();
    });

    it('site_visit does not show daily_log section', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      expect(screen.queryByText('Daily Log Details')).not.toBeInTheDocument();
    });

    it('delivery does not show issue section', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery' })} />);
      expect(screen.queryByText('Issue Details')).not.toBeInTheDocument();
    });
  });
});
