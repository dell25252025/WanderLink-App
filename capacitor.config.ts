
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wanderlink.app',
  appName: 'WanderLink',
  webDir: 'src',  // Changé de .next à src
  server: {
    url: 'http://192.168.1.13:3000', // Assurez-vous que cette IP est correcte
    cleartext: true
  }
};

export default config;
