/**
 * pin-storage.ts
 * App PIN persistence, verification, and biometric (WebAuthn) helpers.
 * All data lives in localStorage only — nothing is sent to any server.
 */

const K = {
  HASH:        'privascan_pin_hash',
  ENABLED:     'privascan_pin_enabled',
  BIO_ON:      'privascan_biometric_enabled',
  BIO_CRED:    'privascan_biometric_cred_id',
  TIMEOUT:     'privascan_pin_timeout',   // minutes: 0=immediately,1,5,15,60
  HIDDEN_AT:   'privascan_hidden_at',     // epoch ms when app went to background
} as const;

/* ── PIN hash ─────────────────────────────────────────────────────────────── */
async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode('privascan_v1_salt_' + pin);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ── PIN enable / verify / disable ───────────────────────────────────────── */
export async function enablePin(pin: string): Promise<void> {
  localStorage.setItem(K.HASH,    await hashPin(pin));
  localStorage.setItem(K.ENABLED, 'true');
}

export function isPinEnabled(): boolean {
  return localStorage.getItem(K.ENABLED) === 'true';
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(K.HASH);
  if (!stored) return false;
  return (await hashPin(pin)) === stored;
}

export function disablePin(): void {
  [K.HASH, K.ENABLED, K.BIO_ON, K.BIO_CRED, K.TIMEOUT, K.HIDDEN_AT].forEach(k =>
    localStorage.removeItem(k),
  );
}

/* ── Timeout ──────────────────────────────────────────────────────────────── */
export const TIMEOUT_OPTIONS: { label: string; minutes: number }[] = [
  { label: 'Immediately',  minutes: 0  },
  { label: 'After 1 min',  minutes: 1  },
  { label: 'After 5 min',  minutes: 5  },
  { label: 'After 15 min', minutes: 15 },
  { label: 'After 1 hour', minutes: 60 },
];

export function getPinTimeout(): number {
  return parseInt(localStorage.getItem(K.TIMEOUT) ?? '1', 10);
}

export function setPinTimeout(minutes: number): void {
  localStorage.setItem(K.TIMEOUT, String(minutes));
}

/* ── Background tracking ──────────────────────────────────────────────────── */
export function recordHiddenAt(): void {
  localStorage.setItem(K.HIDDEN_AT, String(Date.now()));
}

export function isLockRequired(): boolean {
  if (!isPinEnabled()) return false;
  const hiddenStr = localStorage.getItem(K.HIDDEN_AT);
  if (!hiddenStr) return true;          // never tracked → lock by default
  const elapsed = (Date.now() - parseInt(hiddenStr, 10)) / 60_000; // minutes
  const timeout = getPinTimeout();
  if (timeout === 0) return true;       // "Immediately" — always lock
  return elapsed >= timeout;
}

/* ── Biometric (WebAuthn platform authenticator) ─────────────────────────── */
export function isBiometricEnabled(): boolean {
  return localStorage.getItem(K.BIO_ON) === 'true';
}

export async function checkBiometricSupport(): Promise<boolean> {
  if (typeof PublicKeyCredential === 'undefined') return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerBiometric(): Promise<boolean> {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'PrivaScan' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'privascan_pin_user',
          displayName: 'PrivaScan',
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60_000,
      },
    }) as PublicKeyCredential | null;
    if (!cred) return false;
    const b64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
    localStorage.setItem(K.BIO_CRED, b64);
    localStorage.setItem(K.BIO_ON,   'true');
    return true;
  } catch {
    return false;
  }
}

export async function verifyBiometric(): Promise<boolean> {
  const b64 = localStorage.getItem(K.BIO_CRED);
  if (!b64) return false;
  try {
    const credId = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const result = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: credId, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return result !== null;
  } catch {
    return false;
  }
}

export function disableBiometric(): void {
  localStorage.removeItem(K.BIO_ON);
  localStorage.removeItem(K.BIO_CRED);
}
