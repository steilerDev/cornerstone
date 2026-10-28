import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { UpdateVendorContactRequest, VendorContact } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { isEmailAddress } from '../lib/emailAddress.js';
import { createVendorContact, updateVendorContact } from '../lib/vendorContactsApi.js';

const NAME_MAX_LENGTH = 100;

export type ContactPersonFormMode =
  { readonly mode: 'create' } | { readonly mode: 'edit'; readonly contact: VendorContact };

export type ContactPersonFormOptions = ContactPersonFormMode & {
  readonly vendorId: string;
  /** After the request succeeded: the page refresh. */
  readonly onSaved: () => Promise<unknown>;
};

type ContactField = 'firstName' | 'lastName' | 'role' | 'phone' | 'email' | 'notes';
const CONTACT_FIELDS: readonly ContactField[] = [
  'firstName',
  'lastName',
  'role',
  'phone',
  'email',
  'notes',
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function initialOf(options: ContactPersonFormOptions): Record<ContactField, string> {
  const contact = options.mode === 'edit' ? options.contact : null;
  return {
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    role: contact?.role ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    notes: contact?.notes ?? '',
  };
}

/** The New / Edit contact person form of a company. Field names are the API body keys. */
export function useContactPersonFormSchema(options: ContactPersonFormOptions): ObjectFormSchema {
  const { t } = useTranslation('budget');
  const initialValues = initialOf(options);
  const { vendorId, onSaved } = options;

  return {
    id: 'contact-person',
    title:
      options.mode === 'create'
        ? t('companyPage.contactPersons.form.newTitle')
        : t('companyPage.contactPersons.form.editTitle'),
    initialValues,
    fields: [
      {
        name: 'firstName',
        label: t('companyPage.contactPersons.form.firstName'),
        kind: 'text',
        essential: true,
        maxLength: NAME_MAX_LENGTH,
        testId: 'contact-person-first-name',
      },
      {
        name: 'lastName',
        label: t('companyPage.contactPersons.form.lastName'),
        kind: 'text',
        essential: true,
        maxLength: NAME_MAX_LENGTH,
        testId: 'contact-person-last-name',
      },
      {
        name: 'role',
        label: t('companyPage.contactPersons.form.role'),
        kind: 'text',
        maxLength: NAME_MAX_LENGTH,
        testId: 'contact-person-role',
      },
      {
        name: 'phone',
        label: t('companyPage.contactPersons.form.phone'),
        kind: 'tel',
        autoComplete: 'tel',
        maxLength: 50,
        testId: 'contact-person-phone',
      },
      {
        name: 'email',
        label: t('companyPage.contactPersons.form.email'),
        kind: 'email',
        autoComplete: 'email',
        maxLength: 255,
        testId: 'contact-person-email',
      },
      {
        name: 'notes',
        label: t('companyPage.contactPersons.form.notes'),
        kind: 'textarea',
        maxLength: 2000,
        testId: 'contact-person-notes',
      },
    ],
    validate: (values: ObjectFormValues): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!text(values.firstName) && !text(values.lastName)) {
        errors.firstName = t('companyPage.contactPersons.nameRequired');
      }
      const email = text(values.email);
      if (email && !isEmailAddress(email)) errors.email = t('companies.form.emailInvalid');
      return errors;
    },
    submit: async (values) => {
      const trimmed = (field: ContactField) => text(values[field]) || null;
      let saved: VendorContact;
      if (options.mode === 'create') {
        saved = await createVendorContact(vendorId, {
          firstName: trimmed('firstName'),
          lastName: trimmed('lastName'),
          role: trimmed('role'),
          phone: trimmed('phone'),
          email: trimmed('email'),
          notes: trimmed('notes'),
        });
      } else {
        const { contact } = options;
        const body: UpdateVendorContactRequest = {};
        for (const field of CONTACT_FIELDS) {
          if (trimmed(field) !== (contact[field] ?? null)) body[field] = trimmed(field);
        }
        saved =
          Object.keys(body).length > 0
            ? await updateVendorContact(vendorId, contact.id, body)
            : contact;
      }
      await onSaved();
      return { id: saved.id, href: routeUrl('company', { id: vendorId }), label: saved.name };
    },
  };
}
