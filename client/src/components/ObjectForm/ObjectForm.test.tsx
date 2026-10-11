/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { ObjectForm, OBJECT_FORM_MEDIA_QUERY } from './ObjectForm.js';
import type { ObjectFormProps } from './ObjectForm.js';
import type {
  ObjectFormField,
  ObjectFormResult,
  ObjectFormSchema,
  ObjectFormValues,
} from './types.js';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

const RESULT: ObjectFormResult = { id: 'n1', href: '/things/n1', label: 'Thing' };

type SubmitFn = (values: ObjectFormValues) => Promise<ObjectFormResult>;

function makeSchema(
  over: Partial<ObjectFormSchema> = {},
  fields?: readonly ObjectFormField[],
): ObjectFormSchema {
  return {
    id: 'thing',
    title: 'New thing',
    addAnother: false,
    initialValues: { title: '', kind: '', notes: '', due: '' },
    fields: fields ?? [
      { name: 'title', label: 'Title', kind: 'text', essential: true, required: true },
      {
        name: 'kind',
        label: 'Kind',
        kind: 'select',
        essential: true,
        keep: true,
        options: [
          { value: '', label: 'None' },
          { value: 'a', label: 'Kind A' },
          { value: 'b', label: 'Kind B' },
        ],
      },
      { name: 'notes', label: 'Notes', kind: 'textarea' },
      { name: 'due', label: 'Due', kind: 'date', required: true },
    ],
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!String(values.title ?? '').trim()) errors.title = 'Title is required';
      if (
        !String(values.due ?? '').trim() &&
        values.due !== undefined &&
        values.title === 'needs-due'
      )
        errors.due = 'Due is required';
      return errors;
    },
    submit: () => Promise.resolve(RESULT),
    addedMessage: (r) => `Thing '${r.label}' added.`,
    ...over,
  };
}

interface Handlers {
  onCreated: jest.Mock<(r: ObjectFormResult) => void>;
  onCancel: jest.Mock<() => void>;
  onDirtyChange: jest.Mock<(d: boolean) => void>;
  onLeaveResolved: jest.Mock<(d: boolean) => void>;
}

function setup(
  props: Partial<ObjectFormProps> & { schema?: ObjectFormSchema } = {},
  wrap: (node: ReactNode) => ReactNode = (n) => n,
) {
  const handlers: Handlers = {
    onCreated: jest.fn<(r: ObjectFormResult) => void>(),
    onCancel: jest.fn<() => void>(),
    onDirtyChange: jest.fn<(d: boolean) => void>(),
    onLeaveResolved: jest.fn<(d: boolean) => void>(),
  };
  const ui = (p: Partial<ObjectFormProps>) =>
    wrap(
      <MemoryRouter>
        <ObjectForm
          schema={makeSchema()}
          onCreated={handlers.onCreated}
          onCancel={handlers.onCancel}
          onDirtyChange={handlers.onDirtyChange}
          onLeaveResolved={handlers.onLeaveResolved}
          {...props}
          {...p}
        />
      </MemoryRouter>,
    );
  const utils = render(ui({}) as never);
  return {
    ...handlers,
    ...utils,
    rerenderWith: (p: Partial<ObjectFormProps>) => utils.rerender(ui(p) as never),
  };
}

let media: MatchMediaControl;

beforeEach(() => {
  media = installMatchMedia({ [OBJECT_FORM_MEDIA_QUERY]: true });
});

afterEach(() => {
  media.restore();
  delete document.documentElement.dataset.scrollLocked;
});

const title = () => screen.getByLabelText(/^Title/) as HTMLInputElement;
const save = () => screen.getByTestId('object-form-save');
const cancel = () => screen.getByTestId('object-form-cancel');

describe('ObjectForm layout', () => {
  it('renders essentials first and keeps More details collapsed', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'New thing' })).toBeInTheDocument();
    const more = screen.getByTestId('object-form-more');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveTextContent('More details');
    const hidden = document.getElementById(more.getAttribute('aria-controls')!)!;
    expect(hidden).toHaveAttribute('hidden');
    expect(within(hidden).getByLabelText(/Notes/)).toBeInTheDocument();
    // essential fields are not inside the disclosure
    expect(hidden.contains(title())).toBe(false);
  });

  it('shows Cancel before Save in the footer', () => {
    setup();
    expect(
      cancel().compareDocumentPosition(save()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(cancel()).toHaveTextContent('Cancel');
    expect(save()).toHaveTextContent('Save');
  });

  it('expands More details when the user opens it and collapses it again', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('object-form-more'));
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('object-form-more')).toHaveTextContent('Fewer details');
    await user.click(screen.getByTestId('object-form-more'));
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'false');
  });

  it('auto-expands for a pre-filled non-essential field', () => {
    setup({ prefill: { notes: 'prefilled' } });
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
  });

  it('auto-expands when a hidden field is changed programmatically through the schema', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('object-form-more'));
    await user.type(screen.getByLabelText(/Notes/), 'x');
    await user.click(screen.getByTestId('object-form-more'));
    await user.click(screen.getByTestId('object-form-more'));
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows no disclosure when all fields are essential', () => {
    setup({
      schema: makeSchema({}, [
        { name: 'title', label: 'Title', kind: 'text', essential: true, required: true },
      ]),
    });
    expect(screen.queryByTestId('object-form-more')).toBeNull();
  });

  it('uses the full-screen sheet below 768px and keeps the same fields', () => {
    media.set(OBJECT_FORM_MEDIA_QUERY, false);
    setup();
    expect(screen.getByTestId('object-form-sheet').className).toContain('panelFullScreen');
    expect(screen.getByRole('dialog', { name: 'New thing' })).toBe(
      screen.getByTestId('object-form-sheet'),
    );
    expect(title()).toBeInTheDocument();
  });

  it('sets the document title to the form title', () => {
    setup();
    expect(document.title).toContain('New thing');
  });
});

describe('required markers and aria wiring', () => {
  it('marks required fields with "(required)" and aria-required only', () => {
    setup();
    expect(screen.getAllByText('(required)')).toHaveLength(2);
    expect(within(title().closest('div')!).getByText('(required)')).toBeInTheDocument();
    expect(title()).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Kind/)).not.toHaveAttribute('aria-required');
    expect(screen.getByLabelText(/Kind/).closest('div')?.textContent).not.toContain('(required)');
  });
});

describe('validation on save', () => {
  it('shows field errors with aria wiring, focuses the first invalid field and shows no banner', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>();
    setup({ schema: makeSchema({ submit }) });
    await user.click(save());
    expect(submit).not.toHaveBeenCalled();
    expect(title()).toHaveAttribute('aria-invalid', 'true');
    expect(title()).toHaveFocus();
    const describedBy = title().getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)).toHaveTextContent('Title is required');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(save()).not.toBeDisabled();
  });

  it('expands More details and focuses the first invalid field inside it', async () => {
    const user = userEvent.setup();
    const schema = makeSchema({
      validate: (v) => (!String(v.notes ?? '') ? { notes: 'Notes are required' } : {}),
      initialValues: { title: 'x', kind: '', notes: '', due: '' },
    });
    setup({ schema });
    await user.click(save());
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/Notes/)).toHaveFocus();
  });

  it('shows no error on change, only after save; clears a fixed error per field', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(title(), 'a');
    await user.clear(title());
    expect(screen.queryByText('Title is required')).toBeNull();
    await user.click(save());
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    await user.type(title(), 'ab');
    expect(screen.queryByText('Title is required')).toBeNull();
    expect(title()).not.toHaveAttribute('aria-invalid');
  });

  it('keeps other fields errors when one is fixed', async () => {
    const user = userEvent.setup();
    const schema = makeSchema({
      validate: (v) => ({
        ...(!String(v.title ?? '') ? { title: 'Title is required' } : {}),
        ...(!String(v.notes ?? '') ? { notes: 'Notes are required' } : {}),
      }),
    });
    setup({ schema });
    await user.click(save());
    await user.type(title(), 'ok');
    expect(screen.queryByText('Title is required')).toBeNull();
    expect(screen.getByText('Notes are required')).toBeInTheDocument();
  });
});

describe('saving', () => {
  it('submits trimmed validation-passing values and reports the result', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockResolvedValue(RESULT);
    const { onCreated } = setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.selectOptions(screen.getByLabelText(/Kind/), 'b');
    await user.click(save());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(RESULT));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hello', kind: 'b' }));
  });

  it('notifies listeners that an object of its kind was created', async () => {
    const user = userEvent.setup();
    const seen = jest.fn();
    function Listener() {
      useOnObjectCreated('thing', seen);
      return null;
    }
    setup({}, (n) => (
      <>
        <Listener />
        {n}
      </>
    ));
    await user.type(title(), 'Hello');
    await user.click(save());
    await waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
  });

  it('is busy while saving: label, aria-disabled buttons, read-only inputs, no close, one submit', async () => {
    const user = userEvent.setup();
    let resolve!: (r: ObjectFormResult) => void;
    const submit = jest.fn<SubmitFn>(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { onCancel, onCreated } = setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.click(save());

    expect(save()).toHaveTextContent('Saving…');
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    expect(cancel()).toHaveAttribute('aria-disabled', 'true');
    expect(title()).toHaveAttribute('readonly');
    fireEvent.click(cancel());
    expect(screen.queryByTestId('object-form-discard-confirm')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('object-form-discard-confirm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByTestId('object-form-discard-confirm')).toBeNull();
    await user.click(save());
    fireEvent.submit(screen.getByTestId('object-form'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByTestId('object-form-discard-confirm')).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(RESULT);
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('a select ignores changes while busy', async () => {
    const user = userEvent.setup();
    let resolve!: (r: ObjectFormResult) => void;
    const submit = jest.fn<SubmitFn>(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.click(save());
    const select = screen.getByLabelText(/Kind/) as HTMLSelectElement;
    expect(select).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(select, { target: { value: 'a' } });
    expect(select.value).toBe('');
    await act(async () => {
      resolve(RESULT);
    });
  });
});

describe('server errors (never render server text)', () => {
  it('maps a 400 field path to the field with our own text and hides the server message', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockRejectedValue(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'server text',
        details: { fields: [{ path: '/title', message: 'server text' }] },
      }),
    );
    setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.click(save());
    await waitFor(() => expect(screen.getByText('Check this value.')).toBeInTheDocument());
    expect(document.body.textContent).not.toContain('server text');
    expect(title()).toHaveAttribute('aria-invalid', 'true');
    expect(title()).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(save()).toHaveTextContent('Save');
  });

  it('expands More details for a server error on a hidden field', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockRejectedValue(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'm',
        details: { fields: [{ path: '/notes' }] },
      }),
    );
    setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.click(save());
    await waitFor(() => expect(screen.getByLabelText(/Notes/)).toHaveFocus());
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a banner too for unmapped validation paths', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockRejectedValue(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'server text',
        details: { fields: [{ path: '/zzz' }] },
      }),
    );
    setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The submitted data is invalid. Please check your input.',
    );
  });

  it('shows the translated code in a banner for a 409', async () => {
    const user = userEvent.setup();
    const submit = jest
      .fn<SubmitFn>()
      .mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'server text' }));
    setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A conflict occurred. The resource may already exist.',
    );
    expect(document.body.textContent).not.toContain('server text');
  });

  it('shows saveFailed for a network error and lets the user retry', async () => {
    const user = userEvent.setup();
    const submit = jest
      .fn<SubmitFn>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(RESULT);
    const { onCreated } = setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save. Check your connection and try again.",
    );
    await user.click(save());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('dirty tracking and the discard confirm', () => {
  it('a pre-filled form is not dirty and Escape closes it at once', async () => {
    const user = userEvent.setup();
    const { onCancel, onDirtyChange } = setup({ prefill: { title: 'pre' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('object-form-discard-confirm')).toBeNull();
  });

  it('after one change Escape, Cancel and Close open the confirm instead of closing', async () => {
    const user = userEvent.setup();
    const { onCancel, onDirtyChange } = setup();
    await user.type(title(), 'x');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Discard changes?');
    await user.click(screen.getByTestId('object-form-discard-cancel'));

    await user.click(cancel());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('object-form-discard-cancel'));

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Keep editing returns focus to what held it when the confirm opened (the field, via Escape)', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(title(), 'x');
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('object-form-discard-cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(title()).toHaveFocus();
    expect(title().value).toBe('x');
  });

  it('Keep editing after Cancel returns focus to Cancel', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(title(), 'x');
    await user.click(cancel());
    await user.click(screen.getByTestId('object-form-discard-cancel'));
    expect(cancel()).toHaveFocus();
  });

  it('Discard calls onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.type(title(), 'x');
    await user.click(cancel());
    await user.click(screen.getByTestId('object-form-discard-confirm'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('reports not dirty on unmount', async () => {
    const user = userEvent.setup();
    const { onDirtyChange, unmount } = setup();
    await user.type(title(), 'x');
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('a select change makes the form dirty', async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.selectOptions(screen.getByLabelText(/Kind/), 'a');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});

describe('leaveRequested (browser Back out of a dirty form)', () => {
  it('opens the confirm; Keep editing reports false, Discard reports true', async () => {
    const user = userEvent.setup();
    const { onLeaveResolved, onCancel, rerenderWith } = setup({ leaveRequested: false });
    rerenderWith({ leaveRequested: true });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('object-form-discard-cancel'));
    expect(onLeaveResolved).toHaveBeenLastCalledWith(false);

    rerenderWith({ leaveRequested: true });
    await user.click(screen.getByTestId('object-form-discard-confirm'));
    expect(onLeaveResolved).toHaveBeenLastCalledWith(true);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('Add another', () => {
  const addSchema = (submit?: SubmitFn) =>
    makeSchema({
      addAnother: true,
      initialValues: { title: '', kind: '', notes: '', due: '' },
      ...(submit ? { submit } : {}),
    });

  it('offers the checkbox only when the schema supports it', () => {
    setup();
    expect(screen.queryByTestId('object-form-add-another')).toBeNull();
  });

  it('resets, keeps "keep" fields, stays clean, focuses the first field and announces the add', async () => {
    const user = userEvent.setup();
    const created = jest.fn();
    function Listener() {
      useOnObjectCreated('thing', created);
      return null;
    }
    const { onCreated, onDirtyChange } = setup({ schema: addSchema() }, (n) => (
      <>
        <Listener />
        {n}
      </>
    ));
    await user.click(screen.getByTestId('object-form-add-another'));
    await user.type(title(), 'First');
    await user.selectOptions(screen.getByLabelText(/Kind/), 'b');
    await user.click(save());

    await waitFor(() =>
      expect(screen.getByTestId('object-form-added')).toHaveTextContent("Thing 'Thing' added."),
    );
    expect(screen.getByTestId('object-form-added')).toHaveAttribute('role', 'status');
    expect(onCreated).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledTimes(1);
    expect(title().value).toBe('');
    expect((screen.getByLabelText(/Kind/) as HTMLSelectElement).value).toBe('b');
    expect(title()).toHaveFocus();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId('object-form-add-another')).toBeChecked();

    // the confirmation clears on the next change
    await user.type(title(), 'S');
    expect(screen.getByTestId('object-form-added')).toBeEmptyDOMElement();
  });

  it('closes through onCreated when Add another is off', async () => {
    const user = userEvent.setup();
    const { onCreated } = setup({ schema: addSchema() });
    await user.type(title(), 'First');
    await user.click(save());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('collapses More details again when the reset leaves it empty', async () => {
    const user = userEvent.setup();
    setup({ schema: addSchema() });
    await user.click(screen.getByTestId('object-form-add-another'));
    await user.click(screen.getByTestId('object-form-more'));
    await user.type(screen.getByLabelText(/Notes/), 'n');
    await user.type(title(), 'First');
    await user.click(save());
    await waitFor(() => expect(screen.getByTestId('object-form-added')).not.toBeEmptyDOMElement());
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows no confirmation text when the schema has no addedMessage', async () => {
    const user = userEvent.setup();
    setup({ schema: { ...addSchema(), addedMessage: undefined } });
    await user.click(screen.getByTestId('object-form-add-another'));
    await user.type(title(), 'First');
    await user.click(save());
    await waitFor(() => expect(title().value).toBe(''));
    expect(screen.getByTestId('object-form-added')).toBeEmptyDOMElement();
  });
});

describe('child step (create from a picker)', () => {
  const childSchema = makeSchema(
    {
      id: 'child',
      title: 'New helper',
      initialValues: { name: '' },
      validate: (v) => (String(v.name ?? '') ? {} : { name: 'Name is required' }),
      submit: () => Promise.resolve({ id: 'c1', href: '/c/c1', label: 'Helper One' }),
    },
    [{ name: 'name', label: 'Name', kind: 'text', essential: true, required: true }],
  );

  function parentSchema(onChildCreated?: (r: ObjectFormResult) => void): ObjectFormSchema {
    return makeSchema({}, [
      { name: 'title', label: 'Title', kind: 'text', essential: true, required: true },
      {
        name: 'helper',
        label: 'Helper',
        kind: 'custom',
        essential: true,
        render: (ctx) => (
          <div>
            <output data-testid="helper-value">{String(ctx.value ?? '')}</output>
            <button
              id={ctx.id}
              type="button"
              data-testid="create-helper"
              onClick={() =>
                ctx.createChild({
                  schema: childSchema,
                  onCreated: (r) => {
                    ctx.setValue(r.id);
                    onChildCreated?.(r);
                  },
                })
              }
            >
              Create helper
            </button>
          </div>
        ),
      },
    ]);
  }

  it('shows the child title and a back link; the parent values stay in memory', async () => {
    const user = userEvent.setup();
    setup({ schema: parentSchema() });
    await user.type(title(), 'Parent title');
    await user.click(screen.getByTestId('create-helper'));

    expect(screen.getByRole('heading', { name: 'New helper' })).toBeInTheDocument();
    expect(screen.getByTestId('object-form-back')).toHaveTextContent('Back to New thing');
    expect(screen.queryByLabelText(/^Title/)).toBeNull();
    expect(screen.getByLabelText(/^Name/)).toHaveFocus();
    expect(screen.queryByTestId('object-form-add-another')).toBeNull();
  });

  it('child Save pops, calls onCreated, sets the field and focuses the parent field', async () => {
    const user = userEvent.setup();
    const onChildCreated = jest.fn();
    const { onCreated } = setup({ schema: parentSchema(onChildCreated) });
    await user.type(title(), 'Parent title');
    await user.click(screen.getByTestId('create-helper'));
    await user.type(screen.getByLabelText(/^Name/), 'H');
    await user.click(save());

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New thing' })).toBeInTheDocument(),
    );
    expect(onChildCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    expect(screen.getByTestId('helper-value')).toHaveTextContent('c1');
    expect(title().value).toBe('Parent title');
    expect(screen.getByTestId('create-helper')).toHaveFocus();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('child validation errors stay on the child step', async () => {
    const user = userEvent.setup();
    setup({ schema: parentSchema() });
    await user.click(screen.getByTestId('create-helper'));
    await user.click(save());
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New helper' })).toBeInTheDocument();
  });

  it('child Cancel pops without a confirm when the child is clean', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup({ schema: parentSchema() });
    await user.click(screen.getByTestId('create-helper'));
    await user.click(cancel());
    expect(screen.getByRole('heading', { name: 'New thing' })).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-helper')).toHaveFocus();
  });

  it('the back link pops too', async () => {
    const user = userEvent.setup();
    setup({ schema: parentSchema() });
    await user.click(screen.getByTestId('create-helper'));
    await user.click(screen.getByTestId('object-form-back'));
    expect(screen.getByRole('heading', { name: 'New thing' })).toBeInTheDocument();
  });

  it('a dirty child asks to discard; Discard pops, the parent stays open and keeps its values', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup({ schema: parentSchema() });
    await user.type(title(), 'Parent title');
    await user.click(screen.getByTestId('create-helper'));
    await user.type(screen.getByLabelText(/^Name/), 'H');
    await user.click(cancel());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('object-form-discard-confirm'));
    expect(screen.getByRole('heading', { name: 'New thing' })).toBeInTheDocument();
    expect(title().value).toBe('Parent title');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a dirty child with Keep editing stays on the child', async () => {
    const user = userEvent.setup();
    setup({ schema: parentSchema() });
    await user.click(screen.getByTestId('create-helper'));
    await user.type(screen.getByLabelText(/^Name/), 'H');
    await user.click(cancel());
    await user.click(screen.getByTestId('object-form-discard-cancel'));
    expect(screen.getByRole('heading', { name: 'New helper' })).toBeInTheDocument();
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('H');
  });
});

describe('container switch at 768px', () => {
  it('keeps the input and returns focus to the same field', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(title(), 'Hello');
    expect(title()).toHaveFocus();

    media.set(OBJECT_FORM_MEDIA_QUERY, false);

    expect(screen.getByTestId('object-form-sheet')).toBeInTheDocument();
    expect(title().value).toBe('Hello');
    await waitFor(() => expect(title()).toHaveFocus());

    media.set(OBJECT_FORM_MEDIA_QUERY, true);
    expect(screen.queryByTestId('object-form-sheet')).toBeNull();
    expect(title().value).toBe('Hello');
    await waitFor(() => expect(title()).toHaveFocus());
  });

  it('returns focus to a later field (not just the first) after the switch', async () => {
    const user = userEvent.setup();
    setup();
    screen.getByLabelText(/Kind/).focus();
    expect(screen.getByLabelText(/Kind/)).toHaveFocus();
    await user.type(title(), 'a');
    screen.getByLabelText(/Kind/).focus();

    media.set(OBJECT_FORM_MEDIA_QUERY, false);

    await waitFor(() => expect(screen.getByLabelText(/Kind/)).toHaveFocus());
  });

  it('keeps errors and the expanded disclosure across the switch', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(save());
    await user.click(screen.getByTestId('object-form-more'));
    media.set(OBJECT_FORM_MEDIA_QUERY, false);
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('keyboard', () => {
  it('Ctrl+Enter and Cmd+Enter submit', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockResolvedValue(RESULT);
    setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  });

  it('Cmd+Enter submits', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockResolvedValue(RESULT);
    setup({ schema: makeSchema({ submit }) });
    await user.type(title(), 'Hello');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  });

  it('Enter in a textarea does not submit', async () => {
    const user = userEvent.setup();
    const submit = jest.fn<SubmitFn>().mockResolvedValue(RESULT);
    setup({ schema: makeSchema({ submit }), prefill: { title: 'x', notes: 'n' } });
    const notes = screen.getByLabelText(/Notes/) as HTMLTextAreaElement;
    await user.click(notes);
    await user.keyboard('{Enter}');
    expect(submit).not.toHaveBeenCalled();
    expect(notes.value).toBe('n\n');
  });

  it('advertises the shortcut on Save', () => {
    setup();
    expect(save()).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
  });
});

describe('options that arrive after mount', () => {
  const withKind = (options: { value: string; label: string }[], extra = {}) =>
    makeSchema({ initialValues: { title: '', kind: '' } }, [
      { name: 'title', label: 'Title', kind: 'text', essential: true, required: true },
      { name: 'kind', label: 'Kind', kind: 'select', essential: true, options, ...extra },
    ]);

  it('clears an unknown pre-filled id once the options load and stays clean', () => {
    const { rerenderWith, onDirtyChange } = setup({
      schema: withKind([], { optionsLoading: true }),
      prefill: { kind: 'gone' },
    });
    expect(screen.queryByLabelText(/Kind/)).toBeNull();
    rerenderWith({
      schema: withKind([
        { value: '', label: 'None' },
        { value: 'a', label: 'A' },
      ]),
      prefill: { kind: 'gone' },
    });
    expect((screen.getByLabelText(/Kind/) as HTMLSelectElement).value).toBe('');
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it('keeps a known pre-filled id', () => {
    setup({
      schema: withKind([
        { value: '', label: 'None' },
        { value: 'a', label: 'A' },
      ]),
      prefill: { kind: 'a' },
    });
    expect((screen.getByLabelText(/Kind/) as HTMLSelectElement).value).toBe('a');
  });

  it('applies defaultFromOptions first without making the form dirty', () => {
    const { onDirtyChange } = setup({
      schema: withKind(
        [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        { defaultFromOptions: 'first' },
      ),
    });
    expect((screen.getByLabelText(/Kind/) as HTMLSelectElement).value).toBe('a');
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it('shows a Skeleton instead of the control while options load', () => {
    setup({ schema: withKind([], { optionsLoading: true }) });
    expect(screen.queryByLabelText(/Kind/)).toBeNull();
  });
});

describe('initial focus', () => {
  it('focuses the first empty required field, never the close button', () => {
    setup();
    expect(title()).toHaveFocus();
  });

  it('focuses the first field when every required field is already filled', () => {
    setup({ prefill: { title: 'x' } });
    expect(title()).toHaveFocus();
  });

  it('focuses the empty required field after the filled ones', () => {
    const schema = makeSchema({ initialValues: { a: '', b: '' } }, [
      { name: 'a', label: 'Alpha', kind: 'text', essential: true },
      { name: 'b', label: 'Beta', kind: 'text', essential: true, required: true },
    ]);
    setup({ schema });
    expect(screen.getByLabelText(/Beta/)).toHaveFocus();
  });
});

describe('document title overlay (#2212)', () => {
  function LatePage() {
    useDocumentTitle('Tasks');
    return null;
  }

  it('keeps the dialog title when the page behind mounts late', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ObjectForm schema={makeSchema()} onCreated={() => {}} onCancel={() => {}} />
      </MemoryRouter>,
    );
    expect(document.title).toContain('New thing');
    rerender(
      <MemoryRouter>
        <ObjectForm schema={makeSchema()} onCreated={() => {}} onCancel={() => {}} />
        <LatePage />
      </MemoryRouter>,
    );
    expect(document.title).toContain('New thing');
    expect(document.title).not.toMatch(/^Tasks/);
  });
});

describe('discard confirm focus target (#2212)', () => {
  function outsideButton(id: string) {
    const button = document.createElement('button');
    button.id = id;
    button.textContent = id;
    document.body.appendChild(button);
    return button;
  }

  afterEach(() => {
    document.getElementById('opener-btn')?.remove();
    document.getElementById('trigger-btn')?.remove();
  });

  it('returns to the element focused when the dialog opened, while it is connected', async () => {
    const user = userEvent.setup();
    const opener = outsideButton('opener-btn');
    opener.focus();
    setup();
    await user.type(title(), 'x');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('object-form-discard-confirm'));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("falls back to the host's New trigger when the opener is disconnected", async () => {
    const user = userEvent.setup();
    const opener = outsideButton('opener-btn');
    const trigger = outsideButton('trigger-btn');
    opener.focus();
    const returnFocusRef = { current: trigger };
    setup({ returnFocusRef });
    await user.type(title(), 'x');
    await user.keyboard('{Escape}');
    opener.remove();
    await user.click(screen.getByTestId('object-form-discard-confirm'));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('with nothing focused at open, uses the host fallback', async () => {
    const user = userEvent.setup();
    const trigger = outsideButton('trigger-btn');
    (document.activeElement as HTMLElement | null)?.blur();
    setup({ returnFocusRef: { current: trigger } });
    await user.type(title(), 'x');
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('object-form-discard-confirm'));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
