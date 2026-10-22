import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { HomeSetupResponse, HomeSetupStep } from '@cornerstone/shared';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { useCreateEntryLink } from '../../navigation/useOpenCreate.js';
import { useTagCreate } from '../../objectForms/useTagCreate.js';
import shared from '../../styles/shared.module.css';
import styles from './HomePage.module.css';

export interface SetupChecklistProps {
  setup: HomeSetupResponse;
  /** Loads the checklist state again (after an area was created, or "Try again"). */
  onRefetch: () => void;
  onSkip: () => void;
}

/** "Set up your build": shown instead of the sections until steps 1 to 5 are done, or skipped. */
export function SetupChecklist({ setup, onRefetch, onSkip }: SetupChecklistProps) {
  const { t } = useTranslation('home');
  const originState = useOriginState();
  const tagCreate = useTagCreate();
  const areaButtonRef = useRef<HTMLButtonElement>(null);
  const fundingLink = useCreateEntryLink('fundingSource');
  const companyLink = useCreateEntryLink('company');
  const taskLink = useCreateEntryLink('task');
  const logLink = useCreateEntryLink('diaryEntry');
  const stepSet = I18N_UNION_KEYS.homeSetupStep;
  const hintSet = I18N_UNION_KEYS.homeSetupHint;

  const doneCount = setup.steps.filter((step) => step.done === true).length;

  const linkFor = (step: HomeSetupStep): { to: string; state: unknown } | null => {
    switch (step) {
      case 'house':
        // A section anchor on Settings, not a route.
        return { to: `${routeUrl('settingsManage')}#house`, state: originState };
      case 'areas':
        return tagCreate.request === undefined
          ? { to: routeUrl('areas'), state: originState }
          : null;
      case 'funding':
        return fundingLink;
      case 'companies':
        return companyLink;
      case 'tasks':
        return taskLink;
      case 'household':
        return { to: routeUrl('settingsUsers'), state: originState };
      case 'backups':
        return { to: routeUrl('settingsBackups'), state: originState };
      case 'firstLog':
        return logLink;
    }
  };

  const openAreaForm = () => {
    void tagCreate.request!('area', areaButtonRef.current).then((created) => {
      if (created) onRefetch();
    });
  };

  return (
    <FeedGroup
      heading={t('setup.title')}
      headingDetail={t('setup.progress', { done: doneCount, total: setup.steps.length })}
      list={false}
      testId="home-setup"
    >
      <ol className={styles.steps}>
        {setup.steps.map((step) => {
          const link = linkFor(step.id);
          const label = t(stepSet.key(step.id));
          const labelClass =
            step.done === true ? `${styles.stepLabel} ${styles.stepLabelDone}` : styles.stepLabel;
          let control: ReactNode;
          if (link) {
            control = (
              <NavAnchor
                to={link.to}
                state={link.state}
                className={labelClass}
                data-testid={`home-setup-step-${step.id}`}
              >
                {label}
                <span aria-hidden="true"> ›</span>
              </NavAnchor>
            );
          } else {
            control = (
              <button
                ref={areaButtonRef}
                type="button"
                className={`${labelClass} ${styles.stepButton}`}
                onClick={openAreaForm}
                data-testid={`home-setup-step-${step.id}`}
              >
                {label}
                <span aria-hidden="true"> ›</span>
              </button>
            );
          }
          return (
            <li key={step.id} className={styles.step} data-testid={`home-setup-row-${step.id}`}>
              <span
                aria-hidden="true"
                className={
                  step.done === true
                    ? `${styles.stepGlyph} ${styles.stepGlyphDone}`
                    : step.done === null
                      ? `${styles.stepGlyph} ${styles.stepGlyphUnknown}`
                      : styles.stepGlyph
                }
              >
                {step.done === true ? '✓' : ''}
              </span>
              <div className={styles.stepBody}>
                <span className={shared.srOnly}>
                  {step.done === true ? t('setup.done') : t('setup.todo')}{' '}
                </span>
                {control}
                <span className={styles.stepHint}>{t(hintSet.key(step.id))}</span>
                {step.done === null ? (
                  <span className={styles.stepHint}>
                    {t('setup.cantCheck')}{' '}
                    <button type="button" className={styles.textButton} onClick={onRefetch}>
                      {t('error.retry')}
                    </button>
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div className={styles.skipRow}>
        <button
          type="button"
          className={shared.btnSecondaryCompact}
          onClick={() => {
            onSkip();
            focusPageHeading();
          }}
          data-testid="home-setup-skip"
        >
          {t('setup.skip')}
        </button>
        <span className={styles.muted}>{t('setup.skipHint')}</span>
      </div>
    </FeedGroup>
  );
}
