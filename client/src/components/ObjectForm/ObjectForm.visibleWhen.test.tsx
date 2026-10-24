/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { ObjectForm, OBJECT_FORM_MEDIA_QUERY } from './ObjectForm.js';
import type { ObjectFormResult, ObjectFormSchema, ObjectFormValues } from './types.js';

const RESULT: ObjectFormResult = { id: 'n1', href: '/things/n1', label: 'Thing' };

type SubmitFn = (values: ObjectFormValues) => Promise<ObjectFormResult>;

/** Fields: a "mode" select decides whether `price` (essential) and `extra` (More details) are shown. */
function makeSchema(over: Partial<ObjectFormSchema> = {}): ObjectFormSchema {
  return {
    id: 'thing',
    title: 'New thing',
    addAnother: true,
    initialValues: { mode: 'simple', price: '', extra: '', title: '' },
    fields: [
      {
        name: 'price',
        label: 'Price',
        kind: 'text',
        essential: true,
        required: true,
        visibleWhen: (values) => values.mode === 'priced',
      },
      { name: 'title', label: 'Title', kind: 'text', essential: true },
      {
        name: 'mode',
        label: 'Mode',
        kind: 'select',
        essential: true,
        keep: true,
        options: [
          { value: 'simple', label: 'Simple' },
          { value: 'priced', label: 'Priced' },
        ],
      },
      {
        name: 'extra',
        label: 'Extra',
        kind: 'text',
        keep: true,
        visibleWhen: (values) => values.mode === 'priced',
      },
      {
        name: 'echo',
        label: 'Echo',
        kind: 'custom',
        render: (ctx) => <output data-testid="echo">{String(ctx.values.mode)}</output>,
      },
    ],
    validate: (values) => {
      const errors: Record<string, string> = {};
      // The schema reports price even while hidden; the form must ignore it.
      if (!String(values.price ?? '').trim()) errors.price = 'Price is required';
      return errors;
    },
    submit: () => Promise.resolve(RESULT),
    ...over,
  };
}

function setup(schema: ObjectFormSchema, prefill?: ObjectFormValues) {
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();
  render(
    <MemoryRouter>
      <ObjectForm schema={schema} prefill={prefill} onCreated={onCreated} onCancel={() => {}} />
    </MemoryRouter>,
  );
  return { onCreated };
}

let media: MatchMediaControl;
beforeEach(() => {
  media = installMatchMedia({ [OBJECT_FORM_MEDIA_QUERY]: true });
});
afterEach(() => {
  media.restore();
  delete document.documentElement.dataset.scrollLocked;
});

describe('ObjectForm visibleWhen', () => {
  it('does not render a hidden field and reveals it when the values change', async () => {
    const user = userEvent.setup();
    setup(makeSchema());
    expect(screen.queryByLabelText(/^Price/)).toBeNull();
    await user.selectOptions(screen.getByLabelText('Mode'), 'priced');
    expect(screen.getByLabelText(/^Price/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Mode'), 'simple');
    expect(screen.queryByLabelText(/^Price/)).toBeNull();
  });

  it('focuses the first visible field, skipping a hidden required one', async () => {
    setup(makeSchema());
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
  });

  it('ignores validation errors on hidden fields and saves', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockResolvedValue(RESULT);
    const { onCreated } = setup(makeSchema({ submit }));
    await user.click(screen.getByTestId('object-form-save'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(RESULT));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('reports and focuses the error of a field once it is visible', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockResolvedValue(RESULT);
    setup(makeSchema({ submit }));
    await user.selectOptions(screen.getByLabelText('Mode'), 'priced');
    await user.click(screen.getByTestId('object-form-save'));
    expect(await screen.findByText('Price is required')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText(/^Price/)).toHaveFocus());
  });

  it('expands More details for the error of a visible More field only', async () => {
    const user = userEvent.setup();
    const schema = makeSchema({
      validate: (values) => (values.mode === 'priced' ? { extra: 'Extra is wrong' } : {}),
    });
    setup(schema);
    await user.selectOptions(screen.getByLabelText('Mode'), 'priced');
    await user.click(screen.getByTestId('object-form-save'));
    expect(await screen.findByText('Extra is wrong')).toBeInTheDocument();
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
  });

  it('auto-expands More details for a prefilled More field only when it is visible', () => {
    setup(makeSchema(), { extra: 'prefilled' });
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'false');
  });

  it('auto-expands More details for a prefilled visible More field', () => {
    setup(makeSchema(), { mode: 'priced', extra: 'prefilled' });
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows no More details toggle when every More field is hidden', () => {
    setup(
      makeSchema({
        fields: [
          { name: 'title', label: 'Title', kind: 'text', essential: true },
          { name: 'extra', label: 'Extra', kind: 'text', visibleWhen: () => false },
        ],
      }),
    );
    expect(screen.queryByTestId('object-form-more')).toBeNull();
  });

  it('keeps More details open after Add another while a kept visible More field has a value', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockResolvedValue(RESULT);
    setup(makeSchema({ submit }));
    await user.selectOptions(screen.getByLabelText('Mode'), 'priced');
    await user.type(screen.getByLabelText(/^Price/), '5');
    await user.click(screen.getByTestId('object-form-more'));
    await user.type(screen.getByLabelText('Extra'), 'kept');
    await user.click(screen.getByTestId('object-form-add-another'));
    await user.click(screen.getByTestId('object-form-save'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    // mode and extra are kept, so More details stays open.
    await waitFor(() => expect(screen.getByLabelText('Extra')).toHaveValue('kept'));
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
  });

  it('focuses a mapped server error on a visible field and ignores a hidden mapped field', async () => {
    const user = userEvent.setup();
    const conflict = new ApiClientError(409, { code: 'CONFLICT', message: 'x' });
    const submit = jest.fn<SubmitFn>().mockRejectedValue(conflict);
    setup(
      makeSchema({ submit, mapError: () => ({ price: 'Hidden clash', title: 'Title clash' }) }),
    );
    await user.click(screen.getByTestId('object-form-save'));
    expect(await screen.findByText('Title clash')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
  });

  it('maps VALIDATION_ERROR field paths to the visible fields', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockRejectedValue(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'm',
        details: { fields: [{ path: '/price' }, { path: '/title' }] },
      }),
    );
    setup(makeSchema({ submit }));
    await user.click(screen.getByTestId('object-form-save'));
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
  });

  it('moves no focus when a validation error maps only to hidden fields', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockRejectedValue(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'm',
        details: { fields: [{ path: '/price' }] },
      }),
    );
    setup(makeSchema({ submit }));
    await user.click(screen.getByTestId('object-form-save'));
    await waitFor(() => expect(screen.getByTestId('object-form-save')).toHaveTextContent('Save'));
    expect(screen.queryByLabelText(/^Price/)).toBeNull();
    expect(screen.getByLabelText('Title')).not.toHaveFocus();
  });

  it('opens without a focus target when every field is hidden', () => {
    setup(
      makeSchema({
        fields: [
          {
            name: 'title',
            label: 'Title',
            kind: 'text',
            essential: true,
            visibleWhen: () => false,
          },
        ],
      }),
    );
    expect(screen.getByRole('dialog', { name: 'New thing' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('expands More details when a validation error maps to a visible More field', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockRejectedValue(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'm',
        details: { fields: [{ path: '/extra' }] },
      }),
    );
    setup(makeSchema({ submit }), { mode: 'priced', price: '3' });
    await user.click(screen.getByTestId('object-form-save'));
    await waitFor(() =>
      expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true'),
    );
  });
});

describe('ObjectForm render context values', () => {
  it('gives custom fields the current values of the step', async () => {
    const user = userEvent.setup();
    setup(makeSchema());
    expect(screen.getByTestId('echo')).toHaveTextContent('simple');
    await user.selectOptions(screen.getByLabelText('Mode'), 'priced');
    expect(screen.getByTestId('echo')).toHaveTextContent('priced');
  });
});
