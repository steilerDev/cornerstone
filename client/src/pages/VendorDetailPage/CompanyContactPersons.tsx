import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VendorContact } from '@cornerstone/shared';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';
import { telHref } from '../../components/CallButton/telHref.js';
import { useUserText } from '../../hooks/useUserText.js';
import { deleteVendorContact } from '../../lib/vendorContactsApi.js';
import type { ContactPersonFormMode } from '../../objectForms/contactPersonForm.js';
import { ContactPersonDialog } from './ContactPersonDialog.js';
import styles from './VendorDetailPage.module.css';

export interface CompanyContactPersonsProps {
  readonly vendorId: string;
  readonly contacts: readonly VendorContact[];
  /** After any change: the page refresh. */
  readonly onChanged: () => Promise<unknown>;
}

/** The Contact persons list of the Overview tab, with the New / Edit dialog and Remove with Undo. */
export function CompanyContactPersons({
  vendorId,
  contacts,
  onChanged,
}: CompanyContactPersonsProps) {
  const { t } = useTranslation('budget');
  const userText = useUserText();
  const [target, setTarget] = useState<ContactPersonFormMode | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const open = (next: ContactPersonFormMode, opener: HTMLElement) => {
    openerRef.current = opener;
    setTarget(next);
  };

  const rows = contacts.map((contact): RelatedListRow => {
    const phone = contact.phone?.trim() ?? '';
    return {
      id: contact.id,
      title: contact.name,
      facts: (
        <>
          {contact.role ? <span {...userText()}>{contact.role}</span> : null}
          {contact.role ? ' · ' : null}
          {phone ? (
            <a href={telHref(phone)} className={styles.inlineLink}>
              {phone}
            </a>
          ) : (
            <span className={styles.muted}>{t('companyPage.contactPersons.noPhone')}</span>
          )}
          {contact.email ? ' · ' : null}
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className={styles.inlineLink}>
              {contact.email}
            </a>
          ) : null}
        </>
      ),
      call: phone ? { phone, name: contact.name } : undefined,
    };
  });

  return (
    <>
      <RelatedList
        title={t('companyPage.contactPersons.title')}
        testId="company-contacts"
        rows={rows}
        emptyMessage={t('companyPage.contactPersons.empty')}
        action={{
          kind: 'button',
          label: t('companyPage.contactPersons.new'),
          onActivate: (opener) => open({ mode: 'create' }, opener),
        }}
        onEdit={(row, opener) => {
          const contact = contacts.find((candidate) => candidate.id === row.id)!;
          open({ mode: 'edit', contact }, opener);
        }}
        onRemove={async (row) => {
          const { undo } = await deleteVendorContact(vendorId, row.id);
          await onChanged();
          return undo;
        }}
        onRestored={async () => {
          await onChanged();
        }}
      />
      {target && (
        <ContactPersonDialog
          vendorId={vendorId}
          target={target}
          onSaved={onChanged}
          onClose={() => setTarget(null)}
          openerRef={openerRef}
        />
      )}
    </>
  );
}

export default CompanyContactPersons;
