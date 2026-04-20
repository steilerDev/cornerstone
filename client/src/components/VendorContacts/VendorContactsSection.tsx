import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  VendorContact,
  CreateVendorContactRequest,
  UpdateVendorContactRequest,
} from '@cornerstone/shared';
import { useVendorContacts } from '../../hooks/useVendorContacts.js';
import { Modal } from '../Modal/Modal.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import { ApiClientError } from '../../lib/apiClient.js';
import styles from './VendorContactsSection.module.css';

interface ContactFormState {
  firstName: string;
  lastName: string;
  role: string;
  phone: string;
  email: string;
  notes: string;
}

const EMPTY_FORM: ContactFormState = {
  firstName: '',
  lastName: '',
  role: '',
  phone: '',
  email: '',
  notes: '',
};

interface VendorContactsSectionProps {
  vendorId: string;
}

export function VendorContactsSection({ vendorId }: VendorContactsSectionProps) {
  const { t } = useTranslation('settings');
  const { contacts, isLoading, error, addContact, editContact, removeContact } =
    useVendorContacts(vendorId);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<ContactFormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit modal state
  const [editingContact, setEditingContact] = useState<VendorContact | null>(null);
  const [editForm, setEditForm] = useState<ContactFormState>(EMPTY_FORM);
  const [editErrorMsg, setEditErrorMsg] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  // Accessibility: aria-live announcement for contact mutations
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const handleOpenCreateModal = () => {
    setCreateForm(EMPTY_FORM);
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    if (!isCreating) {
      setShowCreateModal(false);
      setCreateError('');
    }
  };

  const handleCreateSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const trimmedFirst = createForm.firstName.trim();
    const trimmedLast = createForm.lastName.trim();
    if (!trimmedFirst && !trimmedLast) {
      setCreateError(t('vendors.contacts.nameRequired'));
      return;
    }

    setIsCreating(true);
    setCreateError('');

    try {
      const request: CreateVendorContactRequest = {
        firstName: trimmedFirst || null,
        lastName: trimmedLast || null,
        role: createForm.role.trim() || null,
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
        notes: createForm.notes.trim() || null,
      };
      await addContact(request);
      setShowCreateModal(false);
      setCreateForm(EMPTY_FORM);
      const displayName = [trimmedFirst, trimmedLast].filter(Boolean).join(' ');
      setLiveAnnouncement(t('vendors.contacts.contactAdded', { name: displayName }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('vendors.contacts.saveError'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEditModal = (contact: VendorContact) => {
    setEditingContact(contact);
    setEditForm({
      firstName: contact.firstName ?? '',
      lastName: contact.lastName ?? '',
      role: contact.role ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      notes: contact.notes ?? '',
    });
    setEditErrorMsg('');
  };

  const handleCloseEditModal = () => {
    if (!isEditing) {
      setEditingContact(null);
      setEditErrorMsg('');
    }
  };

  const handleEditSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingContact) return;

    const trimmedFirst = editForm.firstName.trim();
    const trimmedLast = editForm.lastName.trim();
    if (!trimmedFirst && !trimmedLast) {
      setEditErrorMsg(t('vendors.contacts.nameRequired'));
      return;
    }

    setIsEditing(true);
    setEditErrorMsg('');

    try {
      const request: UpdateVendorContactRequest = {
        firstName: trimmedFirst || null,
        lastName: trimmedLast || null,
        role: editForm.role.trim() || null,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        notes: editForm.notes.trim() || null,
      };
      await editContact(editingContact.id, request);
      setEditingContact(null);
      const displayName = [trimmedFirst, trimmedLast].filter(Boolean).join(' ');
      setLiveAnnouncement(t('vendors.contacts.contactUpdated', { name: displayName }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditErrorMsg(err.error.message);
      } else {
        setEditErrorMsg(t('vendors.contacts.saveError'));
      }
    } finally {
      setIsEditing(false);
    }
  };

  const handleDelete = async (contact: VendorContact) => {
    if (window.confirm(t('vendors.contacts.deleteConfirm'))) {
      await removeContact(contact.id);
      setLiveAnnouncement(t('vendors.contacts.contactDeleted', { name: contact.name }));
    }
  };

  if (isLoading) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>{t('vendors.contacts.heading')}</h2>
        <div className={styles.loading}>{t('vendors.contacts.loading')}</div>
      </section>
    );
  }

  const renderNameFields = (
    prefix: string,
    form: ContactFormState,
    setForm: (f: ContactFormState) => void,
    disabled: boolean,
  ) => (
    <div className={styles.nameRow}>
      <div className={styles.field}>
        <label htmlFor={`${prefix}-firstName`} className={styles.label}>
          {t('vendors.contacts.firstName')}
        </label>
        <input
          id={`${prefix}-firstName`}
          type="text"
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          className={styles.input}
          maxLength={100}
          disabled={disabled}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${prefix}-lastName`} className={styles.label}>
          {t('vendors.contacts.lastName')}
        </label>
        <input
          id={`${prefix}-lastName`}
          type="text"
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          className={styles.input}
          maxLength={100}
          disabled={disabled}
        />
      </div>
    </div>
  );

  return (
    <section className={styles.section}>
      <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
      <div className={styles.header}>
        <h2 className={styles.heading}>{t('vendors.contacts.heading')}</h2>
        <button type="button" className={styles.addButton} onClick={handleOpenCreateModal}>
          {t('vendors.contacts.addContact')}
        </button>
      </div>

      {error && <FormError message={error} />}

      {contacts.length === 0 ? (
        <EmptyState
          message={t('vendors.contacts.empty')}
          action={{ label: t('vendors.contacts.emptyAction')!, onClick: handleOpenCreateModal }}
        />
      ) : (
        <div className={styles.contactsList}>
          {contacts.map((contact) => (
            <div key={contact.id} className={styles.contactCard}>
              <div className={styles.contactInfo}>
                <div className={styles.contactName}>{contact.name}</div>
                {contact.role && <div className={styles.contactRole}>{contact.role}</div>}
                <div className={styles.contactDetails}>
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className={styles.contactLink}>
                      {contact.phone}
                    </a>
                  )}
                  {contact.phone && contact.email && <span className={styles.separator}>•</span>}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className={styles.contactLink}>
                      {contact.email}
                    </a>
                  )}
                </div>
                {contact.notes && <div className={styles.contactNotes}>{contact.notes}</div>}
              </div>
              <div className={styles.contactActions}>
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => handleOpenEditModal(contact)}
                  aria-label={t('vendors.contacts.editContact') + ' ' + contact.name}
                >
                  {t('vendors.contacts.editContact')}
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => handleDelete(contact)}
                  aria-label={t('vendors.contacts.deleteContact') + ' ' + contact.name}
                >
                  {t('vendors.contacts.deleteContact')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <Modal title={t('vendors.contacts.addContact')} onClose={handleCloseCreateModal}>
          {createError && <FormError message={createError} />}
          <form onSubmit={handleCreateSubmit} className={styles.form}>
            {renderNameFields('create', createForm, setCreateForm, isCreating)}

            <div className={styles.field}>
              <label htmlFor="create-role" className={styles.label}>
                {t('vendors.contacts.role')}
              </label>
              <input
                id="create-role"
                type="text"
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className={styles.input}
                maxLength={100}
                disabled={isCreating}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="create-phone" className={styles.label}>
                {t('vendors.contacts.phone')}
              </label>
              <input
                id="create-phone"
                type="tel"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                className={styles.input}
                maxLength={50}
                disabled={isCreating}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="create-email" className={styles.label}>
                {t('vendors.contacts.email')}
              </label>
              <input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className={styles.input}
                maxLength={255}
                disabled={isCreating}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="create-notes" className={styles.label}>
                {t('vendors.contacts.notes')}
              </label>
              <textarea
                id="create-notes"
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                className={styles.textarea}
                maxLength={2000}
                disabled={isCreating}
                rows={3}
              />
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleCloseCreateModal}
                disabled={isCreating}
              >
                {t('vendors.contacts.cancel')}
              </button>
              <button type="submit" className={styles.submitButton} disabled={isCreating}>
                {isCreating
                  ? t('vendors.contacts.creating')
                  : t('vendors.contacts.createContactSubmit')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingContact && (
        <Modal title={t('vendors.contacts.editContact')} onClose={handleCloseEditModal}>
          {editErrorMsg && <FormError message={editErrorMsg} />}
          <form onSubmit={handleEditSubmit} className={styles.form}>
            {renderNameFields('edit', editForm, setEditForm, isEditing)}

            <div className={styles.field}>
              <label htmlFor="edit-role" className={styles.label}>
                {t('vendors.contacts.role')}
              </label>
              <input
                id="edit-role"
                type="text"
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                className={styles.input}
                maxLength={100}
                disabled={isEditing}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="edit-phone" className={styles.label}>
                {t('vendors.contacts.phone')}
              </label>
              <input
                id="edit-phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className={styles.input}
                maxLength={50}
                disabled={isEditing}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="edit-email" className={styles.label}>
                {t('vendors.contacts.email')}
              </label>
              <input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className={styles.input}
                maxLength={255}
                disabled={isEditing}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="edit-notes" className={styles.label}>
                {t('vendors.contacts.notes')}
              </label>
              <textarea
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className={styles.textarea}
                maxLength={2000}
                disabled={isEditing}
                rows={3}
              />
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleCloseEditModal}
                disabled={isEditing}
              >
                {t('vendors.contacts.cancel')}
              </button>
              <button type="submit" className={styles.submitButton} disabled={isEditing}>
                {isEditing ? t('vendors.contacts.saving') : t('vendors.contacts.saveChanges')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
