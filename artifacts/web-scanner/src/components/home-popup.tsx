/**
 * home-popup.tsx
 * 30%-wide centered popup floating over the scanner hero screen.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  User, RefreshCw, ScanLine, FileText,
  Settings, HelpCircle, ChevronRight,
} from 'lucide-react';
import { SignInSheet } from './sign-in-sheet';

interface Props {
  onClose: () => void;
}

const MENU_ITEMS = [
  { icon: <User      className="w-4 h-4" />, label: 'Account',  action: 'signin' as const },
  { icon: <RefreshCw className="w-4 h-4" />, label: 'Sync',     action: null },
  { icon: <ScanLine  className="w-4 h-4" />, label: 'Scan',     action: 'scan'   as const },
  { icon: <FileText  className="w-4 h-4" />, label: 'Doc Set.', action: null },
];

const BOTTOM_ITEMS = [
  { icon: <Settings    className="w-4 h-4" />, label: 'Settings', action: null },
  { icon: <HelpCircle  className="w-4 h-4" />, label: 'Help',     action: 'help'   as const },
];

export function HomePopup({ onClose }: Props) {
  const [, setLocation] = useLocation();
  const [signInOpen, setSignInOpen] = useState(false);

  function handleItem(action: 'signin' | 'scan' | 'help' | null) {
    if (action === 'signin') { setSignInOpen(true); return; }
    if (action === 'scan')   { onClose(); return; }
    if (action === 'help')   { window.open('mailto:support@privascan.app'); return; }
  }

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-[80]"
        style={{ background: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
      />

      {/* ── Popup card ── */}
      <div
        className="fixed z-[90] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          width: '30vw',
          minWidth: 110,
          maxWidth: 180,
          background: '#fff',
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center pt-4 pb-3 px-2 border-b border-gray-100">
          {/* App icon */}
          <div className="w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center shadow-sm mb-1.5">
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
              <path d="M2,12 L2,2 L12,2"     stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
              <path d="M36,2 L46,2 L46,12"   stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
              <path d="M2,36 L2,46 L12,46"   stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
              <path d="M46,36 L46,46 L36,46" stroke="#38bdf8" strokeWidth="3.5" fill="none" strokeLinecap="square"/>
              <rect x="13" y="9" width="22" height="30" rx="1.5" fill="#f1f5f9"/>
              <path d="M29,9 L35,15 L29,15 Z" fill="#cbd5e1"/>
              <path d="M29,9 L35,9 L35,15 Z" fill="#f1f5f9"/>
              <line x1="17" y1="20" x2="31" y2="20" stroke="#475569" strokeWidth="2"   strokeLinecap="round"/>
              <line x1="17" y1="24" x2="29" y2="24" stroke="#475569" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="17" y1="28" x2="31" y2="28" stroke="#475569" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="17" y1="32" x2="26" y2="32" stroke="#475569" strokeWidth="1.6" strokeLinecap="round"/>
              <line x1="7"  y1="24" x2="41" y2="24" stroke="#38bdf8" strokeWidth="2"  strokeLinecap="round" opacity="0.9"/>
            </svg>
          </div>
          <p className="font-bold text-[13px] tracking-tight text-gray-900 leading-none">
            Priva<span className="text-sky-400">Scan</span>
          </p>
          <p className="text-[9px] text-gray-400 mt-0.5 text-center leading-tight">
            Sign in for more
          </p>

          {/* Provider icons */}
          <div className="flex items-center gap-1.5 mt-2">
            {/* Google */}
            <button onClick={() => setSignInOpen(true)} className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 48 48" className="w-3.5 h-3.5"><path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.4-.2-2.7-.5-4z"/></svg>
            </button>
            {/* Apple */}
            <button onClick={() => setSignInOpen(true)} className="w-6 h-6 rounded-full bg-black flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 814 1000" className="w-3.5 h-3.5" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-161.8-109.3-100.9-193.7-100.9-288.5c0-167.8 109.3-256.6 216.7-256.6 69.4 0 127.3 45.4 170.8 45.4 41.3 0 106.2-48 187.7-48C643.3 192.3 740.7 230.8 788.1 340.9zm-130.2-89.5c0-71.5 69.3-131.5 69.3-132.9 0-.6-.7-.6-1.3-.6-65.9 0-156.6 73.3-156.6 158.2 0 69.4 56.9 128.4 126.3 128.4 0 0 1.3 0 1.3-.6.1-1.4-38.9-81.6-39-153.5z"/></svg>
            </button>
            {/* Phone */}
            <button onClick={() => setSignInOpen(true)} className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </button>
            {/* Email */}
            <button onClick={() => setSignInOpen(true)} className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            </button>
          </div>
        </div>

        {/* Main menu */}
        <div>
          {MENU_ITEMS.map((item, i) => (
            <button
              key={i}
              onClick={() => handleItem(item.action)}
              className="w-full flex items-center gap-1.5 px-2.5 py-2 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <span className="text-gray-400 shrink-0">{item.icon}</span>
              <span className="flex-1 text-left text-[11px] text-gray-700 font-medium truncate">{item.label}</span>
              <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-1.5 bg-gray-50 border-y border-gray-100" />

        {/* Bottom menu */}
        <div>
          {BOTTOM_ITEMS.map((item, i) => (
            <button
              key={i}
              onClick={() => handleItem(item.action)}
              className="w-full flex items-center gap-1.5 px-2.5 py-2 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <span className="text-gray-400 shrink-0">{item.icon}</span>
              <span className="flex-1 text-left text-[11px] text-gray-700 font-medium truncate">{item.label}</span>
              <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
            </button>
          ))}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-300 text-[8px] py-2">v1.0.0</p>
      </div>

      {/* Sign-in sheet (renders above popup backdrop) */}
      {signInOpen && <SignInSheet onClose={() => setSignInOpen(false)} />}
    </>
  );
}
