import { useId } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../Modal/Modal.js';
import { Sheet } from '../../Modal/Sheet.js';
import { SearchPicker } from '../../SearchPicker/SearchPicker.js';
import { useWideDialog } from '../../../hooks/useWideDialog.js';
import { searchCompanies } from '../../../lib/vendorsApi.js';
import { useCompanyCreateAction } from '../../../objectForms/useCompanyCreateAction.js';
import type { CompanyOption } from '../../../objectForms/companyForm.js';

export interface CompanyPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** The company that was picked or created in place. */
  onPick: (company: { id: string; name: string }) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * "Other company…": the company picker (with "New company ‹text›") in a bottom sheet below
 * 768px and a modal from 768px.
 */
export function CompanyPickerDialog({
  open,
  onClose,
  onPick,
  returnFocusRef,
}: CompanyPickerDialogProps) {
  const { t } = useTranslation('diary');
  const wide = useWideDialog();
  const sheetId = useId();
  const { createAction, isCreating } = useCompanyCreateAction();

  const picker = (
    <SearchPicker<CompanyOption>
      value=""
      onChange={() => {}}
      onSelectItem={(item) => {
        onPick({ id: item.id, name: item.label });
        onClose();
      }}
      excludeIds={[]}
      searchFn={(query, _excluded, signal) => searchCompanies(query, signal)}
      renderItem={(company) => ({ id: company.id, label: company.name })}
      showItemsOnFocus
      createAction={createAction}
      inputAriaProps={{ 'aria-label': t('capture.chooseCompany') }}
      placeholder={t('capture.companyPlaceholder')}
    />
  );

  if (wide) {
    if (!open) return null;
    return (
      <Modal
        title={t('capture.chooseCompany')}
        onClose={onClose}
        dismissible={!isCreating}
        returnFocusRef={returnFocusRef}
      >
        {picker}
      </Modal>
    );
  }

  return (
    <Sheet
      id={sheetId}
      open={open}
      onClose={onClose}
      title={t('capture.chooseCompany')}
      dismissible={!isCreating}
      returnFocusRef={returnFocusRef}
      testId="capture-company-sheet"
      restoreFocusOnUnmount
    >
      {open ? picker : null}
    </Sheet>
  );
}
