/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { ObjectForm, OBJECT_FORM_MEDIA_QUERY } from './ObjectForm.js';
import type { ObjectFormResult, ObjectFormSchema, ObjectFormValues } from './types.js';

const RESULT: ObjectFormResult = { id: 'n1', href: '/things/n1', label: 'Thing' };

let media: MatchMediaControl;
beforeEach(() => {
  media = installMatchMedia({ [OBJECT_FORM_MEDIA_QUERY]: true });
});
afterEach(() => {
  media.restore();
  delete document.documentElement.dataset.scrollLocked;
});

function makeSchema(over: Partial<ObjectFormSchema> = {}): ObjectFormSchema {
  return {
    id: 'thing',
    title: 'New thing',
    addAnother: false,
    initialValues: { title: '', due: '', notes: '' },
    fields: [
      { name: 'title', label: 'Title', kind: 'text', essential: true, required: true },
      { name: 'due', label: 'Due', kind: 'date', essential: true, required: true },
      {
        name: 'filler',
        label: 'Filler',
        kind: 'custom',
        essential: true,
        render: (ctx) => (
          <div>
            <button
              id={ctx.id}
              type="button"
              data-testid="fill-title-notes"
              onClick={() =>
                ctx.setValues({ title: 'Filled', notes: 'From a document' }, 'Filled.')
              }
            >
              fill
            </button>
            <button
              type="button"
              data-testid="fill-no-announcement"
              onClick={() => ctx.setValues({ due: '2026-05-05' })}
            >
              fill quietly
            </button>
          </div>
        ),
      },
      { name: 'notes', label: 'Notes', kind: 'textarea' },
    ],
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!String(values.title ?? '').trim()) errors.title = 'Title is required';
      if (!String(values.due ?? '').trim()) errors.due = 'Due is required';
      return errors;
    },
    submit: () => Promise.resolve(RESULT),
    ...over,
  };
}

function setup(schema: ObjectFormSchema = makeSchema()) {
  const onCreated = jest.fn();
  render(
    <MemoryRouter>
      <ObjectForm schema={schema} onCreated={onCreated} onCancel={jest.fn()} />
    </MemoryRouter>,
  );
  return { onCreated };
}

const title = () => screen.getByLabelText(/^Title/) as HTMLInputElement;

describe('ObjectForm ctx.setValues', () => {
  it('merges the values, expands More details for a More field and announces the text', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByTestId('fill-title-notes'));

    expect(title()).toHaveValue('Filled');
    expect(screen.getByLabelText('Notes')).toHaveValue('From a document');
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('object-form-added')).toHaveTextContent('Filled.');
  });

  it('keeps the other values and clears the status text when no announcement is sent', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('fill-title-notes'));
    await user.click(screen.getByTestId('fill-no-announcement'));

    expect(title()).toHaveValue('Filled');
    expect(screen.getByLabelText(/^Due/)).toHaveValue('2026-05-05');
    expect(screen.getByTestId('object-form-added')).toBeEmptyDOMElement();
  });

  it('does not expand More details when only essential fields are set', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('fill-no-announcement'));
    expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'false');
  });

  it('clears the errors of the sent keys only', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('object-form-save'));
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Due is required')).toBeInTheDocument();

    await user.click(screen.getByTestId('fill-title-notes'));

    expect(screen.queryByText('Title is required')).toBeNull();
    expect(screen.getByText('Due is required')).toBeInTheDocument();
  });

  it('keeps an error when the sent value is still invalid', async () => {
    const user = userEvent.setup();
    const schema = makeSchema();
    setup({
      ...schema,
      fields: schema.fields.map((f) =>
        f.name === 'filler'
          ? {
              ...f,
              render: (ctx) => (
                <button
                  id={ctx.id}
                  type="button"
                  data-testid="fill-blank"
                  onClick={() => ctx.setValues({ title: '   ' })}
                >
                  blank
                </button>
              ),
            }
          : f,
      ),
    });
    await user.click(screen.getByTestId('object-form-save'));
    expect(await screen.findByText('Title is required')).toBeInTheDocument();

    await user.click(screen.getByTestId('fill-blank'));

    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  it('is cleared by the next single-field edit', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('fill-title-notes'));
    expect(screen.getByTestId('object-form-added')).toHaveTextContent('Filled.');

    await user.type(title(), '!');

    expect(screen.getByTestId('object-form-added')).toBeEmptyDOMElement();
  });

  it('is ignored while the form is saving', async () => {
    const user = userEvent.setup();
    let resolve!: (r: ObjectFormResult) => void;
    const submit = jest.fn<(v: ObjectFormValues) => Promise<ObjectFormResult>>(
      () => new Promise((r) => (resolve = r)),
    );
    setup(makeSchema({ submit }));
    await user.type(title(), 'Typed');
    await user.type(screen.getByLabelText(/^Due/), '2026-01-01');
    await user.click(screen.getByTestId('object-form-save'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('fill-title-notes'));

    expect(title()).toHaveValue('Typed');
    expect(screen.getByTestId('object-form-added')).toBeEmptyDOMElement();
    await act(async () => {
      resolve(RESULT);
    });
  });
});

describe('ObjectForm function hints', () => {
  it('re-resolves the hint with the live values and drops the described-by id when it is undefined', async () => {
    const user = userEvent.setup();
    const schema = makeSchema();
    setup({
      ...schema,
      fields: schema.fields.map((f) =>
        f.name === 'title'
          ? {
              ...f,
              hint: (values: ObjectFormValues) =>
                values.title === 'hide' ? undefined : `Typed: ${String(values.title)}`,
            }
          : f,
      ),
    });
    expect(title()).toHaveAttribute('aria-describedby', 'title-hint');
    expect(screen.getByText('Typed:')).toBeInTheDocument();

    await user.type(title(), 'abc');
    expect(screen.getByText('Typed: abc')).toBeInTheDocument();

    await user.clear(title());
    await user.type(title(), 'hide');
    expect(title()).not.toHaveAttribute('aria-describedby');
    expect(document.getElementById('title-hint')).toBeNull();
  });
});
