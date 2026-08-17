/**
 * home.tsx — PrivaScan Home (CamScanner-style, light theme)
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  UserCircle2, ChevronRight,
  User, RefreshCw, ScanLine, FileText, Settings, HelpCircle,
} from 'lucide-react';
import { SignInSheet } from '@/components/sign-in-sheet';

/* ── Provider icon row ───────────────────────────────────────────────────── */
function ProviderIcon({ type, onClick }: { type: 'google' | 'apple' | 'phone' | 'email'; onClick: () => void }) {
  const styles: Record<string, { bg: string; icon: React.ReactNode }> = {
    google: {
      bg: 'bg-white border border-gray-200',
      icon: (
        <svg viewBox="0 0 48 48" className="w-5 h-5">
          <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.4-.2-2.7-.5-4z"/>
        </svg>
      ),
    },
    apple: {
      bg: 'bg-black',
      icon: (
        <svg viewBox="0 0 814 1000" className="w-5 h-5" fill="white">
          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-161.8-109.3-100.9-193.7-100.9-288.5c0-167.8 109.3-256.6 216.7-256.6 69.4 0 127.3 45.4 170.8 45.4 41.3 0 106.2-48 187.7-48C643.3 192.3 740.7 230.8 788.1 340.9zm-130.2-89.5c0-71.5 69.3-131.5 69.3-132.9 0-.6-.7-.6-1.3-.6-65.9 0-156.6 73.3-156.6 158.2 0 69.4 56.9 128.4 126.3 128.4 0 0 1.3 0 1.3-.6.1-1.4-38.9-81.6-39-153.5z"/>
        </svg>
      ),
    },
    phone: {
      bg: 'bg-blue-500',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2"/>
          <line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
      ),
    },
    email: {
      bg: 'bg-emerald-500',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        </svg>
      ),
    },
  };

  const s = styles[type];
  return (
    <button
      onClick={onClick}
      className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${s.bg} transition-opacity active:opacity-70`}
    >
      {s.icon}
    </button>
  );
}

/* ── Menu row ────────────────────────────────────────────────────────────── */
function MenuItem({
  icon, label, onClick, divider = true,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  divider?: boolean;
}) {
  return (
    <>
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <span className="text-gray-500 w-5 h-5 flex items-center justify-center shrink-0">{icon}</span>
        <span className="flex-1 text-left text-[15px] text-gray-800">{label}</span>
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </button>
      {divider && <div className="h-px bg-gray-100 ml-12" />}
    </>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function HomeScreen() {
  const [, setLocation] = useLocation();
  const [signInOpen, setSignInOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white overflow-y-auto">

      {/* ── Profile icon — fixed top-right ── */}
      <button
        className="fixed top-0 right-0 z-50 mt-[14px] mr-4 w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
        aria-label="Profile"
      >
        <UserCircle2 className="w-6 h-6" />
      </button>

      {/* ── Header ── */}
      <div className="px-4 pt-14 pb-4 border-b border-gray-100">
        {/* Logo row */}
        <div className="flex items-center gap-2.5 mb-4">
          {/* App icon — white card with scanner SVG */}
          <div className="w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center shadow-sm shrink-0">
            <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
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
          {/* Name */}
          <span className="font-bold text-[22px] tracking-tight text-gray-900">
            Priva<span className="text-sky-400">Scan</span>
          </span>
        </div>

        {/* Sign-in banner */}
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-gray-500">Sign in to access more features</p>
          <div className="flex items-center gap-2">
            {(['google', 'apple', 'phone', 'email'] as const).map(p => (
              <ProviderIcon key={p} type={p} onClick={() => setSignInOpen(true)} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Menu ── */}
      <div className="flex-1">
        <div className="mt-2">
          <MenuItem icon={<User className="w-5 h-5" />}     label="Account"           onClick={() => setSignInOpen(true)} />
          <MenuItem icon={<RefreshCw className="w-5 h-5" />} label="Sync"              />
          <MenuItem icon={<ScanLine className="w-5 h-5" />}  label="Scan"              onClick={() => setLocation('/')} />
          <MenuItem icon={<FileText className="w-5 h-5" />}  label="Document Settings" />
        </div>

        {/* Divider */}
        <div className="h-2 bg-gray-50 border-y border-gray-100 my-2" />

        <div>
          <MenuItem icon={<Settings className="w-5 h-5" />}    label="More Settings" />
          <MenuItem icon={<HelpCircle className="w-5 h-5" />}  label="Help"          onClick={() => window.open('mailto:support@privascan.app')} divider={false} />
        </div>
      </div>

      {/* ── Footer ── */}
      <p className="text-center text-gray-300 text-[11px] py-6">
        © 2026 PrivaScan · v{__APP_VERSION__}
      </p>

      {/* ── Sign-in sheet ── */}
      {signInOpen && <SignInSheet onClose={() => setSignInOpen(false)} />}
    </div>
  );
}
