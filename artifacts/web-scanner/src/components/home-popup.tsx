/**
 * home-popup.tsx
 * Multi-page popup floating over the scanner hero screen.
 * Pages slide left/right within the same fixed-size card.
 *
 * Pages: 0 = main menu  |  1 = sign-in options  |  2 = terms agreement
 */
import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  User, RefreshCw, ScanLine, FileText,
  Settings, HelpCircle, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { onClose: () => void }

type Provider = 'google' | 'apple' | 'phone' | 'email';

/* ── static data ─────────────────────────────────────────────────────────── */
const MENU_ITEMS = [
  { icon: <User      className="w-4 h-4" />, label: 'Account',           action: 'signin' as const },
  { icon: <RefreshCw className="w-4 h-4" />, label: 'Sync',              action: null },
  { icon: <ScanLine  className="w-4 h-4" />, label: 'Scan',              action: 'scan'   as const },
  { icon: <FileText  className="w-4 h-4" />, label: 'Document Settings', action: null },
];
const BOTTOM_ITEMS = [
  { icon: <Settings   className="w-4 h-4" />, label: 'Settings', action: null },
  { icon: <HelpCircle className="w-4 h-4" />, label: 'Help',          action: 'help' as const },
];

const SIGN_IN_METHODS: { id: Provider; label: string; bg: string; iconEl: React.ReactNode }[] = [
  {
    id: 'google', label: 'Continue with Google',
    bg: 'bg-white border border-gray-300 hover:bg-gray-50',
    iconEl: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    id: 'apple', label: 'Continue with Apple',
    bg: 'bg-black hover:bg-gray-900',
    iconEl: <svg viewBox="0 0 814 1000" className="w-5 h-5 shrink-0" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-161.8-109.3-100.9-193.7-100.9-288.5c0-167.8 109.3-256.6 216.7-256.6 69.4 0 127.3 45.4 170.8 45.4 41.3 0 106.2-48 187.7-48C643.3 192.3 740.7 230.8 788.1 340.9zm-130.2-89.5c0-71.5 69.3-131.5 69.3-132.9 0-.6-.7-.6-1.3-.6-65.9 0-156.6 73.3-156.6 158.2 0 69.4 56.9 128.4 126.3 128.4 0 0 1.3 0 1.3-.6.1-1.4-38.9-81.6-39-153.5z"/></svg>,
  },
  {
    id: 'phone', label: 'Continue with Phone Number',
    bg: 'bg-blue-500 hover:bg-blue-600',
    iconEl: <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  },
  {
    id: 'email', label: 'Continue with Email',
    bg: 'bg-emerald-500 hover:bg-emerald-600',
    iconEl: <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  },
];

const TERMS_ITEMS = [
  { id: 'age',     label: "I'm at least 14 years old" },
  { id: 'terms',   label: "I agree to PrivaScan's Terms of Service" },
  { id: 'privacy', label: "I agree to PrivaScan's Privacy Policy" },
  { id: 'data',    label: "I agree to PrivaScan's Consent to collection of data" },
];

/* ── App logo SVG ─────────────────────────────────────────────────────────── */
function AppLogo() {
  return (
    <div className="w-14 h-14 rounded-2xl border border-gray-200 bg-white flex items-center justify-center shadow-sm shrink-0">
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

/* ── Main ─────────────────────────────────────────────────────────────────── */
export function HomePopup({ onClose }: Props) {
  const [, setLocation] = useLocation();
  const [page, setPage]             = useState(0);           // 0 main | 1 sign-in | 2 terms
  const [provider, setProvider]     = useState<Provider | null>(null);
  const [checked, setChecked]       = useState<Record<string, boolean>>({});

  function goSignIn() { setPage(1); }
  function goTerms(p: Provider) { setProvider(p); setPage(2); }
  function goBack() { setPage(p => p - 1); }

  function handleAgree() {
    // TODO: trigger real OAuth flow for `provider`
    onClose();
    setLocation('/');
  }

  function handleMenu(action: 'signin' | 'scan' | 'help' | null) {
    if (action === 'signin') { goSignIn(); return; }
    if (action === 'scan')   { onClose();  return; }
    if (action === 'help')   { window.open('mailto:support@privascan.app'); return; }
  }

  const allChecked = TERMS_ITEMS.every(i => checked[i.id]);

  /* card style — same size for all pages */
  const CARD_STYLE: React.CSSProperties = {
    width: '60vw',
    minWidth: 220,
    maxWidth: 360,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80]"
        style={{ background: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
      />

      {/* Card wrapper — overflow hidden so slides don't bleed out */}
      <div
        className="fixed z-[90] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-2xl overflow-hidden bg-white"
        style={CARD_STYLE}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Sliding track: 3 pages side by side ── */}
        <div
          className="flex"
          style={{
            width: '300%',
            transform: `translateX(${-page * (100 / 3)}%)`,
            transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >

          {/* ════ Page 0 — Main menu ════ */}
          <div className="flex flex-col" style={{ width: '33.333%' }}>
            {/* Header */}
            <div className="flex flex-col items-center pt-7 pb-5 px-3 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-1">
                <AppLogo />
                <div>
                  <p className="font-bold text-[18px] tracking-tight text-gray-900 leading-none">
                    Priva<span className="text-sky-400">Scan</span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-tight">
                    Sign in to access<br />more features
                  </p>
                </div>
              </div>

              {/* Provider icon row */}
              <div className="flex items-center gap-2.5 mt-3">
                {SIGN_IN_METHODS.map(m => (
                  <button key={m.id} onClick={() => { onClose(); setLocation('/login'); }} className={cn(
                    'rounded-full flex items-center justify-center shadow-sm transition-opacity active:opacity-70',
                    m.id === 'google' ? 'w-9 h-9 bg-white border-2 border-gray-300' :
                    m.id === 'apple'  ? 'w-9 h-9 bg-black' :
                    m.id === 'phone'  ? 'w-9 h-9 bg-blue-500' : 'w-9 h-9 bg-emerald-500',
                  )}>
                    {m.iconEl}
                  </button>
                ))}
              </div>
            </div>

            {/* Main menu rows */}
            {MENU_ITEMS.map((item, i) => (
              <button key={i} onClick={() => handleMenu(item.action)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100">
                <span className="text-gray-400 shrink-0">{item.icon}</span>
                <span className="flex-1 text-left text-[13px] text-gray-700 font-medium">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}

            <div className="h-2 bg-gray-50 border-y border-gray-100" />

            {BOTTOM_ITEMS.map((item, i) => (
              <button key={i} onClick={() => handleMenu(item.action)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0">
                <span className="text-gray-400 shrink-0">{item.icon}</span>
                <span className="flex-1 text-left text-[13px] text-gray-700 font-medium">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}

            <p className="text-center text-gray-300 text-[10px] py-3">v1.0.0</p>
          </div>

          {/* ════ Page 1 — Sign-in options ════ */}
          <div className="flex flex-col" style={{ width: '33.333%' }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 pt-5 pb-3 border-b border-gray-100">
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <p className="font-semibold text-[15px] text-gray-900">Sign in</p>
            </div>

            <div className="flex flex-col gap-2.5 px-4 py-5">
              {SIGN_IN_METHODS.map(m => (
                <button
                  key={m.id}
                  onClick={() => goTerms(m.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-semibold transition-opacity active:opacity-80',
                    m.id === 'google' ? 'text-gray-800' : 'text-white',
                    m.bg,
                  )}
                >
                  {m.iconEl}
                  {m.label}
                </button>
              ))}
            </div>

            <p className="text-[10px] text-gray-400 text-center px-4 pb-5 leading-relaxed">
              By signing in you agree to PrivaScan's{' '}
              <span className="underline">Terms of Service</span> and{' '}
              <span className="underline">Privacy Policy</span>.
            </p>
          </div>

          {/* ════ Page 2 — Terms agreement ════ */}
          <div className="flex flex-col" style={{ width: '33.333%' }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 pt-5 pb-3 border-b border-gray-100">
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <p className="font-semibold text-[15px] text-gray-900">Accept terms</p>
            </div>

            <p className="text-[11px] text-gray-500 text-center px-4 pt-4 pb-2 leading-snug">
              I'm at least 14 years old, I agree to PrivaScan's{' '}
              <span className="text-emerald-600 underline">Terms of Service</span>,{' '}
              <span className="text-emerald-600 underline">Privacy Policy</span>,{' '}
              Consent to collection of data
            </p>

            <div className="flex flex-col gap-3 px-4 py-3">
              {TERMS_ITEMS.map(item => (
                <button
                  key={item.id}
                  onClick={() => setChecked(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  className="flex items-start gap-2.5 text-left"
                >
                  <span className={cn(
                    'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                    checked[item.id] ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 bg-white',
                  )} />
                  <span className="text-[12px] text-gray-700 leading-snug">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="px-4 pb-5 pt-2 flex flex-col gap-2">
              <button
                disabled={!allChecked}
                onClick={handleAgree}
                className={cn(
                  'w-full py-3 rounded-xl text-[13px] font-semibold transition-colors',
                  allChecked
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                )}
              >
                Agree and continue
              </button>
              <button
                onClick={goBack}
                className="w-full py-2.5 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

        </div>{/* /sliding track */}
      </div>
    </>
  );
}
