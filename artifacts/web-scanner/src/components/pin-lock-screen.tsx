/**
 * pin-lock-screen.tsx
 * Full-screen PIN lock overlay shown on app launch / background resume.
 * Supports 4-digit PIN entry and optional biometric (WebAuthn) unlock.
 */
import { useState, useEffect, useCallback } from 'react';
import { Delete } from 'lucide-react';
import { verifyPin, isBiometricEnabled, verifyBiometric } from '@/lib/pin-storage';
import { cn } from '@/lib/utils';

/* ── App logo (same SVG as home-popup) ───────────────────────────────────── */
function AppLogo() {
  return (
    <div className="w-16 h-16 rounded-2xl border border-gray-200 bg-white flex items-center justify-center shadow-md">
      <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
        <path d="M2,12 L2,2 L12,2"     stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
        <path d="M36,2 L46,2 L46,12"   stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
        <path d="M2,36 L2,46 L12,46"   stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
        <path d="M46,36 L46,46 L36,46" stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
        <rect x="13" y="9" width="22" height="30" rx="1.5" fill="#c8d8ea"/>
        <path d="M29,9 L35,15 L29,15 Z" fill="#7a9ab8"/>
        <path d="M29,9 L35,9 L35,15 Z" fill="#c8d8ea"/>
        <line x1="17" y1="20" x2="31" y2="20" stroke="#1e3a5f" strokeWidth="2"   strokeLinecap="round"/>
        <line x1="17" y1="24" x2="29" y2="24" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="17" y1="28" x2="31" y2="28" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="17" y1="32" x2="26" y2="32" stroke="#1e3a5f" strokeWidth="1.6" strokeLinecap="round"/>
        <line x1="7"  y1="24" x2="41" y2="24" stroke="#38bdf8" strokeWidth="2"  strokeLinecap="round" opacity="0.9"/>
      </svg>
    </div>
  );
}

/* ── Face ID icon ─────────────────────────────────────────────────────────── */
function FaceIdIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2 8V5a2 2 0 0 1 2-2h3"/>
      <path d="M17 3h3a2 2 0 0 1 2 2v3"/>
      <path d="M22 16v3a2 2 0 0 1-2 2h-3"/>
      <path d="M7 21H4a2 2 0 0 1-2-2v-3"/>
      <path d="M9 10h.01"/>
      <path d="M15 10h.01"/>
      <path d="M9.5 15a3.5 3.5 0 0 0 5 0"/>
      <path d="M12 7v3"/>
    </svg>
  );
}

/* ── Keypad ───────────────────────────────────────────────────────────────── */
const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const;

interface Props {
  onUnlock: () => void;
}

export function PinLockScreen({ onUnlock }: Props) {
  const [pin,        setPin]        = useState('');
  const [error,      setError]      = useState(false);
  const [shake,      setShake]      = useState(false);
  const [bioAvail,   setBioAvail]   = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  /* check biometric availability */
  useEffect(() => {
    if (isBiometricEnabled()) setBioAvail(true);
  }, []);

  /* auto-trigger PIN check when 4 digits entered */
  useEffect(() => {
    if (pin.length === 4) checkPin(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const checkPin = useCallback(async (value: string) => {
    const ok = await verifyPin(value);
    if (ok) {
      onUnlock();
    } else {
      setShake(true);
      setError(true);
      setTimeout(() => {
        setShake(false);
        setError(false);
        setPin('');
      }, 700);
    }
  }, [onUnlock]);

  /* hardware keyboard support */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setPin(p => p.length < 4 ? p + e.key : p);
      } else if (e.key === 'Backspace') {
        setPin(p => p.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function pressKey(k: string) {
    if (k === '⌫') {
      setPin(p => p.slice(0, -1));
    } else if (k !== '' && pin.length < 4) {
      setPin(p => p + k);
    }
  }

  async function tryBiometric() {
    setBioLoading(true);
    try {
      const ok = await verifyBiometric();
      if (ok) { onUnlock(); return; }
    } catch { /* ignore */ }
    setBioLoading(false);
  }

  return (
    <div className="fixed inset-0 z-[200] bg-[#f5f7fa] flex flex-col items-center justify-between pb-8 pt-16 select-none">

      {/* Top section: logo + dots */}
      <div className="flex flex-col items-center gap-5">
        <AppLogo />
        <div>
          <p className="text-center font-bold text-[20px] text-gray-900 leading-none">
            Priva<span className="text-sky-400">Scan</span>
          </p>
          <p className="text-center text-[13px] text-gray-400 mt-1">Enter your PIN to unlock</p>
        </div>

        {/* 4-dot indicator */}
        <div
          className={cn(
            'flex items-center gap-4 mt-2 transition-all',
            shake && 'animate-[pinShake_0.5s_ease-in-out]',
          )}
        >
          {[0,1,2,3].map(i => (
            <span
              key={i}
              className={cn(
                'w-3.5 h-3.5 rounded-full border-2 transition-all duration-150',
                i < pin.length
                  ? error ? 'border-red-500 bg-red-500' : 'border-[#1e3a5f] bg-[#1e3a5f]'
                  : 'border-gray-300 bg-transparent',
              )}
            />
          ))}
        </div>

        {error && (
          <p className="text-[12px] text-red-500 font-medium -mt-1">Incorrect PIN. Try again.</p>
        )}
      </div>

      {/* Keypad */}
      <div className="flex flex-col items-center gap-3 w-full max-w-[280px] px-4">
        <div className="grid grid-cols-3 gap-3 w-full">
          {KEYS.map((k, i) => {
            if (k === '') return <div key={i} />;
            const isBack = k === '⌫';
            return (
              <button
                key={i}
                onClick={() => pressKey(k)}
                disabled={!isBack && pin.length === 4}
                className={cn(
                  'h-14 rounded-2xl text-[20px] font-semibold flex items-center justify-center transition-all active:scale-95',
                  isBack
                    ? 'text-gray-500 bg-transparent hover:bg-gray-200 active:bg-gray-300'
                    : 'bg-white text-gray-900 shadow-sm hover:bg-gray-100 active:bg-gray-200 border border-gray-100',
                )}
              >
                {isBack ? <Delete className="w-5 h-5" /> : k}
              </button>
            );
          })}
        </div>

        {/* Biometric button */}
        {bioAvail && (
          <button
            onClick={tryBiometric}
            disabled={bioLoading}
            className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-[13px] font-semibold hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
          >
            {bioLoading ? (
              <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FaceIdIcon className="w-5 h-5 text-gray-600" />
            )}
            Use Face ID / Touch ID
          </button>
        )}

        {/* Forgot PIN */}
        <button
          onClick={() => {
            // Show hint — full reset requires disabling PIN from Settings
            alert(
              'Forgot your PIN?\n\nIf you remember your PrivaScan account email, you can reset your PIN by:\n1. Reinstalling the app (all unsaved scans will be lost)\n\nTip: Always export important documents before uninstalling.',
            );
          }}
          className="text-[12px] text-gray-400 hover:text-gray-600 mt-1 transition-colors"
        >
          Forgot PIN?
        </button>
      </div>

      <style>{`
        @keyframes pinShake {
          0%,100% { transform: translateX(0);    }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px);  }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px);  }
        }
      `}</style>
    </div>
  );
}
