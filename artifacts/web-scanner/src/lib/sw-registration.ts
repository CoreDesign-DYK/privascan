/**
 * sw-registration.ts
 * Service Worker registration and update detection.
 *
 * Flow:
 *   1. Register /sw.js when the page loads.
 *   2. If a new SW is found (updatefound) and reaches "installed" state
 *      while a controller already exists → call onUpdate().
 *   3. App shows "Update Available" banner.
 *   4. User taps "Update Now" → applyUpdate() → sends SKIP_WAITING → reloads.
 */

type UpdateCallback = () => void;

// Prevent duplicate controllerchange listeners
let _reloadScheduled = false;

export function registerServiceWorker(onUpdate: UpdateCallback): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const swUrl = `${import.meta.env.BASE_URL}sw.js`;
      const reg = await navigator.serviceWorker.register(swUrl, {
        scope: import.meta.env.BASE_URL,
      });

      // A SW is already waiting from a previous install — show banner immediately
      if (reg.waiting && navigator.serviceWorker.controller) {
        onUpdate();
      }

      // New SW found during this page session
      reg.addEventListener('updatefound', () => {
        const newSw = reg.installing;
        if (!newSw) return;

        newSw.addEventListener('statechange', () => {
          // "installed" + existing controller = new version ready to take over
          if (newSw.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdate();
          }
        });
      });

      // Poll for updates every 60 s (useful for long-lived sessions)
      setInterval(() => { reg.update().catch(() => {}); }, 60_000);

    } catch (err) {
      // SW not available in dev/HTTP — silent
      console.warn('[SW] registration skipped:', err);
    }
  });
}

/**
 * Tell the waiting SW to take over, then reload once it does.
 * Called when the user taps "Update Now" in the banner.
 */
export function applyUpdate(): void {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready.then((reg) => {
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });

  // Reload exactly once when the new SW takes control
  if (!_reloadScheduled) {
    _reloadScheduled = true;
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true },
    );
  }
}
