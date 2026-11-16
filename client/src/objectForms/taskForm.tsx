import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WORK_ITEM_STATUSES, routeUrl } from '@cornerstone/shared';
import type { UserResponse, WorkItemStatus } from '@cornerstone/shared';
import { EntityMultiPicker } from '../components/EntityPicker/EntityMultiPicker.js';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import { decodeWho, encodeWho } from '../components/EntityPicker/entityPickerKinds.js';
import type { EntityOption } from '../components/EntityPicker/types.js';
import { CostLineAmountField } from '../components/CostLineForm/CostLineFields.js';
import { CostLineEnteredAs } from '../components/CostLineForm/CostLineEnteredAs.js';
import { readValues } from '../components/CostLineForm/costLineValues.js';
import type { CostLineValues } from '../components/CostLineForm/costLineValues.js';
import { FormError } from '../components/FormError/FormError.js';
import { fieldsForScope } from '../components/ObjectForm/objectFormState.js';
import type {
  ObjectFormErrors,
  ObjectFormScope,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import type { KnownCompany } from '../hooks/useCompanyName.js';
import { useAreas } from '../hooks/useAreas.js';
import { useStatusBadgeVariants } from '../hooks/useStatusBadgeVariants.js';
import { createDependency } from '../lib/dependenciesApi.js';
import { listUsers } from '../lib/usersApi.js';
import { createWorkItemBudget } from '../lib/workItemBudgetsApi.js';
import { createWorkItem } from '../lib/workItemsApi.js';
import { AreaField } from './AreaField.js';
import { useCompanyFormSchema } from './companyForm.js';
import type { CompanyOption } from './companyForm.js';

/** The tasks chosen in "Waits for"; the field value is the chosen options. */
function chosenTasks(value: unknown): readonly EntityOption[] {
  return Array.isArray(value) ? (value as EntityOption[]) : [];
}

/** The cost-line value view of the Planned cost fields (direct amount, no existing line). */
function plannedCostValues(values: ObjectFormValues): CostLineValues {
  return readValues({
    pricing: 'direct',
    amount: String(values.plannedAmount ?? ''),
    includesVat: values.plannedIncludesVat === true,
  });
}

export interface TaskFormOptions {
  /** Default 'create' (the dialog). 'edit' = the task page cards. */
  readonly scope?: ObjectFormScope;
  /**
   * Members the host already loaded: the hook then skips its own listUsers request. Edit scope
   * never requests them (the Who card passes the page's members).
   */
  readonly users?: readonly UserResponse[];
  /** The company currently set on the task (edit): its name shows in the Who picker. */
  readonly knownCompany?: KnownCompany | null;
}

export interface TaskValueMessages {
  readonly titleRequired: string;
  readonly duration: string;
  readonly constraints: string;
  readonly finishedBeforeStarted: string;
  readonly amount: string;
}

/** The messages of `validateTaskValues` (translation only, no requests). */
export function useTaskValueMessages(): TaskValueMessages {
  const { t } = useTranslation('workItems');
  const { t: tCost } = useTranslation('costLines');
  return {
    titleRequired: t('create.fields.titleRequiredError'),
    duration: t('create.fields.durationError'),
    constraints: t('create.fields.constraintsError'),
    finishedBeforeStarted: t('taskPage.timing.finishedBeforeStarted'),
    amount: tCost('form.errorAmount'),
  };
}

/** Every task rule, dialog and cards alike; keys are field names (missing keys read as ''). */
export function validateTaskValues(
  values: ObjectFormValues,
  messages: TaskValueMessages,
): ObjectFormErrors {
  const text = (key: string): string => String(values[key] ?? '');
  const errors: Record<string, string> = {};
  if (!text('title').trim()) errors.title = messages.titleRequired;
  const duration = text('durationDays').trim();
  if (duration !== '' && !/^\d+$/.test(duration)) errors.durationDays = messages.duration;
  const after = text('startAfter');
  const before = text('startBefore');
  if (after && before && after > before) errors.startBefore = messages.constraints;
  const started = text('actualStartDate');
  const finished = text('actualEndDate');
  if (started && finished && finished < started) {
    errors.actualEndDate = messages.finishedBeforeStarted;
  }
  const planned = text('plannedAmount').trim();
  if (planned !== '' && !(Number(planned) >= 0)) errors.plannedAmount = messages.amount;
  return errors;
}

/**
 * The task form: the New task dialog (default) and, with `scope: 'edit'`, the fields of the task
 * page cards. Planned cost (amount + Net/Gross) creates the task's first cost line after the task.
 */
export function useTaskFormSchema(options: TaskFormOptions = {}): ObjectFormSchema {
  const { scope = 'create', users: hostUsers } = options;
  const { t } = useTranslation('workItems');
  const { t: tc } = useTranslation('common');
  const { t: tCost } = useTranslation('costLines');
  const messages = useTaskValueMessages();
  const companySchema = useCompanyFormSchema();
  const statusVariants = useStatusBadgeVariants();
  const { areas, isLoading: areasLoading } = useAreas();

  const [loadedUsers, setLoadedUsers] = useState<UserResponse[]>([]);
  const [createdCompany, setCreatedCompany] = useState<CompanyOption | null>(null);
  const hostProvidesUsers = hostUsers !== undefined || scope === 'edit';
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'failed'>(
    hostProvidesUsers ? 'ready' : 'loading',
  );
  const users = hostUsers ?? loadedUsers;

  useEffect(() => {
    if (hostProvidesUsers) return;
    let cancelled = false;
    async function loadData() {
      try {
        const usersResponse = await listUsers();
        if (cancelled) return;
        setLoadedUsers(usersResponse.users.filter((u) => !u.deactivatedAt));
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
  }, [hostProvidesUsers]);

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
      plannedAmount: '',
      plannedIncludesVat: false,
    },
    fields: fieldsForScope(
      [
        {
          name: 'title',
          label: t('create.fields.title'),
          kind: 'text',
          essential: true,
          required: true,
          maxLength: 500,
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
                knownCompany={createdCompany ?? options.knownCompany ?? null}
                value={typeof ctx.value === 'string' ? ctx.value : ''}
                onChange={ctx.setValue}
                disabled={ctx.busy}
                // The dialog continues in a child step (dialogs never stack); the new company
                // is set on this field when it is saved. The page cards keep the picker's own.
                create={
                  scope === 'create'
                    ? (query) => {
                        ctx.createChild({
                          schema: companySchema,
                          prefill: { name: query },
                          onCreated: (result) => {
                            setCreatedCompany({ id: result.id, name: result.label });
                            ctx.setValue(encodeWho({ vendorId: result.id }));
                          },
                        });
                        return Promise.resolve(null);
                      }
                    : undefined
                }
              />
              <FormError
                variant="field"
                message={dataState === 'failed' ? t('create.errors.loadFailed') : null}
              />
            </>
          ),
        },
        {
          name: 'plannedAmount',
          label: t('create.fields.plannedCost'),
          hint: t('create.fields.plannedCostHint'),
          kind: 'custom',
          essential: true,
          scope: 'create',
          render: (ctx) => <CostLineAmountField ctx={ctx} values={plannedCostValues(ctx.values)} />,
        },
        {
          name: 'plannedIncludesVat',
          label: tCost('form.enteredAs'),
          kind: 'custom',
          group: true,
          essential: true,
          scope: 'create',
          render: (ctx) => (
            <CostLineEnteredAs
              id={ctx.id}
              values={plannedCostValues(ctx.values)}
              onChange={ctx.setValue}
              busy={ctx.busy}
              describedBy={ctx.describedBy}
            />
          ),
        },
        {
          name: 'durationDays',
          label: t('create.fields.durationDays'),
          kind: 'number',
          essential: true,
          width: 'half',
          min: 0,
          step: 1,
          inputMode: 'numeric',
          placeholder: '0',
        },
        {
          name: 'description',
          label: t('create.fields.description'),
          kind: 'textarea',
          maxLength: 10000,
          placeholder: t('create.fields.descriptionPlaceholder'),
        },
        {
          // The page's header status menu owns status.
          name: 'status',
          label: t('create.fields.status'),
          kind: 'select',
          scope: 'create',
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
          scope: 'create',
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
        {
          name: 'actualStartDate',
          label: t('taskPage.timing.started'),
          kind: 'date',
          scope: 'edit',
        },
        {
          name: 'actualEndDate',
          label: t('taskPage.timing.finished'),
          kind: 'date',
          scope: 'edit',
        },
      ],
      scope,
    ),
    validate: (values: ObjectFormValues): ObjectFormErrors => validateTaskValues(values, messages),
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

      // Planned cost: the first cost line. An empty amount creates none, a 0 creates a zero line.
      const planned = String(values.plannedAmount ?? '').trim();
      let costLineFailed = false;
      if (planned !== '') {
        try {
          // Net by default; sent explicitly because the server defaults includesVat to true.
          // No category, no funding source: both are set later in the Cost tab.
          await createWorkItemBudget(workItem.id, {
            description: title,
            plannedAmount: Number(planned),
            includesVat: values.plannedIncludesVat === true,
          });
        } catch {
          costLineFailed = true;
        }
      }

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

      const query: Record<string, string> = {};
      if (failed.length > 0) {
        query.tab = 'timing';
        query.depError = failed.join(', ');
      }
      if (costLineFailed) {
        if (failed.length === 0) query.tab = 'cost';
        query.costLineFailed = '1';
      }

      return {
        id: workItem.id,
        href: routeUrl(
          'workItem',
          { id: workItem.id },
          Object.keys(query).length > 0 ? query : undefined,
        ),
        label: title,
        incomplete: failed.length > 0 || costLineFailed,
      };
    },
    addedMessage: (result) => t('create.added', { title: result.label }),
  };
}
