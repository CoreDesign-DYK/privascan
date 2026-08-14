/**
 * home.tsx — PrivaScan Home screen
 * Dark theme · commercial-ready sections
 */
import { useLocation } from 'wouter';
import {
  X, Crown, ChevronRight, Shield, FileText,
  HelpCircle, Star, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const APP_VERSION = '1.0.0';

/* ── small helpers ───────────────────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold tracking-widest text-white/30 uppercase px-1 mb-1">
      {children}
    </p>
  );
}

function Row({
  icon,
  label,
  sublabel,
  accent,
  onClick,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  accent?: boolean;
  onClick?: () => void;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3.5 px-4 py-3.5 transition-colors active:opacity-70',
        'hover:bg-white/5',
        !last && 'border-b border-white/6',
      )}
    >
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
        accent ? 'bg-sky-500/20 text-sky-400' : 'bg-white/8 text-white/50',
      )}>
        {icon}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className={cn('text-sm font-medium', accent ? 'text-sky-400' : 'text-white/90')}>
          {label}
        </p>
        {sublabel && (
          <p className="text-[11px] text-white/35 mt-0.5">{sublabel}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
    </button>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */
export default function HomeScreen() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-[100dvh] flex flex-col overflow-y-auto"
      style={{ background: '#0d0d14' }}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 pt-14 pb-2">
        <h1 className="text-white font-semibold text-lg tracking-tight">Home</h1>
        <button
          onClick={() => setLocation('/')}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 px-4 pb-12 space-y-6 mt-4">

        {/* ── App identity ── */}
        <div className="flex items-center gap-4 px-1 py-2">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #1e3a5f 100%)' }}
          >
            <FileText className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-xl tracking-tight">PrivaScan</p>
            <p className="text-white/40 text-sm mt-0.5">Your private document scanner</p>
            <p className="text-white/25 text-xs mt-1">Version {APP_VERSION}</p>
          </div>
        </div>

        {/* ── Subscription card ── */}
        <div
          className="rounded-2xl overflow-hidden border border-white/8"
          style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(30,58,95,0.18) 100%)' }}
        >
          <div className="px-4 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white font-semibold text-sm">Free Plan</p>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-white/50 uppercase">
                  Free
                </span>
              </div>
              <p className="text-white/40 text-xs mt-0.5">
                Upgrade to unlock unlimited scans
              </p>
            </div>
          </div>
          <div className="px-4 pb-4">
            <button
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 transition-colors text-white text-sm font-semibold"
              onClick={() => {/* RevenueCat paywall — coming soon */}}
            >
              Upgrade to Pro · €0.99 / month
            </button>
          </div>
        </div>

        {/* ── Legal ── */}
        <div>
          <SectionLabel>Legal</SectionLabel>
          <div className="rounded-2xl overflow-hidden border border-white/8 bg-white/4">
            <Row
              icon={<Shield className="w-4 h-4" />}
              label="Privacy Policy"
              sublabel="How we handle your data"
              onClick={() => setLocation('/privacy-policy')}
            />
            <Row
              icon={<FileText className="w-4 h-4" />}
              label="Terms of Service"
              sublabel="Usage terms & subscription rules"
              onClick={() => setLocation('/terms-of-service')}
              last
            />
          </div>
        </div>

        {/* ── Support ── */}
        <div>
          <SectionLabel>Support</SectionLabel>
          <div className="rounded-2xl overflow-hidden border border-white/8 bg-white/4">
            <Row
              icon={<HelpCircle className="w-4 h-4" />}
              label="Help & Support"
              sublabel="Get help or report an issue"
              onClick={() => {
                window.open('mailto:support@privascan.app', '_blank');
              }}
            />
            <Row
              icon={<Star className="w-4 h-4" />}
              label="Rate PrivaScan"
              sublabel="Leave a review on the App Store"
              onClick={() => {/* Store review link — coming soon */}}
              last
            />
          </div>
        </div>

        {/* ── About ── */}
        <div>
          <SectionLabel>About</SectionLabel>
          <div className="rounded-2xl overflow-hidden border border-white/8 bg-white/4">
            <Row
              icon={<Info className="w-4 h-4" />}
              label="About PrivaScan"
              sublabel={`Version ${APP_VERSION} · All data stays on your device`}
              last
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-white/20 text-[11px] pb-2">
          © 2026 PrivaScan · All rights reserved
        </p>
      </div>
    </div>
  );
}
