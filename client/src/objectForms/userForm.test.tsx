/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import type { UserListItem, UserResponse } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as UsersApiTypes from '../lib/usersApi.js';
import type * as FormTypes from './userForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

let mockOidcEnabled = false;
jest.unstable_mockModule('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: null, oidcEnabled: mockOidcEnabled }),
}));

const mockCreateUser = jest.fn<typeof UsersApiTypes.createUser>();
const mockAdminUpdateUser = jest.fn<typeof UsersApiTypes.adminUpdateUser>();
jest.unstable_mockModule('../lib/usersApi.js', () => ({
  createUser: mockCreateUser,
  adminUpdateUser: mockAdminUpdateUser,
}));

const response = (overrides: Partial<UserResponse> = {}): UserResponse =>
  ({
    id: 'u-new',
    email: 'user-a@example.test',
    displayName: 'User A',
    role: 'member',
    authProvider: 'local',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as UserResponse;

const existing: UserListItem = {
  id: 'u-1',
  displayName: 'User A',
  email: 'user-a@example.test',
  role: 'member',
  authProvider: 'local',
  oidcLinked: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  deactivatedAt: null,
} as UserListItem;

const VALID_PASSWORD = 'correct horse battery';

describe('userForm', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(result: ObjectFormResult) => void>();

  beforeEach(async () => {
    mockCreateUser.mockReset();
    mockAdminUpdateUser.mockReset();
    onCreated.mockReset();
    mockOidcEnabled = false;
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./userForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  const schema = (options?: Parameters<typeof FormTypes.useUserFormSchema>[0]) =>
    renderHook(() => Form.useUserFormSchema(options)).result.current;
  const messages = () => renderHook(() => Form.useUserValueMessages()).result.current;

  function Harness({ options }: { options?: Parameters<typeof FormTypes.useUserFormSchema>[0] }) {
    const s = Form.useUserFormSchema(options);
    const prefill = Form.userFormPrefill(options?.user);
    return (
      <FormComponent.ObjectForm
        schema={s}
        {...(prefill ? { prefill } : {})}
        onCreated={onCreated}
        onCancel={() => {}}
        testId="user-form"
      />
    );
  }
  const renderForm = (options?: Parameters<typeof FormTypes.useUserFormSchema>[0]) =>
    render(
      <MemoryRouter>
        <Harness options={options} />
      </MemoryRouter>,
    );

  describe('schema scopes', () => {
    it('new: fields in order, essential, local sign-in without the method field', () => {
      const s = schema();

      expect(s.id).toBe('user');
      expect(s.title).toBe('New user');
      expect(s.fields.map((f) => f.name)).toEqual([
        'displayName',
        'email',
        'role',
        'password',
        'confirmPassword',
      ]);
      expect(s.fields.every((f) => f.essential)).toBe(true);
      expect(s.initialValues).toEqual({
        displayName: '',
        email: '',
        role: 'member',
        authProvider: 'local',
        password: '',
        confirmPassword: '',
      });
      expect(s.fields.find((f) => f.name === 'password')).toMatchObject({
        kind: 'password',
        autoComplete: 'new-password',
        required: true,
      });
    });

    it('new: offers the sign-in method only when OIDC is enabled', () => {
      mockOidcEnabled = true;
      const s = schema();

      expect(s.fields.map((f) => f.name)).toEqual([
        'displayName',
        'email',
        'role',
        'authProvider',
        'password',
        'confirmPassword',
      ]);
      const method = s.fields.find((f) => f.name === 'authProvider')!;
      expect(method.options?.map((o) => o.value)).toEqual(['local', 'oidc']);
    });

    it('new: the sign-in hint and password fields follow the chosen method', () => {
      mockOidcEnabled = true;
      const s = schema();
      const method = s.fields.find((f) => f.name === 'authProvider')!;
      const password = s.fields.find((f) => f.name === 'password')!;
      const confirm = s.fields.find((f) => f.name === 'confirmPassword')!;
      const hint = method.hint as (values: Record<string, unknown>) => string | undefined;

      expect(hint({ authProvider: 'oidc' })).toMatch(/single sign-on/i);
      expect(hint({ authProvider: 'local' })).toBeUndefined();
      expect(password.visibleWhen?.({ authProvider: 'oidc' })).toBe(false);
      expect(password.visibleWhen?.({ authProvider: 'local' })).toBe(true);
      expect(confirm.visibleWhen?.({ authProvider: 'oidc' })).toBe(false);
      expect(confirm.visibleWhen?.({ authProvider: 'local' })).toBe(true);
    });

    it('edit: only display name, email and role', () => {
      mockOidcEnabled = true;
      const s = schema({ mode: 'edit', user: existing });

      expect(s.id).toBe('user-edit');
      expect(s.title).toBe('Edit user');
      expect(s.fields.map((f) => f.name)).toEqual(['displayName', 'email', 'role']);
      expect(s.initialValues).toEqual({ displayName: '', email: '', role: 'member' });
    });

    it('caps text inputs: create and edit scopes carry the field maxLength values', () => {
      const limits = (s: ReturnType<typeof schema>) =>
        Object.fromEntries(
          s.fields
            .filter((f) => 'maxLength' in f)
            .map((f) => [f.name, (f as { maxLength: number }).maxLength]),
        );

      expect(limits(schema())).toEqual({
        displayName: 100,
        email: 255,
        password: 255,
        confirmPassword: 255,
      });
      expect(limits(schema({ mode: 'edit', user: existing }))).toEqual({
        displayName: 100,
        email: 255,
      });
    });

    it('userFormPrefill is undefined for a new user and carries the edited fields', () => {
      expect(Form.userFormPrefill(undefined)).toBeUndefined();
      expect(Form.userFormPrefill(existing)).toEqual({
        displayName: 'User A',
        email: 'user-a@example.test',
        role: 'member',
      });
    });
  });

  describe('validateUserValues', () => {
    const base = {
      displayName: 'User A',
      email: 'user-a@example.test',
      role: 'member',
      authProvider: 'local',
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    };

    it('accepts a complete local user', () => {
      expect(Form.validateUserValues(base, messages(), 'new')).toEqual({});
    });

    it('requires display name and email', () => {
      const m = messages();
      expect(Form.validateUserValues({ ...base, displayName: '  ', email: '' }, m, 'new')).toEqual({
        displayName: m.displayNameRequired,
        email: m.emailRequired,
      });
      expect(
        Form.validateUserValues({ ...base, displayName: undefined, email: 3 }, m, 'new'),
      ).toEqual({ displayName: m.displayNameRequired, email: m.emailRequired });
    });

    it('caps display name at 100 code points, counting an emoji as one', () => {
      const m = messages();
      expect(Form.validateUserValues({ ...base, displayName: '😀'.repeat(100) }, m, 'new')).toEqual(
        {},
      );
      expect(Form.validateUserValues({ ...base, displayName: '😀'.repeat(101) }, m, 'new')).toEqual(
        { displayName: m.displayNameTooLong },
      );
    });

    it('rejects an invalid or too long email', () => {
      const m = messages();
      expect(Form.validateUserValues({ ...base, email: 'not-an-email' }, m, 'new')).toEqual({
        email: m.emailInvalid,
      });
      const long = `${'a'.repeat(250)}@example.test`;
      expect(Form.validateUserValues({ ...base, email: long }, m, 'new')).toEqual({
        email: m.emailTooLong,
      });
    });

    it('checks the password length bounds in code points', () => {
      const m = messages();
      const run = (password: string) =>
        Form.validateUserValues({ ...base, password, confirmPassword: password }, m, 'new');

      expect(run('')).toMatchObject({ password: m.passwordRequired });
      expect(run('x'.repeat(11))).toEqual({ password: m.passwordTooShort });
      expect(run('x'.repeat(12))).toEqual({});
      expect(run('😀'.repeat(12))).toEqual({});
      expect(run('x'.repeat(255))).toEqual({});
      expect(run('x'.repeat(256))).toEqual({ password: m.passwordTooLong });
    });

    it('requires the confirmation and that it matches', () => {
      const m = messages();
      expect(Form.validateUserValues({ ...base, confirmPassword: '' }, m, 'new')).toEqual({
        confirmPassword: m.confirmPasswordRequired,
      });
      expect(
        Form.validateUserValues({ ...base, confirmPassword: 'different one!!' }, m, 'new'),
      ).toEqual({ confirmPassword: m.passwordsDoNotMatch });
      expect(
        Form.validateUserValues(
          { ...base, password: undefined, confirmPassword: undefined },
          m,
          'new',
        ),
      ).toEqual({
        password: m.passwordRequired,
        confirmPassword: m.confirmPasswordRequired,
      });
    });

    it('skips the password rules for an SSO user', () => {
      expect(
        Form.validateUserValues(
          { ...base, authProvider: 'oidc', password: '', confirmPassword: '' },
          messages(),
          'new',
        ),
      ).toEqual({});
    });

    it('skips the password rules in edit mode but still checks the profile fields', () => {
      const m = messages();
      expect(
        Form.validateUserValues(
          { displayName: 'User A', email: 'user-a@example.test', role: 'member' },
          m,
          'edit',
        ),
      ).toEqual({});
      expect(
        Form.validateUserValues({ displayName: '', email: 'x', role: 'member' }, m, 'edit'),
      ).toEqual({
        displayName: m.displayNameRequired,
        email: m.emailInvalid,
      });
    });

    it('the schema validate delegates to it', () => {
      expect(schema().validate({ ...base, email: '' })).toEqual({
        email: messages().emailRequired,
      });
    });
  });

  describe('submit (new)', () => {
    const values = {
      displayName: '  User A  ',
      email: '  user-a@example.test  ',
      role: 'admin',
      authProvider: 'local',
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    };
    const create = jest.fn<NonNullable<FormTypes.UserFormOptions['create']>>();

    beforeEach(() => {
      create.mockReset();
      create.mockResolvedValue(response({ id: 'u-9', displayName: 'Stored Name' }));
    });

    it('a local payload has the password and no authProvider or confirmPassword', async () => {
      const result = await schema({ create }).submit(values);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0]?.[0]).toEqual({
        email: 'user-a@example.test',
        displayName: 'User A',
        role: 'admin',
        password: VALID_PASSWORD,
      });
      expect(result).toEqual({
        id: 'u-9',
        href: routeUrl('settingsUsers'),
        label: 'Stored Name',
      });
    });

    it('an SSO payload has authProvider oidc and no password', async () => {
      mockOidcEnabled = true;

      await schema({ create }).submit({ ...values, authProvider: 'oidc' });

      expect(create.mock.calls[0]?.[0]).toEqual({
        email: 'user-a@example.test',
        displayName: 'User A',
        role: 'admin',
        authProvider: 'oidc',
      });
    });

    it('ignores a stale oidc choice when OIDC is disabled', async () => {
      await schema({ create }).submit({ ...values, authProvider: 'oidc' });

      expect(create.mock.calls[0]?.[0]).toMatchObject({ password: VALID_PASSWORD });
      expect(create.mock.calls[0]?.[0]).not.toHaveProperty('authProvider');
    });

    it('falls back to member for an unknown role', async () => {
      await schema({ create }).submit({ ...values, role: 'weird' });

      expect(create.mock.calls[0]?.[0]).toMatchObject({ role: 'member' });
    });

    it('uses the API client when no create is injected', async () => {
      mockCreateUser.mockResolvedValue(response());

      await schema().submit(values);

      expect(mockCreateUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('submit (edit)', () => {
    const update = jest.fn<NonNullable<FormTypes.UserFormOptions['update']>>();
    const edit = (options: Partial<FormTypes.UserFormOptions> = {}) =>
      schema({ mode: 'edit', user: existing, update, ...options });

    beforeEach(() => {
      update.mockReset();
      update.mockResolvedValue(response({ id: 'u-1' }));
    });

    it('sends nothing when nothing changed', async () => {
      const result = await edit().submit({
        displayName: ' User A ',
        email: 'user-a@example.test',
        role: 'member',
      });

      expect(update).not.toHaveBeenCalled();
      expect(mockAdminUpdateUser).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'u-1', href: routeUrl('settingsUsers'), label: 'User A' });
    });

    it('sends only the changed fields', async () => {
      await edit().submit({
        displayName: 'User B',
        email: 'user-a@example.test',
        role: 'member',
      });
      await edit().submit({
        displayName: 'User A',
        email: 'user-b@example.test',
        role: 'member',
      });
      await edit().submit({
        displayName: 'User A',
        email: 'user-a@example.test',
        role: 'admin',
      });

      expect(update.mock.calls.map((call) => call[1])).toEqual([
        { displayName: 'User B' },
        { email: 'user-b@example.test' },
        { role: 'admin' },
      ]);
      expect(update.mock.calls[0]?.[0]).toBe('u-1');
    });

    it('uses the API client when no update is injected', async () => {
      mockAdminUpdateUser.mockResolvedValue(response({ id: 'u-1' }));

      await schema({ mode: 'edit', user: existing }).submit({
        displayName: 'User B',
        email: 'user-a@example.test',
        role: 'member',
      });

      expect(mockAdminUpdateUser).toHaveBeenCalledWith('u-1', { displayName: 'User B' });
    });

    it('treats edit mode without a user as a new user', async () => {
      mockCreateUser.mockResolvedValue(response());

      await schema({ mode: 'edit' }).submit({
        displayName: 'User A',
        email: 'user-a@example.test',
        role: 'member',
        password: VALID_PASSWORD,
      });

      expect(mockCreateUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('mapError', () => {
    it('maps CONFLICT to an email error and leaves other codes to the banner', () => {
      const { mapError } = schema();

      expect(mapError?.('CONFLICT', {})).toEqual({ email: messages().emailInUse });
      expect(mapError?.('VALIDATION_ERROR', {})).toBeNull();
    });
  });

  describe('in the ObjectForm', () => {
    it('creates a local user and reports it', async () => {
      const user = userEvent.setup();
      mockCreateUser.mockResolvedValue(response());
      renderForm();

      expect(screen.getByRole('dialog', { name: 'New user' })).toBeInTheDocument();
      await user.type(document.getElementById('displayName')!, 'User A');
      await user.type(document.getElementById('email')!, 'user-a@example.test');
      await user.type(document.getElementById('password')!, VALID_PASSWORD);
      await user.type(document.getElementById('confirmPassword')!, VALID_PASSWORD);
      await user.click(screen.getByTestId('user-form-save'));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockCreateUser.mock.calls[0]?.[0]).toEqual({
        email: 'user-a@example.test',
        displayName: 'User A',
        role: 'member',
        password: VALID_PASSWORD,
      });
    });

    it('does not save an empty form and shows the required messages', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByTestId('user-form-save'));

      expect(await screen.findByText('Display name is required')).toBeInTheDocument();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('shows the email-in-use error on the email for a 409, without a banner', async () => {
      const user = userEvent.setup();
      mockCreateUser.mockRejectedValue(
        new ApiClientError(409, { code: 'CONFLICT', message: 'server text' }),
      );
      renderForm();

      await user.type(document.getElementById('displayName')!, 'User A');
      await user.type(document.getElementById('email')!, 'user-a@example.test');
      await user.type(document.getElementById('password')!, VALID_PASSWORD);
      await user.type(document.getElementById('confirmPassword')!, VALID_PASSWORD);
      await user.click(screen.getByTestId('user-form-save'));

      expect(
        await screen.findByText('This email address is already used by another account.'),
      ).toBeInTheDocument();
      expect(document.getElementById('email')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('edit opens prefilled and saves a changed display name', async () => {
      const user = userEvent.setup();
      mockAdminUpdateUser.mockResolvedValue(response({ id: 'u-1' }));
      renderForm({ mode: 'edit', user: existing });

      expect(screen.getByRole('dialog', { name: 'Edit user' })).toBeInTheDocument();
      expect(document.getElementById('displayName')).toHaveValue('User A');
      expect(document.getElementById('password')).toBeNull();
      const name = document.getElementById('displayName')!;
      await user.clear(name);
      await user.type(name, 'User B');
      await user.click(screen.getByTestId('user-form-save'));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockAdminUpdateUser).toHaveBeenCalledWith('u-1', { displayName: 'User B' });
    });

    it('hides the password fields when single sign-on is chosen', async () => {
      const user = userEvent.setup();
      mockOidcEnabled = true;
      renderForm();

      expect(document.getElementById('password')).not.toBeNull();
      await user.selectOptions(document.getElementById('authProvider')!, 'oidc');

      expect(document.getElementById('password')).toBeNull();
      expect(document.getElementById('confirmPassword')).toBeNull();
    });
  });
});
