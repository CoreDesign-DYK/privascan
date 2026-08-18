/**
 * update-check.ts
 * Centralised version-check utilities.
 *
 * PWA path  → handled by Service Worker (sw-registration.ts).
 * Capacitor → extend checkForNativeUpdate() with @capacitor/app when wrapping.
 *
 * Usage (Capacitor, future):
 *   import { App } from '@capacitor/app';
 *   const info = await App.getInfo();          // { version, build }
 *   const latest = await fetchLatestVersion(); // from your API
 *   if (semverGt(latest, info.version)) showForceUpdateDialog();
 */

export type UpdateType = 'none' | 'optional' | 'required';

export interface VersionCheckResult {
  updateType: UpdateType;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
}

/** Current app version injected by Vite at build time. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/**
 * PWA: update detection is done via Service Worker (sw-registration.ts).
 * This stub is here so the call-site is the same when Capacitor is added.
 *
 * --- Capacitor implementation (replace stub body) ---
 * import { App } from '@capacitor/app';
 * const { version } = await App.getInfo();
 * const res = await fetch('https://api.privascan.app/version');
 * const { latest, required } = await res.json();
 * return {
 *   updateType: semverGt(latest, version) ? (required ? 'required' : 'optional') : 'none',
 *   currentVersion: version,
 *   latestVersion: latest,
 * };
 */
export async function checkForNativeUpdate(): Promise<VersionCheckResult> {
  return {
    updateType: 'none',
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
  };
}

/** Simple semver greater-than check (major.minor.patch). */
export function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPatch > bPatch;
}
