import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentLinkWithEntity } from '@cornerstone/shared';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { itemValue, parseItemValue } from '../../components/EntityPicker/entityPickerKinds.js';
import type { EntityOption } from '../../components/EntityPicker/types.js';
import { FormError } from '../../components/FormError/FormError.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { actionError } from '../../lib/actionError.js';
import {
  createDocumentLink,
  deleteDocumentLink,
  listDocumentLinksForDocument,
} from '../../lib/documentLinksApi.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { toLinkedToRow } from './documentLinkRows.js';

export interface DocumentLinkedToListProps {
  readonly paperlessDocumentId: number;
  /** After every link, unlink or undo: the page refreshes its Linked badges. */
  readonly onLinksChanged: () => void;
}

/**
 * "Linked to" of the Documents page panel: every record the document is linked to (all five
 * kinds, also records that no longer exist), with Unlink (Undo toast) and "Link to…" for tasks
 * and purchases through an inline picker whose refusals show as its inline error.
 */
export function DocumentLinkedToList({
  paperlessDocumentId,
  onLinksChanged,
}: DocumentLinkedToListProps) {
  const { t } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { showUndoToast } = useToast();
  const originState = useOriginState();
  const [links, setLinks] = useState<readonly DocumentLinkWithEntity[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listDocumentLinksForDocument(paperlessDocumentId)
      .then((result) => {
        if (cancelled) return;
        setLinks(result);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [paperlessDocumentId, reloadKey]);

  // A different document starts from a loading list.
  const [shownDocumentId, setShownDocumentId] = useState(paperlessDocumentId);
  if (shownDocumentId !== paperlessDocumentId) {
    setShownDocumentId(paperlessDocumentId);
    setLinks(null);
    setLoadFailed(false);
    setAddError(null);
  }

  /** Reloads in place (no loading state), resolving once the rows are current. */
  const reload = useCallback(async () => {
    const result = await listDocumentLinksForDocument(paperlessDocumentId);
    setLinks(result);
  }, [paperlessDocumentId]);

  const rows = useMemo(
    () =>
      links === null
        ? null
        : links.map((link) =>
            toLinkedToRow(link, {
              kindWord: t(I18N_UNION_KEYS.documentLinkKind.key(link.entityType)),
              unavailableLabel: t('sheet.unavailableObject'),
              invoiceNouns: {
                invoice: tCommon('navigation.invoice'),
                offer: tCommon('navigation.offer'),
              },
            }),
          ),
    [links, t, tCommon],
  );

  // Tasks and purchases this document is already linked to are not offered again.
  const excludeIds = useMemo(
    () =>
      (links ?? []).flatMap((link) =>
        link.entityType === 'work_item' || link.entityType === 'household_item'
          ? [itemValue({ type: link.entityType, id: link.entityId })]
          : [],
      ),
    [links],
  );

  const add = async (value: string, option: EntityOption | null, close: () => void) => {
    // The picker only emits values `itemValue` built.
    const target = parseItemValue(value)!;
    setAddError(null);
    let created;
    try {
      created = await createDocumentLink({
        entityType: target.type,
        entityId: target.id,
        paperlessDocumentId,
      });
    } catch (err) {
      // The picker stays open with the reason; nothing changed, so nothing is refreshed.
      setAddError(actionError(err, tErrors, t('panel.failedToLink')));
      return;
    }
    await reload();
    onLinksChanged();
    close();
    showUndoToast({
      message: t('sheet.linked', { title: option?.label ?? '' }),
      dedupeKey: `documents-library-link-${created.id}`,
      onUndo: async () => {
        await deleteDocumentLink(created.id);
        await reload();
        onLinksChanged();
      },
    });
  };

  return (
    <RelatedList
      title={t('sheet.linkedTo')}
      headingLevel={3}
      rows={rows}
      loadError={loadFailed ? t('sheet.loadFailed') : null}
      onRetry={() => setReloadKey((key) => key + 1)}
      emptyMessage={t('sheet.notLinked')}
      linkState={originState}
      testId="documents-library-linked-to"
      removeLabel={t('panel.unlink')}
      removedMessage={(row) => t('sheet.unlinked', { title: row.title })}
      onRemove={async (row) => {
        const { undo } = await deleteDocumentLink(row.id);
        await reload();
        onLinksChanged();
        return undo;
      }}
      onRestored={async () => {
        await reload();
        onLinksChanged();
      }}
      action={{
        kind: 'picker',
        label: t('sheet.linkTo'),
        renderPicker: ({ close }) => (
          <div>
            <EntityPicker
              kind="taskOrPurchase"
              value=""
              clearOnSelect
              autoFocus
              excludeIds={excludeIds}
              onChange={(value, option) => void add(value, option, close)}
            />
            <FormError message={addError} />
          </div>
        ),
      }}
    />
  );
}

export default DocumentLinkedToList;
