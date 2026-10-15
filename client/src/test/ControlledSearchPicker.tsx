import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { SearchPicker } from '../components/SearchPicker/SearchPicker.js';

/**
 * A SearchPicker owned by a parent the way every real host owns it: `onChange` stores the id
 * (so the picker's `value` follows the selection) and is also forwarded to the test's spy.
 * A new `value` prop (a rerender) replaces the stored one, which models the host resetting it.
 * `resetOnChange` makes the host answer every change with `''`.
 */
export function ControlledSearchPicker<T>({
  value,
  onChange,
  resetOnChange = false,
  ...rest
}: ComponentProps<typeof SearchPicker<T>> & { resetOnChange?: boolean }) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- mirrors a host prop change
    setCurrent(value);
  }, [value]);
  return (
    <SearchPicker<T>
      {...rest}
      value={current}
      onChange={(id) => {
        setCurrent(resetOnChange ? '' : id);
        onChange(id);
      }}
    />
  );
}
