import { describe, it, expect, jest } from '@jest/globals';
import { render } from '@testing-library/react';
import { ImmersiveShellContext } from '../components/AppShell/immersiveShellContext.js';
import { useImmersiveShell } from './useImmersiveShell.js';

function Page({ enabled }: { enabled: boolean }) {
  useImmersiveShell(enabled);
  return null;
}

function setup(enabled: boolean) {
  const unregister = jest.fn();
  const register = jest.fn(() => unregister);
  const shell = { register };
  const view = render(
    <ImmersiveShellContext value={shell}>
      <Page enabled={enabled} />
    </ImmersiveShellContext>,
  );
  const rerenderWith = (next: boolean) =>
    view.rerender(
      <ImmersiveShellContext value={shell}>
        <Page enabled={next} />
      </ImmersiveShellContext>,
    );
  return { register, unregister, rerenderWith, ...view };
}

describe('useImmersiveShell', () => {
  it('registers with the shell while enabled', () => {
    const { register, unregister } = setup(true);
    expect(register).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();
  });

  it('does not register while disabled', () => {
    const { register } = setup(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('unregisters on unmount', () => {
    const { unregister, unmount } = setup(true);
    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('unregisters when disabled later and registers again when re-enabled', () => {
    const { register, unregister, rerenderWith } = setup(true);
    rerenderWith(false);
    expect(unregister).toHaveBeenCalledTimes(1);
    rerenderWith(true);
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('is a no-op outside an app shell', () => {
    expect(() => render(<Page enabled />)).not.toThrow();
  });
});
