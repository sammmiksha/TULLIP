import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface AppLockStatus {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  locked: boolean;
  method: 'device_credential' | 'unavailable';
  authenticated?: boolean;
}

interface AppLockPlugin {
  status(): Promise<AppLockStatus>;
  enable(): Promise<AppLockStatus>;
  disable(): Promise<AppLockStatus>;
  authenticate(): Promise<AppLockStatus>;
  lock(): Promise<AppLockStatus>;
  addListener(event: 'lockStateChanged', listener: (state: AppLockStatus) => void): Promise<PluginListenerHandle>;
}

const nativeLock = registerPlugin<AppLockPlugin>('AppLock');
export const unavailableLock: AppLockStatus = {
  supported: false, available: false, enabled: false, locked: false, method: 'unavailable',
};

export const isNativeAppLock = () => Capacitor.getPlatform() === 'android';

export function appLockStatus(): Promise<AppLockStatus> {
  return isNativeAppLock() ? nativeLock.status() : Promise.resolve({ ...unavailableLock });
}

export async function appLockAction(action: 'enable' | 'disable' | 'authenticate' | 'lock'): Promise<AppLockStatus> {
  if (!isNativeAppLock()) throw new Error('App lock is available in the Android app.');
  return nativeLock[action]();
}

export async function observeAppLock(listener: (state: AppLockStatus) => void): Promise<PluginListenerHandle> {
  if (!isNativeAppLock()) return { remove: async () => {} };
  return nativeLock.addListener('lockStateChanged', listener);
}
