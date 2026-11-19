import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.canteencorner.kiosk',
  appName: 'Canteen Corner',
  webDir: 'public',
  server: {
    // Evaluation server target:
    // Android Emulator host loopback: http://10.0.2.2:3000
    // Physical tablet on Wi-Fi/LAN: http://<HOST_IP>:3000
    url: process.env.CAPACITOR_SERVER_URL || 'http://10.0.2.2:3000',
    cleartext: true,
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#000000',
  },
};

export default config;
