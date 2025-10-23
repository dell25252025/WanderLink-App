import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wanderlink.app',
  appName: 'WanderLink',
  webDir: 'out',
  server: {
    url: 'http://192.168.100.26:3000',
    cleartext: true,
  },
};

export default config;
