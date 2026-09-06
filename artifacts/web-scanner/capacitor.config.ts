import type { CapacitorConfig } from '@capacitor/cli';

const rawLiveReloadUrl = process.env.CAPACITOR_LIVE_RELOAD_URL?.trim();
let liveReloadUrl: string | undefined;
if (rawLiveReloadUrl) {
  const parsedUrl = new URL(rawLiveReloadUrl);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw new Error(
      'CAPACITOR_LIVE_RELOAD_URL must be a credential-free HTTPS URL.',
    );
  }
  liveReloadUrl = parsedUrl.toString().replace(/\/$/, '');
}

const config: CapacitorConfig = {
  appId: 'com.privascan.app',
  appName: 'PrivaScan',
  webDir: 'dist/public',
  server: {
    ...(liveReloadUrl ? { url: liveReloadUrl } : {}),
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
