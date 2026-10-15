import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

interface ValueProps {
  value: string;
  onChange: (id: string) => void;
}

/**
 * Wraps a picker so it is owned by a parent the way a real host owns it: `onChange` stores the
 * id (so `value` follows the selection) and is also forwarded to the test's spy. A new `value`
 * prop replaces the stored one, which models the host resetting it.
 */
export function withControlledValue<P extends ValueProps>(Picker: ComponentType<P>) {
  function Controlled(props: P) {
    const [current, setCurrent] = useState(props.value);
    useEffect(() => {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- mirrors a host prop change
      setCurrent(props.value);
    }, [props.value]);
    return (
      <Picker
        {...props}
        value={current}
        onChange={(id) => {
          setCurrent(id);
          props.onChange(id);
        }}
      />
    );
  }
  return Controlled;
}
