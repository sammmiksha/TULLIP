import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tullip.journal',
  appName: 'TULLIP',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
      androidBiometric: { biometricAuth: false }
    }
  }
};

export default config;
