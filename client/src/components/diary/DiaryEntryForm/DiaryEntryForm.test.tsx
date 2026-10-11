/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiaryEntryFormProps } from './DiaryEntryForm.js';
import type React from 'react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '../../../contexts/LocaleContext.js';

/**
 * Custom render function that wraps the component with LocaleProvider —
 * DiaryEntryForm uses useFormatters() (via useLocale()), which throws
 * outside a LocaleProvider. See DateRangePicker.test.tsx for the reference pattern.
 */
function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>, options);
}

// Vendor search for the daily_log SearchPicker.
const mockFetchVendors = jest.fn<(params?: unknown) => Promise<{ vendors: unknown[] }>>();
jest.unstable_mockModule('../../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

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
    localStorage.clear();
    mockFetchVendors.mockReset();
    mockFetchVendors.mockResolvedValue({ vendors: [{ id: 'v-1', name: 'Acme Concrete' }] });
  });

  afterEach(() => {
    localStorage.clear();
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
    it('shows daily_log section heading as first field label h3 ("Weather")', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      expect(screen.getByRole('heading', { level: 3, name: 'Weather' })).toBeInTheDocument();
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

    it('renders the number of workers input', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      expect(screen.getByLabelText(/number of workers/i)).toBeInTheDocument();
    });

    it('shows the current workers value', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log', dailyLogWorkers: 7 })} />);
      const input = screen.getByLabelText(/number of workers/i) as HTMLInputElement;
      expect(input.value).toBe('7');
    });

    it('calls onDailyLogWorkersChange when workers changes', () => {
      const onDailyLogWorkersChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', onDailyLogWorkersChange })} />,
      );
      const input = screen.getByLabelText(/number of workers/i);
      fireEvent.change(input, { target: { value: '3' } });
      expect(onDailyLogWorkersChange).toHaveBeenCalledWith(3);
    });
  });

  // ─── site_visit metadata ────────────────────────────────────────────────────

  describe('site_visit metadata section', () => {
    it('shows site_visit section heading as first field label h3 ("Inspector Name")', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      expect(screen.getByRole('heading', { level: 3, name: 'Inspector Name' })).toBeInTheDocument();
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
    it('shows delivery section heading as first field label h3 ("Vendor")', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery' })} />);
      expect(screen.getByRole('heading', { level: 3, name: 'Vendor' })).toBeInTheDocument();
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
    it('shows issue section heading as first field label h3 ("Issue Severity")', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue' })} />);
      expect(screen.getByRole('heading', { level: 3, name: 'Issue Severity' })).toBeInTheDocument();
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

    it('labels the options with the canonical defect vocabulary (Open / Being fixed / Fixed)', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue' })} />);
      const select = screen.getByLabelText(/resolution status/i) as HTMLSelectElement;
      expect(
        Array.from(select.options)
          .filter((o) => o.value)
          .map((o) => [o.value, o.textContent]),
      ).toEqual([
        ['open', 'Open'],
        ['in_progress', 'Being fixed'],
        ['resolved', 'Fixed'],
      ]);
    });

    it('showResolutionStatus=false hides the select entirely (saved entries use the status menu)', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'issue',
            showResolutionStatus: false,
            issueResolutionStatus: 'open',
          })}
        />,
      );
      expect(screen.queryByLabelText(/resolution status/i)).toBeNull();
      expect(document.getElementById('resolution-status')).toBeNull();
      // the severity control is still there
      expect(screen.getByLabelText(/severity/i)).toBeInTheDocument();
    });

    it('showResolutionStatus defaults to true (capture and drafts keep the select)', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'issue' })} />);
      expect(document.getElementById('resolution-status')).not.toBeNull();
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
      expect(screen.queryByRole('heading', { level: 3, name: 'Weather' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { level: 3, name: 'Inspector Name' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 3, name: 'Vendor' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { level: 3, name: 'Issue Severity' }),
      ).not.toBeInTheDocument();
    });

    it('still renders date, title, body fields', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'general_note' })} />);
      expect(screen.getByLabelText(/entry date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^title$/i)).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument();
    });
  });

  // ─── daily_log vendor + work-time fields (Story #1672) ────────────────────

  describe('daily_log vendor + work-time fields', () => {
    it('daily_log renders vendor SearchPicker with label "Vendor"', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      // The SearchPicker for the vendor field has an associated label element
      // with "Vendor" text (the id="daily-log-vendor" ties them together).
      const vendorLabel = screen.getByText('Vendor');
      expect(vendorLabel).toBeInTheDocument();
    });

    it('daily_log renders #work-start-time input', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      const input = document.getElementById('work-start-time');
      expect(input).toBeInTheDocument();
      expect((input as HTMLInputElement).type).toBe('time');
    });

    it('daily_log renders #work-end-time input', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      const input = document.getElementById('work-end-time');
      expect(input).toBeInTheDocument();
      expect((input as HTMLInputElement).type).toBe('time');
    });

    it('calls onDailyLogWorkStartChange on start input change', () => {
      const onDailyLogWorkStartChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', onDailyLogWorkStartChange })} />,
      );
      const input = document.getElementById('work-start-time')!;
      fireEvent.change(input, { target: { value: '08:00' } });
      expect(onDailyLogWorkStartChange).toHaveBeenCalledWith('08:00');
    });

    it('calls onDailyLogWorkEndChange on end input change', () => {
      const onDailyLogWorkEndChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', onDailyLogWorkEndChange })} />,
      );
      const input = document.getElementById('work-end-time')!;
      fireEvent.change(input, { target: { value: '16:30' } });
      expect(onDailyLogWorkEndChange).toHaveBeenCalledWith('16:30');
    });

    it('shows duration "8.50 h" when both valid times given (end>start)', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'daily_log',
            dailyLogWorkStart: '08:00',
            dailyLogWorkEnd: '16:30',
          })}
        />,
      );
      const statusEl = screen.getByRole('status');
      expect(statusEl.textContent).toContain('8.50 h');
    });

    it('shows duration "8,50 h" (comma decimal) under de-DE locale', () => {
      localStorage.setItem('locale', 'de');
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'daily_log',
            dailyLogWorkStart: '08:00',
            dailyLogWorkEnd: '16:30',
          })}
        />,
      );
      const statusEl = screen.getByRole('status');
      expect(statusEl.textContent).toContain('8,50 h');
      expect(statusEl.textContent).not.toContain('8.50 h');
    });

    it('does not show duration when only start time given', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'daily_log',
            dailyLogWorkStart: '08:00',
            dailyLogWorkEnd: null,
          })}
        />,
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows cross-field error + aria-invalid on both inputs when validationErrors.dailyLogWorkTime set', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'daily_log',
            validationErrors: { dailyLogWorkTime: 'Work end must be after work start' },
          })}
        />,
      );
      expect(screen.getByText('Work end must be after work start')).toBeInTheDocument();
      const startInput = document.getElementById('work-start-time')!;
      const endInput = document.getElementById('work-end-time')!;
      expect(startInput).toHaveAttribute('aria-invalid', 'true');
      expect(endInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not render work-time fields for site_visit entry type', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      expect(document.getElementById('work-start-time')).not.toBeInTheDocument();
      expect(document.getElementById('work-end-time')).not.toBeInTheDocument();
    });
  });

  // ─── metadata sections are exclusive ────────────────────────────────────────

  describe('type exclusivity', () => {
    it('daily_log does not show site_visit section heading', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      expect(
        screen.queryByRole('heading', { level: 3, name: 'Inspector Name' }),
      ).not.toBeInTheDocument();
    });

    it('site_visit does not show daily_log section heading', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      expect(screen.queryByRole('heading', { level: 3, name: 'Weather' })).not.toBeInTheDocument();
    });

    it('delivery does not show issue section heading', () => {
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery' })} />);
      expect(
        screen.queryByRole('heading', { level: 3, name: 'Issue Severity' }),
      ).not.toBeInTheDocument();
    });
  });

  // ─── Incomplete signature errors (#2088) ───────────────────────────────────

  describe('signature validation errors (#2088)', () => {
    it('renders #daily-log-signatures-error with role=alert for a daily_log', () => {
      const { container } = render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'daily_log',
            validationErrors: { dailyLogSignatures: 'Unfinished signature' },
          })}
        />,
      );
      const el = container.querySelector('#daily-log-signatures-error');
      expect(el).not.toBeNull();
      expect(el).toHaveAttribute('role', 'alert');
      expect(el).toHaveTextContent('Unfinished signature');
    });

    it('does not render #daily-log-signatures-error when there is no error', () => {
      const { container } = render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      expect(container.querySelector('#daily-log-signatures-error')).toBeNull();
    });

    it('renders #site-visit-signatures-error with role=alert for a site_visit', () => {
      const { container } = render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'site_visit',
            validationErrors: { siteVisitSignatures: 'Unfinished signature' },
          })}
        />,
      );
      const el = container.querySelector('#site-visit-signatures-error');
      expect(el).not.toBeNull();
      expect(el).toHaveAttribute('role', 'alert');
      expect(el).toHaveTextContent('Unfinished signature');
    });

    it('does not render #site-visit-signatures-error when there is no error', () => {
      const { container } = render(<DiaryEntryForm {...makeProps({ entryType: 'site_visit' })} />);
      expect(container.querySelector('#site-visit-signatures-error')).toBeNull();
    });

    it('renders #issue-signatures-error with role=alert for an issue (#2125)', () => {
      const { container } = render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'issue',
            validationErrors: { issueSignatures: 'Unfinished signature' },
          })}
        />,
      );
      const el = container.querySelector('#issue-signatures-error');
      expect(el).not.toBeNull();
      expect(el).toHaveAttribute('role', 'alert');
      expect(el).toHaveTextContent('Unfinished signature');
    });

    it('does not render #issue-signatures-error when there is no error', () => {
      const { container } = render(<DiaryEntryForm {...makeProps({ entryType: 'issue' })} />);
      expect(container.querySelector('#issue-signatures-error')).toBeNull();
    });

    it('does not render #issue-signatures-error for non-issue entry types', () => {
      const { container } = render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'daily_log',
            validationErrors: { issueSignatures: 'Unfinished signature' },
          })}
        />,
      );
      expect(container.querySelector('#issue-signatures-error')).toBeNull();
    });
  });

  // ─── Whole-file coverage: field handlers, with and without callbacks ────────

  describe('metadata field handlers', () => {
    type Row = {
      label: string;
      props: Partial<DiaryEntryFormProps>;
      id: string;
      handler: keyof DiaryEntryFormProps;
      from: string;
      to: string;
      expected: unknown;
      fromProp: Partial<DiaryEntryFormProps>;
    };
    const rows: Row[] = [
      {
        label: 'weather',
        props: { entryType: 'daily_log' },
        id: 'weather',
        handler: 'onDailyLogWeatherChange',
        from: 'sunny',
        to: 'rainy',
        expected: 'rainy',
        fromProp: { dailyLogWeather: 'sunny' },
      },
      {
        label: 'temperature',
        props: { entryType: 'daily_log' },
        id: 'temperature',
        handler: 'onDailyLogTemperatureChange',
        from: '5',
        to: '21',
        expected: 21,
        fromProp: { dailyLogTemperature: 5 },
      },
      {
        label: 'workers',
        props: { entryType: 'daily_log' },
        id: 'workers',
        handler: 'onDailyLogWorkersChange',
        from: '3',
        to: '8',
        expected: 8,
        fromProp: { dailyLogWorkers: 3 },
      },
      {
        label: 'work start',
        props: { entryType: 'daily_log' },
        id: 'work-start-time',
        handler: 'onDailyLogWorkStartChange',
        from: '07:00',
        to: '08:30',
        expected: '08:30',
        fromProp: { dailyLogWorkStart: '07:00' },
      },
      {
        label: 'work end',
        props: { entryType: 'daily_log' },
        id: 'work-end-time',
        handler: 'onDailyLogWorkEndChange',
        from: '16:00',
        to: '17:15',
        expected: '17:15',
        fromProp: { dailyLogWorkEnd: '16:00' },
      },
      {
        label: 'inspector name',
        props: { entryType: 'site_visit' },
        id: 'inspector-name',
        handler: 'onSiteVisitInspectorNameChange',
        from: 'Bob',
        to: 'Carl',
        expected: 'Carl',
        fromProp: { siteVisitInspectorName: 'Bob' },
      },
      {
        label: 'inspection outcome',
        props: { entryType: 'site_visit' },
        id: 'inspection-outcome',
        handler: 'onSiteVisitOutcomeChange',
        from: 'pass',
        to: 'fail',
        expected: 'fail',
        fromProp: { siteVisitOutcome: 'pass' },
      },
      {
        label: 'delivery vendor',
        props: { entryType: 'delivery' },
        id: 'vendor',
        handler: 'onDeliveryVendorChange',
        from: 'TimberCo',
        to: 'SteelCo',
        expected: 'SteelCo',
        fromProp: { deliveryVendor: 'TimberCo' },
      },
      {
        label: 'severity',
        props: { entryType: 'issue' },
        id: 'severity',
        handler: 'onIssueSeverityChange',
        from: 'low',
        to: 'critical',
        expected: 'critical',
        fromProp: { issueSeverity: 'low' },
      },
      {
        label: 'resolution status',
        props: { entryType: 'issue' },
        id: 'resolution-status',
        handler: 'onIssueResolutionStatusChange',
        from: 'open',
        to: 'resolved',
        expected: 'resolved',
        fromProp: { issueResolutionStatus: 'open' },
      },
    ];

    it.each(rows)('$label: a new value is passed to the handler as the typed value', (row) => {
      const handler = jest.fn();
      const { container } = render(
        <DiaryEntryForm
          {...makeProps({ ...row.props, ...row.fromProp, [row.handler]: handler } as never)}
        />,
      );
      fireEvent.change(container.querySelector(`#${row.id}`)!, { target: { value: row.to } });
      expect(handler).toHaveBeenCalledWith(row.expected);
    });

    it.each(rows)('$label: clearing the value passes null to the handler', (row) => {
      const handler = jest.fn();
      const { container } = render(
        <DiaryEntryForm
          {...makeProps({ ...row.props, ...row.fromProp, [row.handler]: handler } as never)}
        />,
      );
      fireEvent.change(container.querySelector(`#${row.id}`)!, { target: { value: '' } });
      expect(handler).toHaveBeenCalledWith(null);
    });

    it.each(rows)('$label: changes are ignored safely when no handler is supplied', (row) => {
      const { container } = render(
        <DiaryEntryForm {...makeProps({ ...row.props, ...row.fromProp } as never)} />,
      );
      const el = container.querySelector(`#${row.id}`) as HTMLInputElement;
      fireEvent.change(el, { target: { value: row.to } });
      // Controlled input: with no handler to update the prop, the original value is restored.
      expect(el.value).toBe(row.from);
    });
  });

  describe('delivery materials without handler and edge cases', () => {
    it('adding a material with no handler leaves the input untouched', async () => {
      const user = userEvent.setup();
      render(<DiaryEntryForm {...makeProps({ entryType: 'delivery' })} />);
      const input = screen.getByPlaceholderText(/add item and press enter/i) as HTMLInputElement;
      await user.type(input, 'Gravel');
      await user.click(screen.getByRole('button', { name: /^add/i }));
      expect(input.value).toBe('Gravel');
    });

    it('adding a blank material does not call the handler', async () => {
      const user = userEvent.setup();
      const onDeliveryMaterialsChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'delivery', onDeliveryMaterialsChange })} />,
      );
      await user.type(screen.getByPlaceholderText(/add item and press enter/i), '   ');
      await user.click(screen.getByRole('button', { name: /^add/i }));
      expect(onDeliveryMaterialsChange).not.toHaveBeenCalled();
    });

    it('Enter adds the material, trimmed, and appends to the existing list', async () => {
      const user = userEvent.setup();
      const onDeliveryMaterialsChange = jest.fn();
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'delivery',
            deliveryMaterials: ['Oak'],
            onDeliveryMaterialsChange,
          })}
        />,
      );
      await user.type(screen.getByPlaceholderText(/add item and press enter/i), '  Pine  {Enter}');
      expect(onDeliveryMaterialsChange).toHaveBeenCalledWith(['Oak', 'Pine']);
    });

    it('other keys do not add a material', async () => {
      const user = userEvent.setup();
      const onDeliveryMaterialsChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'delivery', onDeliveryMaterialsChange })} />,
      );
      await user.type(screen.getByPlaceholderText(/add item and press enter/i), 'abc');
      expect(onDeliveryMaterialsChange).not.toHaveBeenCalled();
    });

    it('removing one of several materials keeps the rest; removing the last passes null', async () => {
      const user = userEvent.setup();
      const onDeliveryMaterialsChange = jest.fn();
      const { rerender } = render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'delivery',
            deliveryMaterials: ['Oak', 'Pine'],
            onDeliveryMaterialsChange,
          })}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Remove Oak' }));
      expect(onDeliveryMaterialsChange).toHaveBeenLastCalledWith(['Pine']);
      rerender(
        <LocaleProvider>
          <DiaryEntryForm
            {...makeProps({
              entryType: 'delivery',
              deliveryMaterials: ['Pine'],
              onDeliveryMaterialsChange,
            })}
          />
        </LocaleProvider>,
      );
      await user.click(screen.getByRole('button', { name: 'Remove Pine' }));
      expect(onDeliveryMaterialsChange).toHaveBeenLastCalledWith(null);
    });

    it('removing a material with no handler does nothing', async () => {
      const user = userEvent.setup();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'delivery', deliveryMaterials: ['Oak'] })} />,
      );
      await user.click(screen.getByRole('button', { name: 'Remove Oak' }));
      expect(screen.getByText('Oak')).toBeInTheDocument();
    });
  });

  describe('daily_log vendor picker and work time', () => {
    it('selecting a vendor reports its id, and clearing reports null', async () => {
      const user = userEvent.setup();
      const onDailyLogVendorIdChange = jest.fn();
      render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', onDailyLogVendorIdChange })} />,
      );
      await user.click(document.getElementById('daily-log-vendor')!);
      await user.click(await screen.findByRole('option', { name: 'Acme Concrete' }));
      expect(onDailyLogVendorIdChange).toHaveBeenCalledWith('v-1');
      expect(mockFetchVendors).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 50 }));

      await user.click(await screen.findByRole('button', { name: 'Clear selection' }));
      expect(onDailyLogVendorIdChange).toHaveBeenLastCalledWith(null);
    });

    it('selecting a vendor without a handler is a no-op', async () => {
      const user = userEvent.setup();
      render(<DiaryEntryForm {...makeProps({ entryType: 'daily_log' })} />);
      await user.click(document.getElementById('daily-log-vendor')!);
      await user.click(await screen.findByRole('option', { name: 'Acme Concrete' }));
      await waitFor(() => expect(mockFetchVendors).toHaveBeenCalled());
    });

    it('shows the stored vendor name for an existing selection', () => {
      render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'daily_log',
            dailyLogVendorId: 'v-1',
            dailyLogVendorName: 'Acme Concrete',
          })}
        />,
      );
      expect(screen.getByText('Acme Concrete')).toBeInTheDocument();
    });

    it('shows the cross-field work-time error with aria wiring on both time inputs', () => {
      const { container } = render(
        <DiaryEntryForm
          {...makeProps({
            entryType: 'daily_log',
            validationErrors: { dailyLogWorkTime: 'End before start' },
          })}
        />,
      );
      for (const id of ['work-start-time', 'work-end-time']) {
        expect(container.querySelector(`#${id}`)).toHaveAttribute(
          'aria-describedby',
          'work-time-error',
        );
      }
    });

    it('calls onFieldBlur when blurring the time, date, title and body inputs', () => {
      const onFieldBlur = jest.fn();
      const { container } = render(
        <DiaryEntryForm {...makeProps({ entryType: 'daily_log', onFieldBlur })} />,
      );
      for (const id of ['work-start-time', 'work-end-time', 'entry-date', 'title', 'body']) {
        fireEvent.blur(container.querySelector(`#${id}`)!);
      }
      expect(onFieldBlur).toHaveBeenCalledTimes(5);
    });
  });

  describe('signature sections per entry type', () => {
    const complete = {
      signerName: 'Alice',
      signerType: 'self' as const,
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signedAt: '2026-03-14T10:00:00.000Z',
    };
    const pending = { signerName: '', signerType: 'self' as const, signatureDataUrl: '' };
    const cases: Array<[string, string, string]> = [
      ['daily_log', 'dailyLogSignatures', 'onDailyLogSignaturesChange'],
      ['site_visit', 'siteVisitSignatures', 'onSiteVisitSignaturesChange'],
      ['issue', 'issueSignatures', 'onIssueSignaturesChange'],
    ];

    it.each(cases)(
      '%s: "+ Add Signature" appends a pending self signature named after the user',
      async (entryType, _p, handlerName) => {
        const handler = jest.fn();
        render(
          <DiaryEntryForm
            {...makeProps({
              entryType,
              currentUserName: 'Alice Builder',
              [handlerName]: handler,
            } as never)}
          />,
        );
        await userEvent.setup().click(screen.getByRole('button', { name: '+ Add Signature' }));
        expect(handler).toHaveBeenCalledWith([
          { signerName: 'Alice Builder', signerType: 'self', signatureDataUrl: '' },
        ]);
      },
    );

    it.each(cases)(
      '%s: adding with no current user name and existing signatures keeps them',
      async (entryType, propName, handlerName) => {
        const handler = jest.fn();
        render(
          <DiaryEntryForm
            {...makeProps({ entryType, [propName]: [complete], [handlerName]: handler } as never)}
          />,
        );
        await userEvent.setup().click(screen.getByRole('button', { name: '+ Add Signature' }));
        expect(handler).toHaveBeenCalledWith([
          complete,
          { signerName: '', signerType: 'self', signatureDataUrl: '' },
        ]);
      },
    );

    it.each(cases)('%s: adding without a handler is a no-op', async (entryType) => {
      render(<DiaryEntryForm {...makeProps({ entryType } as never)} />);
      await userEvent.setup().click(screen.getByRole('button', { name: '+ Add Signature' }));
      expect(screen.getByRole('button', { name: '+ Add Signature' })).toBeInTheDocument();
    });

    it.each(cases)(
      '%s: removing the only signature reports null',
      async (entryType, propName, handlerName) => {
        const handler = jest.fn();
        render(
          <DiaryEntryForm
            {...makeProps({ entryType, [propName]: [complete], [handlerName]: handler } as never)}
          />,
        );
        await userEvent.setup().click(screen.getByRole('button', { name: 'Remove Signature' }));
        expect(handler).toHaveBeenCalledWith(null);
      },
    );

    it.each(cases)(
      '%s: removing one of two signatures keeps the other',
      async (entryType, propName, handlerName) => {
        const handler = jest.fn();
        const second = { ...complete, signerName: 'Bob' };
        render(
          <DiaryEntryForm
            {...makeProps({
              entryType,
              [propName]: [complete, second],
              [handlerName]: handler,
            } as never)}
          />,
        );
        await userEvent
          .setup()
          .click(screen.getAllByRole('button', { name: 'Remove Signature' })[0]!);
        expect(handler).toHaveBeenCalledWith([second]);
      },
    );

    it.each(cases)('%s: removing without a handler is a no-op', async (entryType, propName) => {
      render(<DiaryEntryForm {...makeProps({ entryType, [propName]: [complete] } as never)} />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Remove Signature' }));
      expect(screen.getByAltText('Signature of Alice')).toBeInTheDocument();
    });

    it.each(cases)(
      '%s: a pending self signature is auto-named and reported as an updated array',
      (entryType, propName, handlerName) => {
        const handler = jest.fn();
        render(
          <DiaryEntryForm
            {...makeProps({
              entryType,
              currentUserName: 'Alice Builder',
              [propName]: [pending],
              [handlerName]: handler,
            } as never)}
          />,
        );
        expect(handler).toHaveBeenCalledWith([{ ...pending, signerName: 'Alice Builder' }]);
      },
    );

    it.each(cases)(
      '%s: auto-naming a pending signature without a handler is harmless',
      (entryType, propName) => {
        render(
          <DiaryEntryForm
            {...makeProps({
              entryType,
              currentUserName: 'Alice Builder',
              [propName]: [pending],
            } as never)}
          />,
        );
        expect(screen.getByLabelText('Signature canvas')).toBeInTheDocument();
      },
    );
  });

  describe('disabled and error wiring across entry types', () => {
    it.each([
      ['site_visit', { siteVisitInspectorName: 'inspector name is required' }, 'inspector-name'],
      ['site_visit', { siteVisitOutcome: 'outcome is required' }, 'inspection-outcome'],
      ['issue', { issueSeverity: 'sev' }, 'severity'],
      ['issue', { issueResolutionStatus: 'res' }, 'resolution-status'],
    ] as const)('%s: %j links the error to the control', (entryType, errors, id) => {
      const { container } = render(
        <DiaryEntryForm {...makeProps({ entryType, validationErrors: errors })} />,
      );
      const control = container.querySelector(`#${id}`)!;
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(control.getAttribute('aria-describedby')).toBeTruthy();
      expect(within(container).getByRole('alert')).toBeInTheDocument();
    });

    it.each(['daily_log', 'site_visit', 'delivery', 'issue'] as const)(
      '%s: every metadata control is disabled when the form is disabled',
      (entryType) => {
        const { container } = render(
          <DiaryEntryForm {...makeProps({ entryType, disabled: true })} />,
        );
        const controls = container.querySelectorAll(
          '.metadataSection input, .metadataSection select, .metadataSection button',
        );
        expect(controls.length).toBeGreaterThan(0);
        controls.forEach((c) => expect(c).toBeDisabled());
      },
    );
  });
});
