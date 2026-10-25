import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: 'web',
  status: vi.fn(), enable: vi.fn(), disable: vi.fn(), authenticate: vi.fn(), lock: vi.fn(), addListener: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => native.platform },
  registerPlugin: () => native,
}));

import { appLockAction, appLockStatus, observeAppLock } from './appLock';

beforeEach(() => { native.platform = 'web'; vi.clearAllMocks(); });

describe('app-lock platform boundary', () => {
  it('explicitly reports the browser as unsupported and never fabricates authentication', async () => {
    await expect(appLockStatus()).resolves.toMatchObject({ supported: false, enabled: false, locked: false, method: 'unavailable' });
    await expect(appLockAction('enable')).rejects.toThrow('Android app');
    const listener = vi.fn();
    await (await observeAppLock(listener)).remove();
    expect(native.enable).not.toHaveBeenCalled();
    expect(native.addListener).not.toHaveBeenCalled();
  });

  it('requires the Android bridge result for enable, disable, authentication and manual lock', async () => {
    native.platform = 'android';
    const result = { supported: true, available: true, enabled: true, locked: false, authenticated: true, method: 'device_credential' };
    for (const action of ['enable', 'disable', 'authenticate', 'lock'] as const) {
      native[action].mockResolvedValueOnce(result);
      await expect(appLockAction(action)).resolves.toBe(result);
      expect(native[action]).toHaveBeenCalledOnce();
    }
  });

  it('does not convert cancellation or native failure into a successful unlock', async () => {
    native.platform = 'android';
    const cancelled = { supported: true, available: true, enabled: true, locked: true, authenticated: false, method: 'device_credential' };
    native.authenticate.mockResolvedValueOnce(cancelled);
    await expect(appLockAction('authenticate')).resolves.toMatchObject({ locked: true, authenticated: false });
    native.authenticate.mockRejectedValueOnce(new Error('Credential unavailable'));
    await expect(appLockAction('authenticate')).rejects.toThrow('Credential unavailable');
  });
});
