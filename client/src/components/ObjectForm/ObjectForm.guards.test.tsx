/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

// Reachable guards of ObjectForm that the main suite does not reach: optional host callbacks,
// fields that are gone when a focus request lands, forms without a visible field, nested steps.

const RESULT: ObjectFormResult = { id: 'n1', href: '/things/n1', label: 'Thing' };
const TITLE_FIELD: ObjectFormField = {
  name: 'title',
  label: 'Title',
  kind: 'text',
  essential: true,
};

function makeSchema(
  over: Partial<ObjectFormSchema> = {},
  fields: readonly ObjectFormField[] = [TITLE_FIELD],
): ObjectFormSchema {
  return {
    id: 'thing',
    title: 'New thing',
    addAnother: false,
    initialValues: { title: '' },
    fields,
    validate: () => ({}),
    submit: () => Promise.resolve(RESULT),
    ...over,
  };
}

function setup(props: Partial<ObjectFormProps> = {}) {
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();
  const onCancel = jest.fn<() => void>();
  const ui = (p: Partial<ObjectFormProps>) => (
    <MemoryRouter>
      <ObjectForm
        schema={makeSchema()}
        onCreated={onCreated}
        onCancel={onCancel}
        {...props}
        {...p}
      />
    </MemoryRouter>
  );
  const utils = render(ui({}));
  return {
    onCreated,
    onCancel,
    ...utils,
    rerenderWith: (p: Partial<ObjectFormProps>) => utils.rerender(ui(p)),
  };
}

/** A custom field whose button opens `child` as a child step. */
function opener(
  name: string,
  testId: string,
  child: ObjectFormSchema,
  withId = true,
): ObjectFormField {
  return {
    name,
    label: name,
    kind: 'custom',
    essential: true,
    render: (ctx) => (
      <button
        id={withId ? ctx.id : undefined}
        type="button"
        data-testid={testId}
        onClick={() => ctx.createChild({ schema: child, onCreated: () => undefined })}
      >
        Open
      </button>
    ),
  };
}

let media: MatchMediaControl;
beforeEach(() => {
  media = installMatchMedia({ [OBJECT_FORM_MEDIA_QUERY]: true });
});
afterEach(() => {
  media.restore();
  delete document.documentElement.dataset.scrollLocked;
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

const save = () => screen.getByTestId('object-form-save');
const cancel = () => screen.getByTestId('object-form-cancel');

describe('banner scrolling', () => {
  it('scrolls the banner into view when the browser supports it', async () => {
    const user = userEvent.setup();
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView as never;
    setup({ schema: makeSchema({ submit: () => Promise.reject(new Error('offline')) }) });
    await user.click(save());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
});

describe('leaveRequested without a host callback', () => {
  it('closes the confirm on Keep editing and on Discard without throwing', async () => {
    const user = userEvent.setup();
    const { rerenderWith, onCancel } = setup({ leaveRequested: false });
    rerenderWith({ leaveRequested: true });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('object-form-discard-cancel'));
    rerenderWith({ leaveRequested: false });
    expect(screen.queryByRole('alertdialog')).toBeNull();

    rerenderWith({ leaveRequested: true });
    await user.click(screen.getByTestId('object-form-discard-confirm'));
    rerenderWith({ leaveRequested: false });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('focus requests whose field is gone', () => {
  it('survives a container switch after the remembered field was hidden', () => {
    const schema = makeSchema({ initialValues: { title: '', extra: '' } }, [
      TITLE_FIELD,
      {
        name: 'extra',
        label: 'Extra',
        kind: 'text',
        essential: true,
        visibleWhen: (v: ObjectFormValues) => v.title !== 'hide',
      },
    ]);
    setup({ schema });
    screen.getByLabelText(/Extra/).focus();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'hide' } });
    expect(screen.queryByLabelText(/Extra/)).toBeNull();

    media.set(OBJECT_FORM_MEDIA_QUERY, false);

    expect(screen.getByTestId('object-form-sheet')).toBeInTheDocument();
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe('hide');
  });

  it('ignores the parent focus request when no element carries the custom field id', async () => {
    const user = userEvent.setup();
    const child = makeSchema({ id: 'child', title: 'New helper' });
    setup({
      schema: makeSchema({ initialValues: {} }, [opener('helper', 'create-helper', child, false)]),
    });
    await user.click(screen.getByTestId('create-helper'));
    expect(screen.getByRole('heading', { name: 'New helper' })).toBeInTheDocument();
    await user.click(cancel());
    expect(screen.getByRole('heading', { name: 'New thing' })).toBeInTheDocument();
  });
});

describe('child steps', () => {
  it('opens a child without any field and pops after Save', async () => {
    const user = userEvent.setup();
    const child = makeSchema({ id: 'child', title: 'New helper', initialValues: {} }, []);
    const { onCreated } = setup({
      schema: makeSchema({ initialValues: {} }, [opener('helper', 'create-helper', child)]),
    });
    await user.click(screen.getByTestId('create-helper'));
    expect(screen.getByRole('heading', { name: 'New helper' })).toBeInTheDocument();
    await user.click(save());
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New thing' })).toBeInTheDocument(),
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('names the step it was opened from in the back link of a nested step', async () => {
    const user = userEvent.setup();
    const grandchild = makeSchema({ id: 'grand', title: 'New detail' });
    const child = makeSchema({ id: 'child', title: 'New helper', initialValues: {} }, [
      opener('detail', 'create-detail', grandchild),
    ]);
    setup({
      schema: makeSchema({ initialValues: {} }, [opener('helper', 'create-helper', child)]),
    });
    await user.click(screen.getByTestId('create-helper'));
    expect(screen.getByTestId('object-form-back')).toHaveTextContent('Back to New thing');
    await user.click(screen.getByTestId('create-detail'));
    expect(screen.getByRole('heading', { name: 'New detail' })).toBeInTheDocument();
    expect(screen.getByTestId('object-form-back')).toHaveTextContent('Back to New helper');
    await user.click(screen.getByTestId('object-form-back'));
    expect(screen.getByRole('heading', { name: 'New helper' })).toBeInTheDocument();
  });
});

describe('forms without a visible field', () => {
  const hidden = (over: Partial<ObjectFormSchema> = {}) =>
    makeSchema({ initialValues: { show: false }, ...over }, [
      {
        name: 'only',
        label: 'Only',
        kind: 'text',
        essential: true,
        visibleWhen: (v: ObjectFormValues) => v.show === true,
      },
    ]);

  it('resets through Add another without a field to focus', async () => {
    const user = userEvent.setup();
    const { onCreated } = setup({ schema: hidden({ addAnother: true }) });
    await user.click(screen.getByTestId('object-form-add-another'));
    await user.click(save());
    await waitFor(() => expect(save()).not.toBeDisabled());
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'New thing' })).toBeInTheDocument();
  });

  it('takes a server error that names a hidden field without moving focus or showing a banner', async () => {
    const user = userEvent.setup();
    const submit = jest
      .fn<ObjectFormSchema['submit']>()
      .mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));
    setup({ schema: hidden({ submit, mapError: () => ({ only: 'Taken.' }) }) });
    await user.click(save());
    await act(async () => {});
    await waitFor(() => expect(save()).not.toBeDisabled());
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
