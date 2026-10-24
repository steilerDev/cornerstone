import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WORK_ITEM_STATUSES, routeUrl } from '@cornerstone/shared';
import type { DependencyType, UserResponse, WorkItemStatus } from '@cornerstone/shared';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import { decodeWho, encodeWho } from '../components/EntityPicker/entityPickerKinds.js';
import {
  DependencySentenceBuilder,
  THIS_ITEM_ID,
  dependencyTypeToVerbs,
} from '../components/DependencySentenceBuilder/index.js';
import { FormError } from '../components/FormError/FormError.js';
import type {
  ObjectFormErrors,
  ObjectFormRenderContext,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { useAreas } from '../hooks/useAreas.js';
import { useStatusBadgeVariants } from '../hooks/useStatusBadgeVariants.js';
import { createDependency } from '../lib/dependenciesApi.js';
import { listUsers } from '../lib/usersApi.js';
import { createWorkItem } from '../lib/workItemsApi.js';
import { AreaField } from './AreaField.js';
import { useCompanyFormSchema } from './companyForm.js';
import type { CompanyOption } from './companyForm.js';
import styles from './objectForms.module.css';

interface PendingDependency {
  predecessorId: string; // THIS_ITEM_ID or real ID
  successorId: string; // THIS_ITEM_ID or real ID
  otherItemId: string; // The non-"this" item's real ID
  otherItemTitle: string;
  dependencyType: DependencyType;
}

interface DependenciesFieldProps {
  readonly ctx: ObjectFormRenderContext;
}

/** Sentence builder plus the list of dependencies that are created together with the task. */
function DependenciesField({ ctx }: DependenciesFieldProps) {
  const { t } = useTranslation('workItems');
  const pending = Array.isArray(ctx.value) ? (ctx.value as PendingDependency[]) : [];
  const excludedIds = pending.map((d) => d.otherItemId);

  return (
    <div className={styles.dependenciesSection}>
      <DependencySentenceBuilder
        thisItemId={THIS_ITEM_ID}
        thisItemLabel={t('create.thisItemLabel')}
        excludeIds={excludedIds}
        disabled={ctx.busy}
        onAdd={(data) => {
          const otherItemId =
            data.predecessorId === THIS_ITEM_ID ? data.successorId : data.predecessorId;
          if (pending.some((d) => d.otherItemId === otherItemId)) return;
          ctx.setValue([
            ...pending,
            {
              predecessorId: data.predecessorId,
              successorId: data.successorId,
              otherItemId,
              otherItemTitle: data.otherItemTitle,
              dependencyType: data.dependencyType,
            },
          ]);
        }}
      />
      {pending.length > 0 && (
        <ul
          className={styles.pendingDependenciesList}
          aria-label={t('create.pendingDeps.ariaLabel')}
        >
          {pending.map((dep) => {
            const { predecessorVerb, successorVerb } = dependencyTypeToVerbs(dep.dependencyType);
            const sentence = t(
              dep.predecessorId === THIS_ITEM_ID
                ? 'create.pendingDeps.thisItemPredecessor'
                : 'create.pendingDeps.otherItemPredecessor',
              { predecessorVerb, successorVerb, otherItemTitle: dep.otherItemTitle },
            );
            return (
              <li key={dep.otherItemId} className={styles.pendingDependencyChip}>
                <span className={styles.chipSentence}>{sentence}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  onClick={() =>
                    ctx.setValue(pending.filter((d) => d.otherItemId !== dep.otherItemId))
                  }
                  aria-label={t('create.pendingDeps.removeAriaLabel', {
                    otherItemTitle: dep.otherItemTitle,
                  })}
                  disabled={ctx.busy}
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The New task form: a 1:1 port of the former create page. */
export function useTaskFormSchema(): ObjectFormSchema {
  const { t } = useTranslation('workItems');
  const { t: tc } = useTranslation('common');
  const companySchema = useCompanyFormSchema();
  const statusVariants = useStatusBadgeVariants();
  const { areas, isLoading: areasLoading } = useAreas();

  const [users, setUsers] = useState<UserResponse[]>([]);
  const [createdCompany, setCreatedCompany] = useState<CompanyOption | null>(null);
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const usersResponse = await listUsers();
        if (cancelled) return;
        setUsers(usersResponse.users.filter((u) => !u.deactivatedAt));
        setDataState('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load data:', err);
        setDataState('failed');
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const dataLoading = dataState === 'loading';

  return {
    id: 'task',
    title: tc('navigation.newTask'),
    addAnother: true,
    prefill: { areaId: 'area' },
    initialValues: {
      title: '',
      area: '',
      assignment: '',
      durationDays: '',
      description: '',
      status: 'not_started',
      startAfter: '',
      startBefore: '',
      dependencies: [],
    },
    fields: [
      {
        name: 'title',
        label: t('create.fields.title'),
        kind: 'text',
        essential: true,
        required: true,
        placeholder: t('create.fields.titlePlaceholder'),
      },
      {
        name: 'area',
        label: t('create.fields.area'),
        kind: 'custom',
        essential: true,
        keep: true,
        options: areas.map((a) => ({ value: a.id, label: a.name })),
        optionsLoading: areasLoading,
        render: (ctx) => <AreaField ctx={ctx} areas={areas} preview />,
      },
      {
        name: 'assignment',
        label: t('create.fields.assignedTo'),
        kind: 'custom',
        essential: true,
        optionsLoading: dataLoading,
        render: (ctx) => (
          <>
            <EntityPicker
              kind="who"
              id={ctx.id}
              users={users}
              knownCompany={createdCompany}
              value={typeof ctx.value === 'string' ? ctx.value : ''}
              onChange={ctx.setValue}
              disabled={ctx.busy}
              // The form continues in a child step (dialogs never stack); the new company
              // is set on this field when it is saved.
              create={(query) => {
                ctx.createChild({
                  schema: companySchema,
                  prefill: { name: query },
                  onCreated: (result) => {
                    setCreatedCompany({ id: result.id, name: result.label });
                    ctx.setValue(encodeWho({ vendorId: result.id }));
                  },
                });
                return Promise.resolve(null);
              }}
            />
            <FormError
              variant="field"
              message={dataState === 'failed' ? t('create.errors.loadFailed') : null}
            />
          </>
        ),
      },
      {
        name: 'durationDays',
        label: t('create.fields.durationDays'),
        kind: 'number',
        essential: true,
        width: 'half',
        min: 0,
        placeholder: '0',
      },
      {
        name: 'description',
        label: t('create.fields.description'),
        kind: 'textarea',
        placeholder: t('create.fields.descriptionPlaceholder'),
      },
      {
        name: 'status',
        label: t('create.fields.status'),
        kind: 'select',
        options: WORK_ITEM_STATUSES.map((status) => ({
          value: status,
          label: statusVariants.task[status].label,
        })),
      },
      {
        name: 'startAfter',
        label: t('create.fields.startAfter'),
        kind: 'date',
        width: 'half',
      },
      {
        name: 'startBefore',
        label: t('create.fields.startBefore'),
        kind: 'date',
        width: 'half',
      },
      {
        name: 'dependencies',
        label: t('create.fields.dependencies'),
        kind: 'custom',
        render: (ctx) => <DependenciesField ctx={ctx} />,
      },
    ],
    validate: (values: ObjectFormValues): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!String(values.title ?? '').trim()) {
        errors.title = t('create.fields.titleRequiredError');
      }
      const duration = String(values.durationDays ?? '');
      if (duration && (isNaN(Number(duration)) || Number(duration) < 0)) {
        errors.durationDays = t('create.fields.durationError');
      }
      const after = String(values.startAfter ?? '');
      const before = String(values.startBefore ?? '');
      if (after && before && after > before) {
        errors.startBefore = t('create.fields.constraintsError');
      }
      return errors;
    },
    submit: async (values) => {
      const title = String(values.title).trim();
      const { userId, vendorId } = decodeWho(String(values.assignment ?? ''));
      const duration = String(values.durationDays ?? '');
      const workItem = await createWorkItem({
        title,
        description: String(values.description ?? '').trim() || null,
        status: values.status as WorkItemStatus,
        durationDays: duration ? Number(duration) : null,
        startAfter: String(values.startAfter ?? '') || null,
        startBefore: String(values.startBefore ?? '') || null,
        areaId: String(values.area ?? '') || null,
        assignedUserId: userId || null,
        assignedVendorId: vendorId || null,
      });

      // Dependencies are created one by one, replacing the sentinel with the new id
      const pending = (values.dependencies as PendingDependency[] | undefined) ?? [];
      const failed: string[] = [];
      for (const dep of pending) {
        try {
          const predecessorId =
            dep.predecessorId === THIS_ITEM_ID ? workItem.id : dep.predecessorId;
          const successorId = dep.successorId === THIS_ITEM_ID ? workItem.id : dep.successorId;
          await createDependency(successorId, {
            predecessorId,
            dependencyType: dep.dependencyType,
          });
        } catch {
          failed.push(dep.otherItemTitle);
        }
      }

      return {
        id: workItem.id,
        href: routeUrl(
          'workItem',
          { id: workItem.id },
          failed.length > 0 ? { depError: failed.join(', ') } : undefined,
        ),
        label: title,
      };
    },
    addedMessage: (result) => t('create.added', { title: result.label }),
  };
}
