import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { UserListItem, UserResponse } from '@cornerstone/shared';
import { fieldsForScope } from '../components/ObjectForm/objectFormState.js';
import type {
  ObjectFormErrors,
  ObjectFormField,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { useAuth } from '../contexts/AuthContext.js';
import { adminUpdateUser, createUser } from '../lib/usersApi.js';
import type { AdminUpdateUserPayload, CreateUserPayload } from '../lib/usersApi.js';

export type UserFormMode = 'new' | 'edit';

export interface UserFormOptions {
  /** Default 'new'. */
  readonly mode?: UserFormMode;
  /** The user being edited (`mode === 'edit'`). */
  readonly user?: UserListItem;
  /** Default: `createUser`. The page passes a wrapper that adds the row. */
  readonly create?: (payload: CreateUserPayload) => Promise<UserResponse>;
  /** Default: `adminUpdateUser`. The page passes a wrapper that replaces the row. */
  readonly update?: (id: string, payload: AdminUpdateUserPayload) => Promise<UserResponse>;
}

export interface UserValueMessages {
  readonly displayNameRequired: string;
  readonly displayNameTooLong: string;
  readonly emailRequired: string;
  readonly emailInvalid: string;
  readonly emailTooLong: string;
  readonly passwordRequired: string;
  readonly passwordTooShort: string;
  readonly passwordTooLong: string;
  readonly confirmPasswordRequired: string;
  readonly passwordsDoNotMatch: string;
  readonly emailInUse: string;
}

const DISPLAY_NAME_MAX = 100;
const EMAIL_MAX = 255;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Length in Unicode code points (matches server-side AJV counting). */
const codePoints = (value: string): number => Array.from(value).length;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Translation only (no data). */
export function useUserValueMessages(): UserValueMessages {
  const { t } = useTranslation('settings');
  return {
    displayNameRequired: t('userManagement.editValidation.displayNameRequired'),
    displayNameTooLong: t('userManagement.editValidation.displayNameTooLong'),
    emailRequired: t('userManagement.editValidation.emailRequired'),
    emailInvalid: t('userManagement.editValidation.emailInvalid'),
    emailTooLong: t('userManagement.createValidation.emailTooLong'),
    passwordRequired: t('userManagement.createValidation.passwordRequired'),
    passwordTooShort: t('userManagement.createValidation.passwordTooShort'),
    passwordTooLong: t('userManagement.createValidation.passwordTooLong'),
    confirmPasswordRequired: t('userManagement.createValidation.confirmPasswordRequired'),
    passwordsDoNotMatch: t('userManagement.createValidation.passwordsDoNotMatch'),
    emailInUse: t('userManagement.errors.emailInUse'),
  };
}

/**
 * Pure. Password rules run only when `mode === 'new'` and `values.authProvider !== 'oidc'`
 * ('oidc' is only selectable when the field exists, i.e. OIDC is on).
 */
export function validateUserValues(
  values: ObjectFormValues,
  messages: UserValueMessages,
  mode: UserFormMode,
): ObjectFormErrors {
  const errors: Record<string, string> = {};
  const displayName = text(values.displayName).trim();
  const email = text(values.email).trim();

  if (!displayName) errors.displayName = messages.displayNameRequired;
  else if (codePoints(displayName) > DISPLAY_NAME_MAX) {
    errors.displayName = messages.displayNameTooLong;
  }

  if (!email) errors.email = messages.emailRequired;
  else if (!EMAIL_PATTERN.test(email)) errors.email = messages.emailInvalid;
  else if (codePoints(email) > EMAIL_MAX) errors.email = messages.emailTooLong;

  if (mode === 'new' && values.authProvider !== 'oidc') {
    const password = text(values.password);
    const confirm = text(values.confirmPassword);
    if (!password) errors.password = messages.passwordRequired;
    else if (codePoints(password) < PASSWORD_MIN) errors.password = messages.passwordTooShort;
    else if (codePoints(password) > PASSWORD_MAX) errors.password = messages.passwordTooLong;

    if (!confirm) errors.confirmPassword = messages.confirmPasswordRequired;
    else if (confirm !== password) errors.confirmPassword = messages.passwordsDoNotMatch;
  }
  return errors;
}

/** Start values of an edit; undefined for a new user. */
export function userFormPrefill(user?: UserListItem): ObjectFormValues | undefined {
  if (!user) return undefined;
  return { displayName: user.displayName, email: user.email, role: user.role };
}

function roleOf(value: unknown): 'admin' | 'member' {
  return value === 'admin' ? 'admin' : 'member';
}

/**
 * The New / Edit user form (Settings › Users, admin). Field names are the API body keys, so
 * server `details.fields[].path` maps onto them.
 */
export function useUserFormSchema(options: UserFormOptions = {}): ObjectFormSchema {
  const { t } = useTranslation('settings');
  const { oidcEnabled } = useAuth();
  const messages = useUserValueMessages();
  const mode = options.mode ?? 'new';
  const { user } = options;

  const fields: readonly ObjectFormField[] = [
    {
      name: 'displayName',
      label: t('userManagement.createModal.displayNameLabel'),
      kind: 'text',
      essential: true,
      required: true,
      autoComplete: 'off',
      maxLength: DISPLAY_NAME_MAX,
    },
    {
      name: 'email',
      label: t('userManagement.createModal.emailLabel'),
      kind: 'email',
      essential: true,
      required: true,
      autoComplete: 'off',
      maxLength: EMAIL_MAX,
    },
    {
      name: 'role',
      label: t('userManagement.createModal.roleLabel'),
      kind: 'select',
      essential: true,
      width: 'half',
      options: [
        { value: 'member', label: t('userManagement.roles.member') },
        { value: 'admin', label: t('userManagement.roles.admin') },
      ],
    },
    ...(oidcEnabled
      ? [
          {
            name: 'authProvider',
            label: t('userManagement.form.signInMethod'),
            kind: 'select',
            scope: 'create',
            essential: true,
            width: 'half',
            options: [
              { value: 'local', label: t('userManagement.form.signInLocal') },
              { value: 'oidc', label: t('userManagement.form.signInOidc') },
            ],
            hint: (values: ObjectFormValues) =>
              values.authProvider === 'oidc'
                ? t('userManagement.createModal.ssoOnlyHint')
                : undefined,
          } satisfies ObjectFormField,
        ]
      : []),
    {
      name: 'password',
      label: t('userManagement.createModal.passwordLabel'),
      kind: 'password',
      scope: 'create',
      essential: true,
      required: true,
      autoComplete: 'new-password',
      maxLength: PASSWORD_MAX,
      hint: t('userManagement.createModal.passwordHint'),
      visibleWhen: (values) => values.authProvider !== 'oidc',
    },
    {
      name: 'confirmPassword',
      label: t('userManagement.createModal.confirmPasswordLabel'),
      kind: 'password',
      scope: 'create',
      essential: true,
      required: true,
      autoComplete: 'new-password',
      maxLength: PASSWORD_MAX,
      visibleWhen: (values) => values.authProvider !== 'oidc',
    },
  ];

  return {
    id: mode === 'edit' ? 'user-edit' : 'user',
    title:
      mode === 'edit' ? t('userManagement.editModal.title') : t('userManagement.createModal.title'),
    initialValues:
      mode === 'edit'
        ? { displayName: '', email: '', role: 'member' }
        : {
            displayName: '',
            email: '',
            role: 'member',
            authProvider: 'local',
            password: '',
            confirmPassword: '',
          },
    fields: fieldsForScope(fields, mode === 'edit' ? 'edit' : 'create'),
    validate: (values) => validateUserValues(values, messages, mode),
    mapError: (code) => (code === 'CONFLICT' ? { email: messages.emailInUse } : null),
    submit: async (values) => {
      const displayName = text(values.displayName).trim();
      const email = text(values.email).trim();
      const role = roleOf(values.role);

      if (mode === 'edit' && user) {
        const changes: AdminUpdateUserPayload = {};
        if (displayName !== user.displayName) changes.displayName = displayName;
        if (email !== user.email) changes.email = email;
        if (role !== user.role) changes.role = role;
        if (Object.keys(changes).length > 0) {
          await (options.update ?? adminUpdateUser)(user.id, changes);
        }
        return { id: user.id, href: routeUrl('settingsUsers'), label: displayName };
      }

      const payload: CreateUserPayload = {
        email,
        displayName,
        role,
        ...(oidcEnabled && values.authProvider === 'oidc'
          ? { authProvider: 'oidc' as const }
          : { password: text(values.password) }),
      };
      const created = await (options.create ?? createUser)(payload);
      return { id: created.id, href: routeUrl('settingsUsers'), label: created.displayName };
    },
  };
}
