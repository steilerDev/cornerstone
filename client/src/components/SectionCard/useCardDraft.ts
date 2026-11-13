import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';

type Draft<K extends string> = Readonly<Record<K, string>>;

export interface CardDraftOptions<K extends string> {
  readonly initial: Draft<K>;
  readonly validate: (draft: Draft<K>) => Partial<Record<K, string>>;
  readonly save: (draft: Draft<K>) => Promise<unknown>;
  /** Shown when the save failed without an API error code. */
  readonly saveError: string;
  readonly onSaved: () => Promise<void>;
}

/** The draft, field errors and explicit Save of one detail card. */
export function useCardDraft<K extends string>({
  initial,
  validate,
  save: persist,
  saveError,
  onSaved,
}: CardDraftOptions<K>) {
  const { t: tErrors } = useTranslation('errors');
  const [draft, setDraft] = useState<Draft<K>>(initial);
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const keys = Object.keys(initial) as K[];
  const dirty = keys.some((key) => draft[key] !== initial[key]);

  const discard = () => {
    setDraft(initial);
    setErrors({});
    setBanner(null);
  };

  const save = async (): Promise<boolean> => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return false;
    try {
      await persist(draft);
    } catch (err) {
      setBanner(
        err instanceof ApiClientError ? translateApiError(err.error.code, tErrors) : saveError,
      );
      return false;
    }
    setBanner(null);
    // The PATCH succeeded: a failed refresh is the page's own error state, not a failed save.
    await onSaved();
    return true;
  };

  const set = (field: K, value: string) => setDraft((prev) => ({ ...prev, [field]: value }));

  return { draft, set, errors, banner, dirty, discard, save };
}
