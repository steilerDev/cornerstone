import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import { focusPageHeadingWhenReady } from '../lib/focusPageHeading.js';
import { ObjectForm } from '../components/ObjectForm/ObjectForm.js';
import { mapPrefill } from '../components/ObjectForm/objectFormState.js';
import type { ObjectFormSchema } from '../components/ObjectForm/types.js';
import { useAuth } from '../contexts/AuthContext.js';
import { prefillFromSearch } from '../navigation/createQuery.js';
import {
  dialogParentRoute,
  hasCreateOpener,
  matchDialogRoute,
  readBackground,
} from '../navigation/dialogRoutes.js';
import type { DialogRouteId } from '../navigation/dialogRoutes.js';
import { forwardOriginState, originHrefOr } from '../navigation/origin.js';
import { useCompanyFormSchema } from './companyForm.js';
import { useMilestoneFormSchema } from './milestoneForm.js';
import { usePurchaseFormSchema } from './purchaseForm.js';
import { useTaskFormSchema } from './taskForm.js';

interface HeldDialog {
  readonly id: DialogRouteId;
  readonly location: Location;
}

interface DialogViewProps {
  readonly routeId: DialogRouteId;
  readonly schema: ObjectFormSchema;
  /** The dialog's own location (the held one while the form is kept for the discard confirm). */
  readonly formLocation: Location;
  readonly leaveRequested: boolean;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onLeaveResolved: (discard: boolean) => void;
}

function DialogView({
  routeId,
  schema,
  formLocation,
  leaveRequested,
  onDirtyChange,
  onLeaveResolved,
}: DialogViewProps) {
  const navigate = useNavigate();
  const [prefill] = useState(() =>
    mapPrefill(schema, prefillFromSearch(new URLSearchParams(formLocation.search))),
  );
  // Where focus lands when the opener is gone: the New trigger, when the dialog came from it.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    returnFocusRef.current = hasCreateOpener(formLocation.state)
      ? document.querySelector<HTMLElement>('[data-create-trigger]')
      : null;
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- resolved once, at mount
  }, []);

  return (
    <ObjectForm
      schema={schema}
      prefill={prefill}
      returnFocusRef={returnFocusRef}
      leaveRequested={leaveRequested}
      onDirtyChange={onDirtyChange}
      onLeaveResolved={onLeaveResolved}
      onCreated={(result) => {
        void navigate(result.href, {
          replace: true,
          state: forwardOriginState(formLocation.state),
        });
        // The destination renders after this; its heading takes focus once it exists.
        focusPageHeadingWhenReady();
      }}
      onCancel={() => {
        // Leaving on purpose: the host must not treat the pop below as an unguarded Back.
        onDirtyChange(false);
        if (readBackground(formLocation.state)) {
          void navigate(-1);
        } else {
          void navigate(originHrefOr(formLocation.state, routeUrl(dialogParentRoute(routeId))), {
            replace: true,
          });
        }
      }}
    />
  );
}

function TaskDialog(props: Omit<DialogViewProps, 'schema'>) {
  return <DialogView {...props} schema={useTaskFormSchema()} />;
}

function PurchaseDialog(props: Omit<DialogViewProps, 'schema'>) {
  return <DialogView {...props} schema={usePurchaseFormSchema()} />;
}

function MilestoneDialog(props: Omit<DialogViewProps, 'schema'>) {
  return <DialogView {...props} schema={useMilestoneFormSchema()} />;
}

function CompanyDialog(props: Omit<DialogViewProps, 'schema'>) {
  return <DialogView {...props} schema={useCompanyFormSchema()} />;
}

/**
 * Host of the object-form dialogs. Rendered at the router root so it sees the real location
 * (inside `<Routes location>` it would see the page behind). Browser Back out of a dirty form
 * holds the form and asks before discarding.
 */
export function ObjectFormRoutes() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const { user } = useAuth();
  const id = matchDialogRoute(location.pathname);

  const [dirty, setDirty] = useState(false);
  const [held, setHeld] = useState<HeldDialog | null>(null);
  const [previous, setPrevious] = useState<{ location: Location; id: DialogRouteId | null }>({
    location,
    id,
  });
  if (previous.location !== location) {
    setPrevious({ location, id });
    if (previous.id !== null && id === null && navigationType === 'POP' && dirty) {
      setHeld({ id: previous.id, location: previous.location });
    } else if (id !== null && held !== null) {
      setHeld(null);
    }
  }

  const shownId = id ?? held?.id ?? null;
  if (!user || shownId === null) return null;
  const formLocation = id !== null ? location : held!.location;

  const props: Omit<DialogViewProps, 'schema'> = {
    routeId: shownId,
    formLocation,
    leaveRequested: held !== null,
    onDirtyChange: setDirty,
    onLeaveResolved: (discard) => {
      if (discard) {
        setHeld(null);
        setDirty(false);
      } else {
        void navigate(1);
      }
    },
  };

  switch (shownId) {
    case 'workItemNew':
      return <TaskDialog key={shownId} {...props} />;
    case 'householdItemNew':
      return <PurchaseDialog key={shownId} {...props} />;
    case 'milestoneNew':
      return <MilestoneDialog key={shownId} {...props} />;
    case 'companyNew':
      return <CompanyDialog key={shownId} {...props} />;
  }
}

export default ObjectFormRoutes;
