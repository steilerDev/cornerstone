import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WORK_ITEM_STATUSES, routeUrl } from '@cornerstone/shared';
import type { UserResponse, WorkItemStatus } from '@cornerstone/shared';
import { EntityMultiPicker } from '../components/EntityPicker/EntityMultiPicker.js';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import { decodeWho, encodeWho } from '../components/EntityPicker/entityPickerKinds.js';
import type { EntityOption } from '../components/EntityPicker/types.js';
import { FormError } from '../components/FormError/FormError.js';
import type {
  ObjectFormErrors,
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

/** The tasks chosen in "Waits for"; the field value is the chosen options. */
function chosenTasks(value: unknown): readonly EntityOption[] {
  return Array.isArray(value) ? (value as EntityOption[]) : [];
}

/** The New task form. */
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
        render: (ctx) => (
          <EntityMultiPicker
            id={ctx.id}
            value={chosenTasks(ctx.value)}
            onChange={(next) => ctx.setValue(next)}
            picker={{ kind: 'task', disabled: ctx.busy }}
            removeLabel={(option) => t('create.waitsFor.remove', { title: option.label })}
            countLabel={(count) => t('create.waitsFor.count', { count })}
            invalid={ctx.invalid}
            describedBy={ctx.describedBy}
            testId="task-form-waits-for"
          />
        ),
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

      // "Waits for": finish-to-start, no lag; the type is edited later on the task page.
      const failed: string[] = [];
      for (const predecessor of chosenTasks(values.dependencies)) {
        try {
          await createDependency(workItem.id, {
            predecessorId: predecessor.id,
            dependencyType: 'finish_to_start',
          });
        } catch {
          failed.push(predecessor.label);
        }
      }

      return {
        id: workItem.id,
        href: routeUrl(
          'workItem',
          { id: workItem.id },
          failed.length > 0 ? { tab: 'timing', depError: failed.join(', ') } : undefined,
        ),
        label: title,
      };
    },
    addedMessage: (result) => t('create.added', { title: result.label }),
  };
}
