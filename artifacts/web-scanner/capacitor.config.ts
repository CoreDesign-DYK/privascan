import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.privascan.app',
  appName: 'PrivaScan',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
  },
  android: {
    // Edge-to-edge: the WebView draws under the status bar and nav bar.
    // Safe-area insets (env(safe-area-inset-*)) are then available in CSS
    // so the scanner UI can pad itself appropriately.
    edgeToEdgeEnabled: true,
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
  },
};

export default config;
